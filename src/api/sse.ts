export type ServerEvent = { event: string; data: string };

/** Splits a stream of server-sent events into events, across chunk borders. */
export class SseParser {
  private buffer = "";

  push(chunk: string): ServerEvent[] {
    this.buffer += chunk;
    const events: ServerEvent[] = [];
    for (;;) {
      const match = /\r?\n\r?\n/.exec(this.buffer);
      if (!match) return events;
      const block = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      const event = parseBlock(block);
      if (event) events.push(event);
    }
  }
}

function parseBlock(block: string): ServerEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") event = value;
    if (field === "data") data.push(value);
  }
  return data.length > 0 ? { event, data: data.join("\n") } : null;
}

/** Reads a response body as server-sent events. */
export async function readEvents(response: Response, handle: (event: ServerEvent) => void) {
  if (!response.body) return;
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const parser = new SseParser();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    parser.push(value).forEach(handle);
  }
}
