"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * False during server render and the first client render, true afterwards.
 *
 * For anything the server cannot know: the resolved colour theme, the user's
 * locale-formatted date, the current time. Returning a different server and
 * client snapshot is exactly what useSyncExternalStore is for, and it avoids
 * the extra render pass a setState-in-effect "mounted" flag costs.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
