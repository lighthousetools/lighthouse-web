// The bridge to the Mac app, which hosts this web app in a WKWebView. In a browser it does not exist and
// every call here does nothing. The message shapes are described in the Mac app's docs/bridge.md.

type Message =
  | { type: "ready"; v: 1 }
  | { type: "badge"; count: number }
  | { type: "notify"; title: string; body?: string; route?: string; id?: string }
  | { type: "openExternal"; url: string }
  | { type: "org"; id: string | null };

type Handler = { postMessage: (message: Message) => void };

function handler(): Handler | undefined {
  return (globalThis as { webkit?: { messageHandlers?: { lighthouse?: Handler } } }).webkit?.messageHandlers?.lighthouse;
}

export const inNativeShell = () => !!handler();

export function post(message: Message) {
  try {
    handler()?.postMessage(message);
  } catch {
    // The app ignores what it cannot read; a failed post changes nothing here either.
  }
}

/** Opens a link outside the app: in the default browser in the Mac app, in a new tab elsewhere. */
export function openExternal(url: string) {
  if (inNativeShell()) post({ type: "openExternal", url });
  else window.open(url, "_blank", "noopener");
}

/**
 * Answers the app's menu commands. A command can carry more, such as `{ command: "org", id }` (also accepted as
 * `{ type: "org", id }`), which reaches the handler as its argument. Returns a function that stops listening.
 */
export function listenForCommands(commands: Record<string, (detail: Record<string, unknown>) => void>) {
  const listen = (event: Event) => {
    const detail = ((event as CustomEvent<Record<string, unknown>>).detail ?? {}) as Record<string, unknown>;
    const name = typeof detail.command === "string" ? detail.command : typeof detail.type === "string" ? detail.type : undefined;
    const run = name ? commands[name] : undefined;
    if (!run) return;
    event.preventDefault();
    run(detail);
  };
  addEventListener("lighthouse:command", listen);
  return () => removeEventListener("lighthouse:command", listen);
}

/** The ids that are new in `next` compared with `previous`. Nothing is new on the first load. */
export function newIds(previous: Set<string> | null, next: string[]) {
  return previous ? next.filter((id) => !previous.has(id)) : [];
}
