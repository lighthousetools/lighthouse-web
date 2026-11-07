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

const darkQuery = () => globalThis.matchMedia?.("(prefers-color-scheme: dark)");

/** The system look follows the color scheme: dark is Glass, light is Light. */
export function resolveLook(choice: LookChoice, systemDark: boolean): Look {
  if (choice !== "system") return choice;
  return systemDark ? "glass" : "light";
}

export function currentLook(): Look {
  return resolveLook(lookChoice.get(), darkQuery()?.matches ?? true);
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
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", look === "glass" ? "#0A0F17" : "#F6F7F9");
}

export function watchLook() {
  applyLook();
  const query = darkQuery();
  query?.addEventListener?.("change", applyLook);
  const stop = lookChoice.subscribe(applyLook);
  return () => {
    query?.removeEventListener?.("change", applyLook);
    stop();
  };
}

export function useLook(): Look {
  useSyncExternalStore(lookChoice.subscribe, lookChoice.get, lookChoice.get);
  return currentLook();
}

/**
 * The light of the background over the day: 0 is dawn, 1 is noon, 2 is night.
 * Values in between blend, so the sky changes slowly across the day.
 */
export function dayPhase(date: Date): number {
  const hour = date.getHours() + date.getMinutes() / 60;
  const ramp = (from: number, to: number) => Math.min(1, Math.max(0, (hour - from) / (to - from)));
  if (hour < 4.5) return 2;
  if (hour < 6) return 2 - 2 * ramp(4.5, 6); // night to dawn
  if (hour < 12) return ramp(8, 12); // dawn to noon
  if (hour < 17) return 1;
  return 1 + ramp(17, 21); // noon to night
}
