const base = "https://trycareerpilot.com";
const html = await (await fetch(`${base}/app/mock-test`)).text();
const scripts = [...html.matchAll(/\/assets\/[^"']+\.js/g)].map((m) => m[0]);
console.log("script_count", scripts.length, "sample", scripts.slice(0, 5));

let foundRef = false;
let foundSearching = false;
let checked = 0;
for (const p of scripts.slice(0, 30)) {
  const js = await (await fetch(base + p)).text();
  checked++;
  if (js.includes("onResultsChangeRef")) foundRef = true;
  if (js.includes("Searching") && js.includes("search-exams")) {
    foundSearching = true;
    console.log(
      "candidate",
      p,
      "onResultsChangeRef",
      js.includes("onResultsChangeRef"),
      "familyRef",
      js.includes("familyRef"),
    );
  }
  if (foundRef) {
    console.log("FOUND_FIX_IN", p);
    break;
  }
}
console.log({ checked, foundRef, foundSearching });
