import fs from "fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(p) {
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

const local = loadEnv(".env.local");
const qa = loadEnv(".env.qa.local");
const url = local.VITE_SUPABASE_URL || qa.QA_SUPABASE_URL;
const anon = local.VITE_SUPABASE_ANON_KEY || local.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !anon) {
  console.error("missing url/anon");
  process.exit(1);
}

const accounts = [
  ["FREE", qa.QA_FREE_EMAIL, qa.QA_FREE_PASSWORD],
  ["PRO", qa.QA_PRO_EMAIL, qa.QA_PRO_PASSWORD],
  ["MAX", qa.QA_MAX_EMAIL, qa.QA_MAX_PASSWORD],
  ["ADMIN", qa.QA_ADMIN_EMAIL, qa.QA_ADMIN_PASSWORD],
];

for (const [role, email, password] of accounts) {
  if (!email || !password) {
    console.log(`${role} FAIL missing credentials in .env.qa.local`);
    continue;
  }
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    console.log(`${role} FAIL ${error.message}`);
  } else {
    console.log(
      `${role} OK email=${email} session=${Boolean(data.session?.access_token)}`,
    );
    await client.auth.signOut();
  }
}
