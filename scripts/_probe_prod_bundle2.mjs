const base = "https://clarify.ai.sltfinanceindia.com";
const html = await (await fetch(`${base}/app/mock-test`)).text();
const scripts = [...html.matchAll(/\/assets\/[^"']+\.js/g)].map((m) => m[0]);

// Also pull import refs from main index bundle
const indexPath = scripts.find((p) => p.includes("/assets/index-")) || scripts[0];
const indexJs = await (await fetch(base + indexPath)).text();
const lazy = [
  ...indexJs.matchAll(/assets\/[A-Za-z0-9_-]+\.js/g),
].map((m) => "/" + m[0]);
const all = [...new Set([...scripts, ...lazy])];
console.log("all_assets", all.length);

const needles = [
  "onResultsChangeRef",
  "ExamSearchCombobox",
  "search-exams",
  "Searching…",
  "Searching...",
  "familyRef",
  "mapGovSearchError",
];
const hits = {};
for (const n of needles) hits[n] = [];

for (const p of all) {
  let js;
  try {
    js = await (await fetch(base + p)).text();
  } catch (e) {
    console.log("fetch_fail", p, String(e));
    continue;
  }
  for (const n of needles) {
    if (js.includes(n)) hits[n].push(p);
  }
}
console.log(JSON.stringify(hits, null, 2));
