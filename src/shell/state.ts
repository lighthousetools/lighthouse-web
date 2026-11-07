import type { ReactNode } from "react";
import { createStore } from "../store";

export type Toast = { id: number; text: string; tone?: "bad" };

export const toasts = createStore<Toast[]>([]);
let next = 1;

/** A short confirmation at the bottom of the window. */
export function toast(text: string, tone?: "bad") {
  const id = next++;
  toasts.set((list) => [...list.slice(-2), { id, text, tone }]);
  setTimeout(() => toasts.set((list) => list.filter((item) => item.id !== id)), 3200);
}

/** The inspector keeps a stack, so a link inside it can open more and Back returns. */
export const inspector = createStore<{ key: string; node: ReactNode }[]>([]);

export function inspect(key: string, node: ReactNode) {
  inspector.set((stack) => (stack[stack.length - 1]?.key === key ? stack : [...stack, { key, node }]));
}

export function inspectOnly(key: string, node: ReactNode) {
  inspector.set([{ key, node }]);
}

export const closeInspector = () => inspector.set([]);
export const inspectorBack = () => inspector.set((stack) => stack.slice(0, -1));

export const palette = createStore(false);
