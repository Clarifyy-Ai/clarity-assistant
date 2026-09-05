const base = "https://trycareerpilot.com";
const js = await (
  await fetch(base + "/assets/ExamSearchCombobox-L2YcOPMO.js")
).text();

// Dump function around AbortController / useCallback deps
const a = js.indexOf("AbortController");
console.log("--- around AbortController ---");
console.log(js.slice(Math.max(0, a - 400), a + 900));

const b = js.indexOf("cancelled|aborted");
console.log("\n--- around cancelled regex ---");
console.log(js.slice(Math.max(0, b - 300), b + 400));

// Look for dependency array patterns near search
const c = js.indexOf("browseWhenEmpty");
console.log("\n--- browseWhenEmpty occurrences ---");
let idx = 0;
while ((idx = js.indexOf("browseWhenEmpty", idx)) >= 0) {
  console.log(js.slice(idx, idx + 80));
  idx += 1;
}
