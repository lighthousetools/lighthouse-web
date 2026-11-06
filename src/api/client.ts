import createClient, { type Middleware } from "openapi-fetch";
import { t } from "../i18n";
import type { components, paths } from "./schema";
import { readEvents } from "./sse";

export type Schemas = components["schemas"];

const TOKEN_KEY = "lighthouse.token";

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

let token = readToken();
let onSignedOut = () => {};

export const isSignedIn = () => token !== null;

export function setSignedOutHandler(handler: () => void) {
  onSignedOut = handler;
}

export function storeToken(value: string | null) {
  token = value;
  try {
    if (value === null) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, value);
  } catch {
    // Without storage, the sign-in lasts until the page reloads.
  }
}

function signedOut(response: Response) {
  if (response.status === 401 && token) {
    storeToken(null);
    onSignedOut();
  }
}

const auth: Middleware = {
  onRequest({ request }) {
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  },
  onResponse({ response }) {
    signedOut(response);
    return response;
  },
};

export const api = createClient<paths>({
  baseUrl: globalThis.location?.origin,
  fetch: (request) => globalThis.fetch(request),
});
api.use(auth);

/** Unwraps a response and turns the server's error text into an exception. */
export async function must<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await call;
  if (error !== undefined) {
    const message = (error as { error?: string })?.error;
    throw new Error(message ?? t("error.server", { status: response.status }));
  }
  return data as T;
}

function authorized(extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${token ?? ""}`, ...extra };
}

/** For endpoints the generated types cannot express, such as raw uploads. */
export async function upload(file: File): Promise<Schemas["EntryDetail"]> {
  const response = await fetch(`/brain/files?name=${encodeURIComponent(file.name)}`, {
    method: "POST",
    headers: authorized({ "Content-Type": file.type || "application/octet-stream" }),
    body: file,
  });
  signedOut(response);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? t("error.upload"));
  return body;
}

/** Fetches an original with the token, since links cannot carry it. */
export async function originalBlob(id: string) {
  const response = await fetch(`/brain/files/${id}`, { headers: authorized() });
  signedOut(response);
  if (!response.ok) throw new Error(t("error.download"));
  return response.blob();
}

export async function download(id: string, name: string) {
  const url = URL.createObjectURL(await originalBlob(id));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Streams an answer. `onText` receives each piece as it arrives. */
export async function askStream(
  question: string,
  onText: (text: string) => void,
  signal?: AbortSignal,
): Promise<Schemas["AskAnswer"]> {
  const response = await fetch("/brain/ask/stream", {
    method: "POST",
    headers: authorized({ "Content-Type": "application/json" }),
    body: JSON.stringify({ question }),
    signal,
  });
  signedOut(response);
  if (!response.ok) throw new Error(t("error.server", { status: response.status }));
  let answer: Schemas["AskAnswer"] | undefined;
  let failure: string | undefined;
  await readEvents(response, ({ event, data }) => {
    if (event === "delta") onText((JSON.parse(data) as { text: string }).text);
    if (event === "done") answer = JSON.parse(data);
    if (event === "failed") failure = (JSON.parse(data) as { error: string }).error;
  });
  if (failure !== undefined) throw new Error(failure);
  if (!answer) throw new Error(t("error.server", { status: response.status }));
  return answer;
}

export type LiveState = "live" | "reconnecting";

/** Calls `onChange` whenever the server reports a change, until aborted. */
export async function followEvents(
  onChange: () => void,
  onState: (state: LiveState) => void,
  signal: AbortSignal,
) {
  let delay = 1000;
  while (!signal.aborted) {
    try {
      const response = await fetch("/events", { headers: authorized(), signal });
      signedOut(response);
      if (response.ok) {
        onState("live");
        delay = 1000;
        await readEvents(response, ({ event }) => {
          if (event === "changed") onChange();
        });
      }
    } catch {
      // A dropped connection is expected. The loop below reconnects.
    }
    if (signal.aborted) return;
    onState("reconnecting");
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 2, 30_000);
  }
}
