const IMMUTABLE_SOLVE_STARTER = "function solve(input) {\n  return input;\n}\n";

const UNSAFE_REDUCE_WITHOUT_INIT =
  /\.reduce\s*\(\s*\(([^)]*)\)\s*=>\s*[^,)]+\s*\)/;

/** Starter that defines solve() and does not throw on empty-array sample cases. */
export function resolveJavascriptSolveStarter(raw: string | null | undefined): string {
  const starter = typeof raw === "string" ? raw : "";
  if (!starter.trim()) return IMMUTABLE_SOLVE_STARTER;
  if (!/\bfunction\s+solve\b|\bconst\s+solve\b|\blet\s+solve\b|\bsolve\s*=/.test(starter)) {
    return IMMUTABLE_SOLVE_STARTER;
  }
  if (UNSAFE_REDUCE_WITHOUT_INIT.test(starter) && !/reduce\s*\([^)]+,\s*0\s*\)/.test(starter)) {
    return IMMUTABLE_SOLVE_STARTER;
  }
  return starter;
}

export { IMMUTABLE_SOLVE_STARTER };
