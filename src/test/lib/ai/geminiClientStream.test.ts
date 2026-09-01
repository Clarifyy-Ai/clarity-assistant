import { describe, expect, it } from "vitest";
import { consumeSSEStream } from "@/lib/ai/geminiClient";

function sseBody(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(event));
      }
      controller.close();
    },
  });
}

describe("consumeSSEStream", () => {
  it("parses text events incrementally and completes on [DONE]", async () => {
    const chunks: string[] = [];
    let done = "";
    await consumeSSEStream(
      sseBody([
        `data: ${JSON.stringify({ text: "Open" })}\n\n`,
        `data: ${JSON.stringify({ text: " with STAR" })}\n\n`,
        "data: [DONE]\n\n",
      ]),
      (chunk) => chunks.push(chunk),
      (full) => {
        done = full;
      },
      (err) => {
        throw err;
      },
    );
    expect(chunks.join("")).toBe("Open with STAR");
    expect(done).toBe("Open with STAR");
  });
});
