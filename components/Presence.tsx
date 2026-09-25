"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * One row every five minutes while the app is open, and nothing else.
 * No mouse tracking, no keystrokes — only "this person had the system open".
 * Enough to answer whether a worker is running the job through the app or
 * filling it in from memory at the end of the day.
 */
export function Presence({ profileId }: { profileId: string }) {
  useEffect(() => {
    const supabase = createClient();
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      supabase.from("app_pings").insert({ profile_id: profileId }).then(() => {}, () => {});
    };

    ping();
    const timer = setInterval(ping, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", ping);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", ping); };
  }, [profileId]);

  return null;
}
