import { createStore } from "../store";

const KEY = "lighthouse.org";

function read() {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

/** The organization every list and number shows, or "" for all of them. Remembered per device. */
export const orgStore = createStore<string>(read());

export function setOrg(org: string) {
  try {
    if (org) localStorage.setItem(KEY, org);
    else localStorage.removeItem(KEY);
  } catch {
    // Without storage, the choice lasts until the page reloads.
  }
  orgStore.set(org);
}
