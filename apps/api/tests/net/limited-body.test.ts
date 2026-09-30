import { describe, expect, it } from "vitest";
import { readLimitedText } from "../../src/net/limited-body";

function streamOf(chunks: readonly Uint8Array[], failWith?: Error): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      if (failWith === undefined) {
        controller.close();
      } else {
        controller.error(failWith);
      }
    },
  });
}

describe("readLimitedText", () => {
  it("returns the text when the body fits the cap", async () => {
    expect(await readLimitedText(new Response("hello"), 5)).toEqual({ ok: true, text: "hello" });
  });

  it("returns an empty text for a response without a body", async () => {
    expect(await readLimitedText(new Response(null, { status: 204 }), 5)).toEqual({
      ok: true,
      text: "",
    });
  });

  it("stops with too_large once the streamed body exceeds the cap", async () => {
    const chunks = [new Uint8Array(4), new Uint8Array(4), new Uint8Array(4)];
    const outcome = await readLimitedText(new Response(streamOf(chunks)), 10);
    expect(outcome).toEqual({ ok: false, kind: "too_large", maxBytes: 10 });
  });

  it("rejects a declared content-length over the cap before reading", async () => {
    const response = new Response("tiny", { headers: { "content-length": "2000000" } });
    expect(await readLimitedText(response, 1_048_576)).toEqual({
      ok: false,
      kind: "too_large",
      maxBytes: 1_048_576,
    });
  });

  it("decodes UTF-8 split across chunks", async () => {
    const bytes = new TextEncoder().encode("é✓");
    const chunks = [bytes.slice(0, 1), bytes.slice(1, 3), bytes.slice(3)];
    expect(await readLimitedText(new Response(streamOf(chunks)), 16)).toEqual({
      ok: true,
      text: "é✓",
    });
  });

  it("types a stream failure as network and keeps the cause", async () => {
    const failure = new Error("socket hang up");
    const outcome = await readLimitedText(new Response(streamOf([], failure)), 10);
    expect(outcome).toEqual({ ok: false, kind: "network", cause: failure });
  });

  it("types a timeout abort during the read as timeout", async () => {
    const failure = new DOMException("The operation timed out.", "TimeoutError");
    const outcome = await readLimitedText(new Response(streamOf([], failure)), 10);
    expect(outcome).toEqual({ ok: false, kind: "timeout", cause: failure });
  });
});
