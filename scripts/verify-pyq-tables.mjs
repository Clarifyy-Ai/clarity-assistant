import https from "node:https";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF || "qzgvjrvtkwlzxpmlddkx";
if (!token) process.exit(1);

const body = JSON.stringify({
  query:
    "select table_name from information_schema.tables where table_schema='public' and table_name in ('previous_year_papers','previous_year_paper_questions','source_ingestion_jobs') order by table_name",
});

const req = https.request(
  {
    hostname: "api.supabase.com",
    path: `/v1/projects/${ref}/database/query`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  },
  (res) => {
    let data = "";
    res.on("data", (c) => (data += c));
    res.on("end", () => {
      console.log(res.statusCode, data.slice(0, 1000));
      process.exit(res.statusCode && res.statusCode < 300 ? 0 : 1);
    });
  },
);
req.write(body);
req.end();
