/**
 * Lost-device MFA recovery. Requires an existing AAL1 session (password/OAuth).
 * Email OTP is not accepted as a TOTP substitute.
 *
 * Actions:
 *   issue_codes | status | consume_code | start_email | confirm_email | complete_enroll
 */
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, createServiceRoleClient } from "../_shared/auth.ts";
import { enforceRateLimitAsync } from "../_shared/rateLimit.ts";
import { isHostingerMailConfigured, sendHostingerEmail } from "../_shared/hostingerMail.ts";
import { emailButton, publicAppUrl, wrapCareerPilotEmail } from "../_shared/emailLayout.ts";

const CODE_COUNT = 10;

function json(req: Request, body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function pepper(): string {
  const explicit = (Deno.env.get("MFA_RECOVERY_PEPPER") ?? "").trim();
  if (explicit) return explicit;
  const role = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  return `cp-mfa-recovery:${role.slice(0, 48)}`;
}

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeCode(raw: string): string {
  return String(raw ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

async function hashSecret(raw: string): Promise<string> {
  return sha256Hex(`${pepper()}:${normalizeCode(raw)}`);
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Supabase access tokens include `aal` after MFA verify. Do not trust client flags. */
function jwtAal(accessToken: string): string {
  try {
    const part = accessToken.split(".")[1];
    if (!part) return "";
    const padded = part.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (part.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { aal?: unknown };
    return typeof payload.aal === "string" ? payload.aal.toLowerCase() : "";
  } catch {
    return "";
  }
}

function requireAal2(req: Request, accessToken: string): Response | null {
  if (jwtAal(accessToken) === "aal2") return null;
  return json(req, {
    error: "Verify your authenticator first.",
    code: "AAL2_REQUIRED",
  }, 403);
}

async function audit(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  action: string,
  status: "success" | "failure" | "blocked",
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const safe = { ...metadata };
  delete safe.code;
  delete safe.token;
  delete safe.secret;
  await admin.from("mfa_security_events").insert({
    user_id: userId,
    action,
    status,
    metadata: safe,
  });
}

async function listTotpFactors(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
): Promise<Array<{ id: string; status: string; factor_type: string }>> {
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
  if (error) throw error;
  const factors = (data as { factors?: Array<{ id: string; status: string; factor_type: string }> })
    ?.factors ?? [];
  return factors.filter((f) => f.factor_type === "totp");
}

async function revokeTotpFactors(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
): Promise<number> {
  const factors = await listTotpFactors(admin, userId);
  let removed = 0;
  for (const factor of factors) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId,
    });
    if (!error) removed += 1;
  }
  return removed;
}

async function finishRecovery(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  method: string,
): Promise<{ revoked: number }> {
  // Fail-closed order: lock re-enrollment BEFORE deleting TOTP factors.
  // Never revoke MFA if the server flag cannot be persisted.
  const { data: flagged, error: flagErr } = await admin
    .from("profiles")
    .update({ mfa_reenrollment_required: true })
    .eq("id", userId)
    .select("id")
    .maybeSingle();
  if (flagErr || !flagged) {
    await audit(admin, userId, "recovery_failed", "failure", {
      method,
      reason: "reenrollment_flag",
    });
    throw new Error("Could not require MFA re-enrollment. Recovery aborted.");
  }
  await audit(admin, userId, "reenrollment_required", "success", {});

  const revoked = await revokeTotpFactors(admin, userId);
  try {
    await admin.auth.admin.signOut(userId, "others");
  } catch {
    /* best-effort */
  }
  await audit(admin, userId, "recovery_completed", "success", { method, revoked });
  await audit(admin, userId, "mfa_factor_revoked", "success", { count: revoked });
  await audit(admin, userId, "sessions_revoked", "success", { scope: "others" });
  return { revoked };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors(req);

  const auth = await authenticateRequest(req);
  if (auth.error) return auth.error;
  const userId = auth.context.user.id;
  const email = auth.context.user.email;

  const admin = createServiceRoleClient();

  let body: { action?: string; code?: string; token?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }
  const action = String(body.action ?? "").trim();

  if (action !== "status") {
    const limited = await enforceRateLimitAsync(admin, {
      key: `mfa-recovery:${userId}`,
      limit: 8,
      windowMs: 15 * 60 * 1000,
    }, req);
    if (limited) return limited;
  }

  try {
    if (action === "status") {
      const { count } = await admin
        .from("mfa_recovery_codes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("used_at", null);
      const { data: profile } = await admin
        .from("profiles")
        .select("mfa_reenrollment_required")
        .eq("id", userId)
        .maybeSingle();
      const factors = await listTotpFactors(admin, userId);
      return json(req, {
        unused_codes: count ?? 0,
        reenrollment_required: profile?.mfa_reenrollment_required === true,
        verified_totp: factors.some((f) => f.status === "verified"),
      });
    }

    if (action === "issue_codes") {
      const aalBlocked = requireAal2(req, auth.context.accessToken);
      if (aalBlocked) return aalBlocked;
      const factors = await listTotpFactors(admin, userId);
      if (!factors.some((f) => f.status === "verified")) {
        await audit(admin, userId, "recovery_codes_issued", "blocked", { reason: "no_verified_totp" });
        return json(req, { error: "Enable authenticator MFA before generating recovery codes.", code: "MFA_NOT_VERIFIED" }, 403);
      }
      const codes: string[] = [];
      const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
      while (codes.length < CODE_COUNT) {
        const bytes = new Uint32Array(10);
        crypto.getRandomValues(bytes);
        let bodyCode = "";
        for (let i = 0; i < 10; i += 1) bodyCode += alphabet[bytes[i] % alphabet.length];
        const formatted = `${bodyCode.slice(0, 5)}-${bodyCode.slice(5)}`;
        if (!codes.includes(formatted)) codes.push(formatted);
      }
      const { data: setRow, error: setErr } = await admin
        .from("mfa_recovery_code_sets")
        .insert({ user_id: userId, remaining_count: CODE_COUNT })
        .select("id")
        .single();
      if (setErr || !setRow) throw setErr ?? new Error("set_insert");
      await admin.from("mfa_recovery_codes").delete().eq("user_id", userId).is("used_at", null);
      const rows = await Promise.all(
        codes.map(async (code) => ({
          user_id: userId,
          set_id: setRow.id as string,
          code_hash: await hashSecret(code),
        })),
      );
      const { error: insErr } = await admin.from("mfa_recovery_codes").insert(rows);
      if (insErr) throw insErr;
      await audit(admin, userId, "recovery_codes_regenerated", "success", { count: codes.length });
      return json(req, { codes });
    }

    if (action === "consume_code") {
      const normalized = normalizeCode(body.code ?? "");
      if (normalized.length < 8) {
        await audit(admin, userId, "recovery_failed", "failure", { method: "code", reason: "malformed" });
        return json(req, { error: "Enter a recovery code.", code: "INVALID_CODE" }, 400);
      }
      const codeHash = await hashSecret(normalized);
      const { data: row } = await admin
        .from("mfa_recovery_codes")
        .select("id")
        .eq("user_id", userId)
        .eq("code_hash", codeHash)
        .is("used_at", null)
        .maybeSingle();
      if (!row) {
        await audit(admin, userId, "recovery_failed", "failure", { method: "code" });
        return json(req, { error: "That recovery code is invalid or already used.", code: "INVALID_CODE" }, 400);
      }
      const { data: consumed, error: consumeErr } = await admin
        .from("mfa_recovery_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("id", row.id)
        .is("used_at", null)
        .select("id")
        .maybeSingle();
      if (consumeErr || !consumed) {
        await audit(admin, userId, "recovery_failed", "failure", { method: "code", reason: "race" });
        return json(req, { error: "That recovery code is invalid or already used.", code: "INVALID_CODE" }, 400);
      }
      const result = await finishRecovery(admin, userId, "recovery_code");
      return json(req, { ok: true, next: "enroll", ...result });
    }

    if (action === "start_email") {
      if (!email) {
        return json(req, { error: "No verified email on this account.", code: "NO_EMAIL" }, 400);
      }
      const token = randomToken();
      const tokenHash = await hashSecret(token);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await admin
        .from("mfa_recovery_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("used_at", null);
      await admin.from("mfa_recovery_tokens").insert({
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });
      const origin = publicAppUrl();
      const link = `${origin}/auth/mfa-recovery?token=${encodeURIComponent(token)}`;
      const html = wrapCareerPilotEmail(
        `<p>Someone started authenticator recovery on your Career Pilot account.</p>
         <p>If this was you, confirm from the device where you already signed in with your password:</p>
         ${emailButton(link, "Confirm MFA recovery")}
         <p style="margin-top:16px;font-size:13px;color:#64748b;">This link expires in 15 minutes. It does not skip two-factor setup — you must enroll a new authenticator afterwards.</p>`,
        { preheader: "Confirm authenticator recovery" },
      );
      if (isHostingerMailConfigured()) {
        const sent = await sendHostingerEmail({
          to: email,
          subject: "Confirm authenticator recovery",
          html,
        });
        if (!sent.ok) {
          await audit(admin, userId, "recovery_started", "failure", { method: "email" });
          return json(req, { error: "Could not send the recovery email. Try a recovery code.", code: "MAIL_FAILED" }, 503);
        }
      } else {
        await audit(admin, userId, "recovery_started", "blocked", { method: "email", reason: "mail_unconfigured" });
        return json(req, { error: "Email recovery is not configured. Use a recovery code.", code: "MAIL_UNCONFIGURED" }, 503);
      }
      await audit(admin, userId, "recovery_started", "success", { method: "email" });
      return json(req, { ok: true, sent: true });
    }

    if (action === "confirm_email") {
      const token = String(body.token ?? "").trim();
      if (token.length < 16) {
        return json(req, { error: "This recovery link is invalid.", code: "INVALID_TOKEN" }, 400);
      }
      const tokenHash = await hashSecret(token);
      const { data: row } = await admin
        .from("mfa_recovery_tokens")
        .select("id, expires_at")
        .eq("user_id", userId)
        .eq("token_hash", tokenHash)
        .is("used_at", null)
        .maybeSingle();
      if (!row) {
        await audit(admin, userId, "recovery_failed", "failure", { method: "email" });
        return json(req, { error: "This recovery link is invalid or already used.", code: "INVALID_TOKEN" }, 400);
      }
      if (new Date(row.expires_at as string).getTime() < Date.now()) {
        await audit(admin, userId, "recovery_failed", "failure", { method: "email", reason: "expired" });
        return json(req, { error: "This recovery link has expired. Request a new one.", code: "EXPIRED" }, 400);
      }
      const { data: consumed, error: consumeErr } = await admin
        .from("mfa_recovery_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("id", row.id)
        .is("used_at", null)
        .select("id")
        .maybeSingle();
      if (consumeErr || !consumed) {
        return json(req, { error: "This recovery link is invalid or already used.", code: "INVALID_TOKEN" }, 400);
      }
      const result = await finishRecovery(admin, userId, "email");
      return json(req, { ok: true, next: "enroll", ...result });
    }

    if (action === "complete_enroll") {
      const aalBlocked = requireAal2(req, auth.context.accessToken);
      if (aalBlocked) return aalBlocked;
      const factors = await listTotpFactors(admin, userId);
      if (!factors.some((f) => f.status === "verified")) {
        return json(req, { error: "Verify the new authenticator before finishing.", code: "MFA_NOT_VERIFIED" }, 403);
      }
      await admin.from("profiles").update({ mfa_reenrollment_required: false }).eq("id", userId);
      await audit(admin, userId, "reenrollment_completed", "success", {});
      await audit(admin, userId, "mfa_enrolled", "success", {});
      return json(req, { ok: true });
    }

    return json(req, { error: "Unknown action.", code: "INVALID_ACTION" }, 400);
  } catch (err) {
    console.error("[mfa-recovery]", err instanceof Error ? err.message : "error");
    await audit(admin, userId, "recovery_failed", "failure", { reason: "exception" }).catch(() => undefined);
    return json(req, { error: "Recovery could not be completed. Try again.", code: "SERVER_ERROR" }, 500);
  }
});
