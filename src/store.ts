import { useSyncExternalStore } from "react";

/** A tiny observable value for state the whole app shares. */
export function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  const get = () => value;
  const set = (next: T | ((current: T) => T)) => {
    value = typeof next === "function" ? (next as (current: T) => T)(value) : next;
    listeners.forEach((listener) => listener());
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const use = () => useSyncExternalStore(subscribe, get, get);
  return { get, set, subscribe, use };
}
