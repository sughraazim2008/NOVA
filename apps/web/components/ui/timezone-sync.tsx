"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/lib/api";

/**
 * Keeps the account's timezone in step with the device. "Today" is decided on the server from
 * this setting, so without it someone far from UTC would get their plan a day early or late.
 */
export function TimezoneSync({ saved }: { saved: string }) {
  const router = useRouter();
  useEffect(() => {
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!device || device === saved) return;
    api("/me", { method: "PATCH", body: { timezone: device } })
      .then(() => router.refresh())
      .catch(() => {
        // Not worth interrupting anyone for; it is tried again on the next page.
      });
  }, [saved, router]);
  return null;
}
