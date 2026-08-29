export async function withTimeout<T>(
  promise: Promise<T>,
  ms = 20000
): Promise<T> {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, ms);

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("Request timeout")), ms)
      ),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
