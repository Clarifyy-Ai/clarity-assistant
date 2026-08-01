import https from "node:https";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF || "qzgvjrvtkwlzxpmlddkx";
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN required");
  process.exit(1);
}

const body = JSON.stringify({
  query:
    "select code, name, family, review_state, is_public from gov_exams where family = 'state_psc' or code like 'APPSC%' order by code",
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
      console.log(res.statusCode, data.slice(0, 2000));
      process.exit(res.statusCode && res.statusCode < 300 ? 0 : 1);
    });
  },
);
req.on("error", (e) => {
  console.error(e.message);
  process.exit(1);
});
req.write(body);
req.end();
