import { useSyncExternalStore } from "react";
import { createStore } from "../store";

export type Look = "glass" | "light";
export type LookChoice = Look | "system";

const STORAGE_KEY = "lighthouse.look";

function readChoice(): LookChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "glass" || stored === "light" ? stored : "system";
  } catch {
    return "system";
  }
}

export const lookChoice = createStore<LookChoice>(readChoice());

/** Light unless Dark was chosen. */
export function resolveLook(choice: LookChoice): Look {
  return choice === "system" ? "light" : choice;
}

export function currentLook(): Look {
  return resolveLook(lookChoice.get());
}

export function setLook(choice: LookChoice) {
  try {
    if (choice === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Without storage, the choice lasts until the page reloads.
  }
  lookChoice.set(choice);
}

/** Puts the look on the document root, so overlays outside the app tree follow it too. */
export function applyLook() {
  const look = currentLook();
  document.documentElement.dataset.look = look;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", look === "glass" ? "#000000" : "#F6F7F9");
}

export function watchLook() {
  applyLook();
  return lookChoice.subscribe(applyLook);
}

export function useLook(): Look {
  useSyncExternalStore(lookChoice.subscribe, lookChoice.get, lookChoice.get);
  return currentLook();
}

