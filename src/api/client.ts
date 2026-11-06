import createClient, { type Middleware } from "openapi-fetch";
import type { components, paths } from "./schema";

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

const auth: Middleware = {
  onRequest({ request }) {
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  },
  onResponse({ response }) {
    if (response.status === 401 && token) {
      storeToken(null);
      onSignedOut();
    }
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
    throw new Error(message ?? `The server answered ${response.status}`);
  }
  return data as T;
}

/** For endpoints the generated types cannot express, such as raw uploads. */
export async function upload(file: File): Promise<Schemas["EntryDetail"]> {
  const response = await fetch(`/brain/files?name=${encodeURIComponent(file.name)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token ?? ""}`,
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "The upload failed");
  return body;
}

export async function download(id: string, name: string) {
  const response = await fetch(`/brain/files/${id}`, {
    headers: { Authorization: `Bearer ${token ?? ""}` },
  });
  if (!response.ok) throw new Error("The download failed");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
