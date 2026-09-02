/**
 * Hostinger Mail API (REST). Token stays on the Edge — never returned to clients.
 * Send path: POST /api/v1/mailboxes/{id}/send (not SMTP).
 */

export const HOSTINGER_API_BASE = "https://api.mail.hostinger.com";
export const DEFAULT_HOSTINGER_MAIL_ADDRESS = "hello@trycareerpilot.com";

const REQUEST_TIMEOUT_MS = 20_000;

export function hostingerMailToken(): string {
  return (Deno.env.get("HOSTINGER_MAIL_API_TOKEN") ?? "").trim();
}

export function hostingerMailAddress(): string {
  const raw = (Deno.env.get("HOSTINGER_MAIL_ADDRESS") ?? DEFAULT_HOSTINGER_MAIL_ADDRESS).trim();
  return raw.toLowerCase();
}

export function isHostingerMailConfigured(): boolean {
  return hostingerMailToken().length > 0;
}

export type HostingerMailbox = {
  resourceId: string;
  address: string;
};

type MeEnvelope = {
  data?: {
    orderResourceId?: string;
    mailboxes?: HostingerMailbox[];
  };
};

export async function hostingerFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const token = hostingerMailToken();
  if (!token) {
    throw Object.assign(new Error("Hostinger Mail is not configured."), {
      code: "PROVIDER_UNAVAILABLE",
      status: 503,
    });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return await fetch(`${HOSTINGER_API_BASE}${path}`, {
      ...init,
      headers,
      signal: init?.signal ?? controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveMailbox(): Promise<HostingerMailbox> {
  const res = await hostingerFetch("/api/v1/me");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw Object.assign(new Error("Could not load Hostinger mailboxes."), {
      code: "PROVIDER_UNAVAILABLE",
      status: res.status >= 500 ? 503 : res.status,
      upstream: text.slice(0, 200),
    });
  }
  const body = (await res.json()) as MeEnvelope;
  const mailboxes = body.data?.mailboxes ?? [];
  const wanted = hostingerMailAddress();
  const match =
    mailboxes.find((m) => m.address.toLowerCase() === wanted) ?? mailboxes[0];
  if (!match?.resourceId) {
    throw Object.assign(new Error("No mailbox is available for this Hostinger token."), {
      code: "PROVIDER_UNAVAILABLE",
      status: 503,
    });
  }
  return match;
}

export function encodeFolder(folder: string): string {
  return encodeURIComponent(folder.trim() || "INBOX");
}

/** IMAP folder names for Auth + product mail tracking. Names only — no secrets. */
export const HOSTINGER_TRACKING_FOLDERS = [
  { name: "OTPs", label: "OTPs" },
  { name: "Verifications", label: "Verifications" },
  { name: "PasswordResets", label: "Password resets" },
  { name: "MagicLinks", label: "Magic links" },
  { name: "Notifications", label: "Notifications" },
  { name: "InterviewReminders", label: "Interview reminders" },
  { name: "Welcome", label: "Welcome" },
  { name: "Support", label: "Support" },
  { name: "Billing", label: "Billing" },
] as const;

export type HostingerFolder = {
  path?: string;
  name?: string;
  unreadCount?: number;
  messageCount?: number;
};

function folderMatchesTracking(folder: HostingerFolder, trackingName: string): boolean {
  const name = (folder.name ?? "").trim().toLowerCase();
  const path = (folder.path ?? "").trim().toLowerCase();
  const wanted = trackingName.toLowerCase();
  return name === wanted || path === wanted || path.endsWith(`.${wanted}`);
}

export async function listHostingerFolders(mailboxResourceId: string): Promise<HostingerFolder[]> {
  const out: HostingerFolder[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const res = await hostingerFetch(
      `/api/v1/mailboxes/${mailboxResourceId}/folders?page=${page}&perPage=100`,
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw Object.assign(new Error("Could not list folders."), {
        code: "PROVIDER_UNAVAILABLE",
        status: res.status >= 500 ? 503 : res.status,
        upstream: text.slice(0, 200),
      });
    }
    const body = (await res.json()) as {
      data?: HostingerFolder[];
      pagination?: { page?: number; totalPages?: number };
    };
    const rows = Array.isArray(body.data) ? body.data : [];
    out.push(...rows);
    const totalPages = body.pagination?.totalPages ?? 1;
    if (page >= totalPages || rows.length === 0) break;
  }
  return out;
}

export async function ensureTrackingFolders(mailboxResourceId: string): Promise<{
  created: string[];
  existing: string[];
  folders: HostingerFolder[];
}> {
  const folders = await listHostingerFolders(mailboxResourceId);
  const created: string[] = [];
  const existing: string[] = [];
  for (const spec of HOSTINGER_TRACKING_FOLDERS) {
    if (folders.some((folder) => folderMatchesTracking(folder, spec.name))) {
      existing.push(spec.name);
      continue;
    }
    const res = await hostingerFetch(`/api/v1/mailboxes/${mailboxResourceId}/folders`, {
      method: "POST",
      body: JSON.stringify({ name: spec.name }),
    });
    if (res.status === 201 || res.ok) {
      created.push(spec.name);
      continue;
    }
    const text = await res.text().catch(() => "");
    if (res.status === 409 || res.status === 422) {
      existing.push(spec.name);
      continue;
    }
    throw Object.assign(new Error(`Could not create folder ${spec.name}.`), {
      code: "PROVIDER_UNAVAILABLE",
      status: res.status >= 500 ? 503 : res.status,
      upstream: text.slice(0, 200),
    });
  }
  const refreshed = created.length > 0 ? await listHostingerFolders(mailboxResourceId) : folders;
  return { created, existing, folders: refreshed };
}

export async function sendHostingerEmail(opts: {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  displayName?: string;
  inReplyTo?: { uid: number; folder: string };
}): Promise<{ ok: boolean; status: number; error?: string }> {
  const mailbox = await resolveMailbox();
  const to = (Array.isArray(opts.to) ? opts.to : [opts.to])
    .map((addr) => addr.trim())
    .filter(Boolean);
  if (to.length === 0) {
    return { ok: false, status: 400, error: "Recipient is required." };
  }
  const payload: Record<string, unknown> = {
    to,
    displayName: opts.displayName ?? "Career Pilot",
    subject: opts.subject,
  };
  if (opts.html) payload.html = opts.html;
  if (opts.text) payload.text = opts.text;
  if (!opts.html && !opts.text) payload.text = opts.subject;
  if (opts.inReplyTo) payload.inReplyTo = opts.inReplyTo;

  const res = await hostingerFetch(
    `/api/v1/mailboxes/${mailbox.resourceId}/send`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  if (res.status === 204 || res.ok) {
    return { ok: true, status: res.status };
  }
  const text = await res.text().catch(() => "");
  return {
    ok: false,
    status: res.status,
    error: text.slice(0, 300) || `Hostinger send failed (${res.status}).`,
  };
}
