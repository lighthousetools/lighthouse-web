import { useSyncExternalStore } from "react";
import { de } from "./de";
import { en, type Key } from "./en";

export type { Key };
export type Language = "en" | "de";
export type Choice = Language | "system";

const STORAGE_KEY = "lighthouse.language";
const listeners = new Set<() => void>();
const tables: Record<Language, Record<Key, string>> = { en, de };

function readChoice(): Choice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "en" || stored === "de" ? stored : "system";
  } catch {
    return "system";
  }
}

let choice = readChoice();

function browserLanguage(): Language {
  return (globalThis.navigator?.language ?? "en").toLowerCase().startsWith("de") ? "de" : "en";
}

export function language(): Language {
  return choice === "system" ? browserLanguage() : choice;
}

export function languageChoice(): Choice {
  return choice;
}

export function setLanguage(next: Choice) {
  choice = next;
  try {
    if (next === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Without storage, the choice lasts until the page reloads.
  }
  document.documentElement.lang = language();
  listeners.forEach((listener) => listener());
}

/** Translates a key and fills in `{name}` placeholders. */
// Keys built from server values (a status, a kind) can be unknown to this version: they fall back to English, then to
// the last part of the key, instead of breaking the page.
export function t(key: Key, values: Record<string, string | number> = {}): string {
  const text: string | undefined = tables[language()][key] ?? tables.en[key];
  return (text ?? key.split(".").pop() ?? key).replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

/** Translates a key built at run time, with a fallback for values we don't know. */
export function tOr(key: string, fallback: string): string {
  const table = tables[language()] as Record<string, string>;
  return table[key] ?? fallback;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The choice itself, which can change while the language stays the same (system German to German). */
export function useLanguageChoice(): Choice {
  return useSyncExternalStore(subscribe, languageChoice, languageChoice);
}

/** Rerenders a component when the language changes. */
export function useLanguage(): Language {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    language,
    language,
  );
}
