const base = "https://clarify.ai.sltfinanceindia.com";
const html = await (await fetch(`${base}/app/mock-test`)).text();
const scripts = [...html.matchAll(/\/assets\/[^"']+\.js/g)].map((m) => m[0]);
const indexPath = scripts.find((p) => p.includes("/assets/index-")) || scripts[0];
const indexJs = await (await fetch(base + indexPath)).text();
const lazy = [...indexJs.matchAll(/assets\/[A-Za-z0-9_-]+\.js/g)].map(
  (m) => "/" + m[0],
);
const all = [...new Set([...scripts, ...lazy])];

const needles = [
  "cancelled|aborted",
  "Request was cancelled",
  "Exam search is temporarily unavailable",
  "Too many searches",
  "onResultsChange",
  "browseWhenEmpty",
  "Bank ",
  "Request this exam",
  "gov-exam-search-results",
  "clarify:auth:profile",
  "load_timed_out",
  "Profile load",
];

const hits = Object.fromEntries(needles.map((n) => [n, []]));
for (const p of all) {
  const js = await (await fetch(base + p)).text();
  for (const n of needles) {
    if (js.includes(n)) hits[n].push(`${p}#${js.indexOf(n)}`);
  }
}
console.log(JSON.stringify(hits, null, 2));

// Extract a slice around Searching from bootstrap
const boot = all.find((p) => p.includes("bootstrap"));
if (boot) {
  const js = await (await fetch(base + boot)).text();
  const i = js.indexOf("Searching");
  console.log("SEARCHING_CONTEXT", js.slice(Math.max(0, i - 200), i + 400));
}
