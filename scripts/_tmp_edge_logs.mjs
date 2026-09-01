const REF = process.env.SUPABASE_PROJECT_REF || "qzgvjrvtkwlzxpmlddkx";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const start = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
const end = new Date().toISOString();
const sql =
  "select id, timestamp, event_message from edge_logs order by timestamp desc limit 25";
const url =
  `https://api.supabase.com/v1/projects/${REF}/analytics/endpoints/logs.all` +
  `?iso_timestamp_start=${encodeURIComponent(start)}` +
  `&iso_timestamp_end=${encodeURIComponent(end)}` +
  `&sql=${encodeURIComponent(sql)}`;

const r = await fetch(url, {
  headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
});
const body = await r.json();
console.log("status", r.status, "rows", (body.result || []).length);
for (const row of body.result || []) {
  const ts = row.timestamp
    ? new Date(Number(row.timestamp) / 1000).toISOString()
    : "?";
  console.log(ts, String(row.event_message || "").slice(0, 200));
}

const fns = await fetch(`https://api.supabase.com/v1/projects/${REF}/functions`, {
  headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
});
const list = await fns.json();
const inactive = list.filter((f) => String(f.status).toUpperCase() !== "ACTIVE");
console.log("\nfunctions", list.length, "inactive", inactive.length);
const newest = [...list]
  .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
  .slice(0, 8);
for (const f of newest) {
  console.log(f.slug, "v" + f.version, f.status, f.updated_at);
}
const auto = list.find((f) => f.slug === "evaluate-auto-approval");
console.log("evaluate-auto-approval", auto);
