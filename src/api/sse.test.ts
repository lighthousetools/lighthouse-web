import { describe, expect, it } from "vitest";
import { SseParser } from "./sse";

describe("SseParser", () => {
  it("reads events across chunk borders", () => {
    const parser = new SseParser();
    expect(parser.push("event: del")).toEqual([]);
    expect(parser.push('ta\ndata: {"text":"Hi"}\n\nevent: done\n')).toEqual([
      { event: "delta", data: '{"text":"Hi"}' },
    ]);
    expect(parser.push("data: {}\n\n")).toEqual([{ event: "done", data: "{}" }]);
  });

  it("skips comments and joins data lines", () => {
    const parser = new SseParser();
    expect(parser.push(": keep alive\n\ndata: a\ndata: b\r\n\r\n")).toEqual([
      { event: "message", data: "a\nb" },
    ]);
  });
});
