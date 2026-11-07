// The bridge to the Mac app, which hosts this web app in a WKWebView. In a browser it does not exist and
// every call here does nothing. The message shapes are described in the Mac app's docs/bridge.md.

type Message =
  | { type: "ready"; v: 1 }
  | { type: "badge"; count: number }
  | { type: "notify"; title: string; body?: string; route?: string; id?: string }
  | { type: "openExternal"; url: string };

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

/** Answers the app's menu commands. Returns a function that stops listening. */
export function listenForCommands(commands: Record<string, () => void>) {
  const listen = (event: Event) => {
    const command = (event as CustomEvent<{ command?: string }>).detail?.command;
    const run = command ? commands[command] : undefined;
    if (!run) return;
    event.preventDefault();
    run();
  };
  addEventListener("lighthouse:command", listen);
  return () => removeEventListener("lighthouse:command", listen);
}

/** The ids that are new in `next` compared with `previous`. Nothing is new on the first load. */
export function newIds(previous: Set<string> | null, next: string[]) {
  return previous ? next.filter((id) => !previous.has(id)) : [];
}
