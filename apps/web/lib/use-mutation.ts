"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { describeError } from "./api";

/**
 * Runs a change against the API, then asks the server-rendered page for fresh data.
 * Returns true when the change succeeded.
 */
export function useMutation() {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (action: () => Promise<unknown>): Promise<boolean> => {
      setRunning(true);
      setError(null);
      try {
        await action();
        startTransition(() => router.refresh());
        return true;
      } catch (caught) {
        setError(describeError(caught));
        return false;
      } finally {
        setRunning(false);
      }
    },
    [router],
  );

  return { run, pending: running || refreshing, error, clearError: () => setError(null) };
}
