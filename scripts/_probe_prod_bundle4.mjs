const base = "https://trycareerpilot.com";
const html = await (await fetch(`${base}/app/mock-test`)).text();
const scripts = [...html.matchAll(/\/assets\/[^"']+\.js/g)].map((m) => m[0]);
const indexPath = scripts.find((p) => p.includes("/assets/index-")) || scripts[0];
const indexJs = await (await fetch(base + indexPath)).text();
const lazy = [...indexJs.matchAll(/assets\/[A-Za-z0-9_-]+\.js/g)].map(
  (m) => "/" + m[0],
);
const all = [...new Set([...scripts, ...lazy])];

const needles = [
  "ExamSearchCombobox",
  "mock-test/generate",
  "Which government exam",
  "SSC CGL",
  "RRB NTPC",
  "IBPS PO",
  "Generate paper",
  "Quick Drill",
  "govExamPrep",
  "Government Exams",
  "searchGovExams",
  "functions/v1/search-exams",
  "No exams found",
  "Request this exam",
  "fullSimulationAvailable",
  "bankReadiness",
];

const hits = Object.fromEntries(needles.map((n) => [n, []]));
let comboboxCtx = "";
for (const p of all) {
  const js = await (await fetch(base + p)).text();
  for (const n of needles) {
    if (js.includes(n)) hits[n].push(p);
  }
  const i = js.indexOf("ExamSearchCombobox");
  if (i >= 0) {
    comboboxCtx += `\n=== ${p} @${i} ===\n` + js.slice(Math.max(0, i - 100), i + 300);
  }
  const j = js.indexOf("Which government exam");
  if (j >= 0) {
    comboboxCtx += `\n=== HUB ${p} @${j} ===\n` + js.slice(j, j + 200);
  }
}
console.log(JSON.stringify(hits, null, 2));
console.log(comboboxCtx.slice(0, 4000));
