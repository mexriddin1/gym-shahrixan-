"use client";

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Keeps two tabs on the same desk in step.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * A boolean the browser remembers, read without a setState-in-effect.
 *
 * localStorage is an external store, so reading it through
 * useSyncExternalStore is what it is for: the server snapshot is the fallback,
 * the client snapshot is the stored value, and there is no extra render pass
 * to reconcile the two.
 */
export function usePersistedFlag(key: string, fallback = false) {
  const value = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(key) === "true",
    () => fallback,
  );

  const toggle = useCallback(() => {
    localStorage.setItem(key, String(localStorage.getItem(key) !== "true"));
    for (const listener of listeners) listener();
  }, [key]);

  return [value, toggle] as const;
}
