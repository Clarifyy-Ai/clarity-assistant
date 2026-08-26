import fs from "node:fs";

function load(p) {
  const o = {};
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
    o[t.slice(0, i).trim()] = v;
  }
  return o;
}

const local = load(".env.local");
const apiKey = local.RENDER_API_KEY;
const SERVICE_ID = "srv-da58j1qjobas73dtjbk0";
const headers = {
  Authorization: `Bearer ${apiKey}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

const list = await fetch(
  `https://api.render.com/v1/services/${SERVICE_ID}/deploys?limit=3`,
  { headers },
);
const listText = await list.text();
console.log("list", list.status, listText.slice(0, 500));

let deployId = null;
try {
  const parsed = JSON.parse(listText);
  const first = Array.isArray(parsed) ? parsed[0] : parsed[0]?.deploy || parsed;
  deployId = first?.id || first?.deploy?.id;
  console.log("latest", first?.status || first?.deploy?.status, deployId);
} catch (e) {
  console.log("parse_list_err", String(e));
}

// Trigger new deploy if latest is already live on old commit
const dep = await fetch(
  `https://api.render.com/v1/services/${SERVICE_ID}/deploys`,
  {
    method: "POST",
    headers,
    body: JSON.stringify({ clearCache: "do_not_clear" }),
  },
);
const depText = await dep.text();
console.log("create", dep.status, depText.slice(0, 400));
try {
  const j = JSON.parse(depText);
  deployId = j.id || j.deploy?.id || deployId;
} catch {
  /* keep previous */
}

if (!deployId) {
  console.error("no deploy id");
  process.exit(2);
}

for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 10000));
  const st = await fetch(
    `https://api.render.com/v1/services/${SERVICE_ID}/deploys/${deployId}`,
    { headers },
  );
  const text = await st.text();
  let status = "?";
  try {
    const j = JSON.parse(text);
    status = j.status || j.deploy?.status || "?";
  } catch {
    status = text.slice(0, 80);
  }
  console.log(`poll ${i + 1}`, status);
  if (status === "live" || status === "update_live") {
    console.log("READY", deployId);
    process.exit(0);
  }
  if (
    ["build_failed", "update_failed", "canceled", "deactivated"].includes(
      status,
    )
  ) {
    process.exit(4);
  }
}
process.exit(5);
