#!/usr/bin/env node
/**
 * Probe local .env.local provider keys + public edge health.
 * Never prints full secrets — only masked prefixes and pass/fail.
 */
import fs from "node:fs";

const envPath = ".env.local";
if (!fs.existsSync(envPath)) {
  console.error("Missing .env.local");
  process.exit(1);
}

const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  env[m[1]] = v;
}

function mask(v) {
  if (!v) return "(empty)";
  return `${v.slice(0, 4)}…${v.slice(-4)} len=${v.length}`;
}

function looksPlaceholder(v) {
  if (!v) return true;
  return (
    /your-|placeholder|xxx|changeme|example|TODO|REPLACE|sk-xxx|AIzaSyXXX/i.test(
      v,
    ) || v.length < 24
  );
}

async function check(name, fn) {
  try {
    const r = await fn();
    console.log(JSON.stringify({ check: name, ...r }));
  } catch (e) {
    console.log(
      JSON.stringify({
        check: name,
        ok: false,
        error: String(e?.message || e).slice(0, 200),
      }),
    );
  }
}

console.log(
  JSON.stringify({
    local_keys: {
      GEMINI: mask(env.GEMINI_API_KEY),
      gemini_suspect: looksPlaceholder(env.GEMINI_API_KEY),
      OPENAI: mask(env.OPENAI_API_KEY),
      openai_suspect: looksPlaceholder(env.OPENAI_API_KEY),
      ANTHROPIC: mask(env.ANTHROPIC_API_KEY),
      anthropic_suspect: looksPlaceholder(env.ANTHROPIC_API_KEY),
      DEEPGRAM: mask(env.DEEPGRAM_API_KEY),
      deepgram_suspect: looksPlaceholder(env.DEEPGRAM_API_KEY),
      STRIPE: mask(env.STRIPE_SECRET_KEY),
      stripe_suspect: looksPlaceholder(env.STRIPE_SECRET_KEY),
    },
  }),
);

await check("gemini_local", async () => {
  const key = env.GEMINI_API_KEY;
  if (looksPlaceholder(key)) return { ok: false, error: "placeholder_or_too_short" };
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models?key=" +
    encodeURIComponent(key);
  const res = await fetch(url);
  const text = await res.text();
  return {
    ok: res.ok,
    status: res.status,
    body: text.slice(0, 140).replace(/\s+/g, " "),
  };
});

await check("openai_local", async () => {
  const key = env.OPENAI_API_KEY;
  if (looksPlaceholder(key)) return { ok: false, error: "placeholder_or_too_short" };
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: "Bearer " + key },
  });
  const text = await res.text();
  return {
    ok: res.ok,
    status: res.status,
    body: text.slice(0, 140).replace(/\s+/g, " "),
  };
});

await check("anthropic_local", async () => {
  const key = env.ANTHROPIC_API_KEY;
  if (looksPlaceholder(key)) return { ok: false, error: "placeholder_or_too_short" };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 8,
      messages: [{ role: "user", content: "ping" }],
    }),
  });
  const text = await res.text();
  return {
    ok: res.ok,
    status: res.status,
    body: text.slice(0, 160).replace(/\s+/g, " "),
  };
});

await check("deepgram_local", async () => {
  const key = env.DEEPGRAM_API_KEY;
  if (looksPlaceholder(key)) return { ok: false, error: "placeholder_or_too_short" };
  const res = await fetch("https://api.deepgram.com/v1/projects", {
    headers: { Authorization: "Token " + key },
  });
  const text = await res.text();
  return {
    ok: res.ok,
    status: res.status,
    body: text.slice(0, 140).replace(/\s+/g, " "),
  };
});

await check("stripe_local", async () => {
  const key = env.STRIPE_SECRET_KEY;
  if (looksPlaceholder(key)) return { ok: false, error: "placeholder_or_too_short" };
  const res = await fetch("https://api.stripe.com/v1/balance", {
    headers: { Authorization: "Bearer " + key },
  });
  const text = await res.text();
  return {
    ok: res.ok,
    status: res.status,
    body: text.slice(0, 140).replace(/\s+/g, " "),
  };
});

const base = (env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const anon =
  env.VITE_SUPABASE_ANON_KEY ||
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.SUPABASE_ANON_KEY ||
  "";

await check("edge_health", async () => {
  const res = await fetch(base + "/functions/v1/health");
  const text = await res.text();
  return {
    ok: res.ok,
    status: res.status,
    body: text.slice(0, 220).replace(/\s+/g, " "),
  };
});

await check("edge_ping", async () => {
  const headers = {};
  if (anon) {
    headers.Authorization = "Bearer " + anon;
    headers.apikey = anon;
  }
  const res = await fetch(base + "/functions/v1/ping", { headers });
  const text = await res.text();
  return {
    ok: res.ok,
    status: res.status,
    body: text.slice(0, 220).replace(/\s+/g, " "),
  };
});

// Auth as QA user if credentials exist, then hit generate-questions lightly
const email = env.QA_USER_EMAIL || env.VITE_QA_USER_EMAIL || "";
const password = env.QA_USER_PASSWORD || env.VITE_QA_USER_PASSWORD || "";
if (email && password && anon && base) {
  await check("edge_generate_questions", async () => {
    const authRes = await fetch(base + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: {
        apikey: anon,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });
    const authJson = await authRes.json();
    if (!authRes.ok || !authJson.access_token) {
      return {
        ok: false,
        status: authRes.status,
        error: String(authJson.error_description || authJson.msg || authJson.error || "auth_failed").slice(0, 120),
      };
    }
    const res = await fetch(base + "/functions/v1/generate-questions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + authJson.access_token,
        apikey: anon,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "behavioral",
        count: 2,
        role: "Software Engineer",
        company: "Career Pilot",
        free_session: true,
      }),
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      body: text.slice(0, 260).replace(/\s+/g, " "),
    };
  });
} else {
  console.log(
    JSON.stringify({
      check: "edge_generate_questions",
      ok: false,
      error: "skipped_no_qa_credentials",
    }),
  );
}
