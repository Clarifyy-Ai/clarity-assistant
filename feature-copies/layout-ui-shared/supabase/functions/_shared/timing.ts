export function startTimer(): { elapsed: () => number } {
  const start = performance.now();
  return { elapsed: () => Math.round(performance.now() - start) };
}

export async function withTiming<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; durationMs: number }> {
  const timer = startTimer();
  const result = await fn();
  return { result, durationMs: timer.elapsed() };
}
