// One deadline covers both response headers and the complete JSON body.
export const JSON_REQUEST_TIMEOUT_MS = 15_000;

export async function fetchJson(
  url: string,
  signal: AbortSignal | undefined,
  fetcher: typeof fetch,
): Promise<unknown> {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Request aborted", "AbortError");
  const controller = new AbortController();
  let interrupt!: (reason: unknown) => void;
  const interrupted = new Promise<never>((_, reject) => { interrupt = reject; });
  const stop = (reason: unknown) => {
    // Settle even if a fetch implementation or body reader ignores abort.
    interrupt(reason);
    controller.abort(reason);
  };
  const onAbort = () => stop(signal?.reason ?? new DOMException("Request aborted", "AbortError"));
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => stop(new DOMException("Request timed out. Please try again.", "TimeoutError")), JSON_REQUEST_TIMEOUT_MS);
  try {
    return await Promise.race([
      (async () => {
        const response = await fetcher(url, {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (controller.signal.aborted) throw controller.signal.reason;
        if (!response.ok) throw new Error(`request failed with ${response.status}: ${url}`);
        return response.json();
      })(),
      interrupted,
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
