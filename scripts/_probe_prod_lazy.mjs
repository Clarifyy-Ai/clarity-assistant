const base = "https://trycareerpilot.com";
const assets = [
  "/assets/ExamSearchCombobox-L2YcOPMO.js",
  "/assets/MockTestHub-Uapa_NbC.js",
  "/assets/api-CcEcP4ES.js",
  "/assets/bankReadiness-BFnDQ4LA.js",
];

const needles = [
  "cancelled|aborted",
  "Exam search is temporarily unavailable",
  "Too many searches",
  "Request this exam",
  "No exams found",
  "Searching…",
  "browseWhenEmpty",
  "onResultsChange",
  "search-exams",
  "mapGovSearchError",
  "Which government exam",
  "Generate paper",
  "Quick Drill",
  "gov-exam-search-results",
  "AbortController",
];

for (const p of assets) {
  const r = await fetch(base + p);
  console.log("\n====", p, r.status, "====");
  if (!r.ok) continue;
  const js = await r.text();
  console.log("len", js.length);
  for (const n of needles) {
    const i = js.indexOf(n);
    if (i >= 0) console.log("HIT", JSON.stringify(n), "@", i);
  }
  const i = js.indexOf("Searching");
  if (i >= 0) console.log("CTX", js.slice(Math.max(0, i - 120), i + 250));
}
