import createClient, { type Middleware } from "openapi-fetch";
import { useSyncExternalStore } from "react";
import { t } from "../i18n";
import type { components, paths } from "./schema";
import { readEvents } from "./sse";

export type Schemas = components["schemas"];

const TOKEN_KEY = "lighthouse.token";
const DEVICE_KEY = "lighthouse.device";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

let token = read(TOKEN_KEY);
// The device ID is kept with the end of the token it belongs to. The Mac app hands over tokens of its own, so an ID
// whose token is gone describes another device and is ignored.
const tail = (value: string) => value.slice(-8);
function readDevice(): string | null {
  const [id, end] = (read(DEVICE_KEY) ?? "").split(":");
  return id && token && end === tail(token) ? id : null;
}
let device = readDevice();
let onSignedOut = () => {};
const tokenListeners = new Set<() => void>();

export const isSignedIn = () => token !== null;

/** The device ID of this browser's token, when this app signed in and the token is still the one it got. */
export const currentDevice = () => {
  if (token !== read(TOKEN_KEY) && read(TOKEN_KEY) !== null) return null;
  return device;
};

/** Rerenders when this browser signs in, switches its token or signs out. */
export function useSignedIn() {
  return useSyncExternalStore(
    (listener) => {
      tokenListeners.add(listener);
      return () => {
        tokenListeners.delete(listener);
      };
    },
    isSignedIn,
    isSignedIn,
  );
}

/** The bearer header for calls that go around the typed client, such as endpoints newer than its spec. */
export const authHeader = (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

export function setSignedOutHandler(handler: () => void) {
  onSignedOut = handler;
}

export function storeToken(value: string | null, deviceId: string | null = null) {
  token = value;
  device = value === null ? null : deviceId;
  try {
    if (value === null) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, value);
    if (device === null || value === null) localStorage.removeItem(DEVICE_KEY);
    else localStorage.setItem(DEVICE_KEY, `${device}:${tail(value)}`);
  } catch {
    // Without storage, the sign-in lasts until the page reloads.
  }
  tokenListeners.forEach((listener) => listener());
}

// A wrong current password answers 401 too, without the token being invalid.
const KEEPS_TOKEN = new Set(["/auth/password"]);

function signedOut(response: Response, path = "") {
  if (response.status === 401 && token && !KEEPS_TOKEN.has(path)) {
    storeToken(null);
    onSignedOut();
  }
}

const auth: Middleware = {
  onRequest({ request }) {
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  },
  onResponse({ request, response }) {
    signedOut(response, new URL(request.url).pathname);
    return response;
  },
};

export const api = createClient<paths>({
  baseUrl: globalThis.location?.origin,
  fetch: (request) => globalThis.fetch(request),
});
api.use(auth);

/** A failed call, with the HTTP status so pages can tell a missing role (403) from a pause (429). */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

/** The text to show for a failed call: the server's own words, except for the sign-in pause, which reads the same in every language. */
export function errorText(status: number, body: unknown): string {
  if (status === 429) return t("error.tooMany");
  const message = (body as { error?: unknown } | null)?.error;
  return typeof message === "string" && message ? message : t("error.server", { status });
}

export const statusOf = (error: unknown) => (error instanceof ApiError ? error.status : 0);

/** Unwraps a response and turns the server's error text into an exception. */
export async function must<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await call;
  if (error !== undefined) throw new ApiError(errorText(response.status, error), response.status);
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

/**
 * Calls `onEvent` with the name and data of every event the server sends, until aborted. `changed` means anything
 * may have changed; the named events say what.
 */
export async function followEvents(
  onEvent: (event: string, data: unknown) => void,
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
        await readEvents(response, ({ event, data }) => {
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(data);
          } catch {
            // Events carry IDs only; a body that is not JSON still names what changed.
          }
          onEvent(event, parsed);
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
