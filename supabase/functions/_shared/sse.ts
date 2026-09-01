/**
 * Shared SSE helpers for live hint/answer streaming.
 * Client consumeSSEStream reads `data: {"text":"..."}` then `data: [DONE]`.
 */

const encoder = new TextEncoder();

export function requestWantsSse(req: Request): boolean {
  const accept = (req.headers.get("Accept") ?? "").toLowerCase();
  return accept.includes("text/event-stream");
}

export function sseHeaders(
  corsHeaders: HeadersInit,
  source?: string,
): Headers {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "text/event-stream");
  headers.set("Cache-Control", "no-cache, no-transform");
  headers.set("Connection", "keep-alive");
  headers.set("X-Accel-Buffering", "no");
  if (source === "python" || source === "python_structured") {
    headers.set("X-Clarify-Source", "python_structured");
  } else if (source) {
    headers.set("X-Clarify-Source", source);
  }
  return headers;
}

export function encodeSseData(payload: unknown): Uint8Array {
  if (payload === "[DONE]") {
    return encoder.encode("data: [DONE]\n\n");
  }
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export type SseWriter = {
  sendJson: (obj: Record<string, unknown>) => void;
  sendText: (text: string) => void;
  sendDone: () => void;
  close: () => void;
};

/**
 * Replay a complete string as SSE chunks (cache / Python / deterministic).
 */
export function sseFromText(
  text: string,
  corsHeaders: HeadersInit,
  source: string,
  chunkSize = 24,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      if (
        source === "python" ||
        source === "python_structured" ||
        source === "fallback"
      ) {
        controller.enqueue(
          encodeSseData({
            source: source === "python" ? "python_structured" : source,
          }),
        );
      }
      const value = text ?? "";
      for (let i = 0; i < value.length; i += chunkSize) {
        controller.enqueue(
          encodeSseData({ text: value.slice(i, i + chunkSize) }),
        );
        await new Promise((r) => setTimeout(r, 0));
      }
      controller.enqueue(encodeSseData("[DONE]"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: sseHeaders(corsHeaders, source),
  });
}

/**
 * Open an SSE body immediately and let the caller emit tokens as they arrive.
 */
export function createSseStreamResponse(opts: {
  corsHeaders: HeadersInit;
  source?: string;
  start: (writer: SseWriter) => Promise<void>;
}): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const writer: SseWriter = {
        sendJson: (obj) => {
          if (closed) return;
          controller.enqueue(encodeSseData(obj));
        },
        sendText: (text) => {
          if (closed || !text) return;
          controller.enqueue(encodeSseData({ text }));
        },
        sendDone: () => {
          if (closed) return;
          controller.enqueue(encodeSseData("[DONE]"));
        },
        close: () => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        },
      };
      try {
        await opts.start(writer);
      } catch (err) {
        console.warn(
          "[sse] stream start failed",
          err instanceof Error ? err.message : String(err),
        );
        try {
          writer.sendDone();
        } catch {
          /* ignore */
        }
      } finally {
        writer.close();
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: sseHeaders(opts.corsHeaders, opts.source),
  });
}
