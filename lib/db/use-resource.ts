"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Resource<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Optimistic local override, rolled back by the caller on failure. */
  mutate: (updater: (current: T) => T) => void;
};

function depsEqual(a: unknown[], b: unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

/**
 * Minimal fetch-on-deps hook. Deliberately not SWR: this app runs on a single
 * desk terminal where a stale cache is more confusing than a refetch is slow,
 * and the daily sheet needs a `mutate` it fully controls for optimistic edits.
 */
export function useResource<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // Guards against a slow earlier request overwriting a newer one.
  const requestId = useRef(0);

  // Flip to loading in the same render the deps change, rather than in an
  // effect. An effect would leave one render showing the previous result as if
  // it were current, which is exactly the flicker this screen cannot afford.
  const [trackedDeps, setTrackedDeps] = useState(deps);
  if (!depsEqual(deps, trackedDeps)) {
    setTrackedDeps(deps);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    const id = ++requestId.current;

    fetcher()
      .then((result) => {
        if (id !== requestId.current) return;
        setData(result);
        setError(null);
      })
      .catch((e: unknown) => {
        if (id !== requestId.current) return;
        setError(e instanceof Error ? e.message : "Ma'lumotni yuklashda xatolik");
      })
      .finally(() => {
        if (id !== requestId.current) return;
        setLoading(false);
      });

    // A newer request invalidates this one by bumping requestId, so there is
    // nothing to tear down here beyond that guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => {
    setLoading(true);
    setNonce((n) => n + 1);
  }, []);

  const mutate = useCallback((updater: (current: T) => T) => {
    setData((current) => (current === null ? current : updater(current)));
  }, []);

  return { data, loading, error, reload, mutate };
}
