"use client";

import { useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps every screen live: Dimitri marks a stage on his phone and the floor
 * screen, Vadim's dashboard and Max's alerts all move within a second.
 *
 * The channel name has to be unique per mount. The floor screen renders this
 * component and also sits inside the app layout which renders it too — two
 * subscriptions on one channel name, and Supabase throws.
 */
const DEFAULT_TABLES = ["stages", "blocks", "items", "projects", "stage_crew"];

/* `tables` lets a page listen to its own tables (the CRM) without touching
   the shared channel every other screen depends on. */
export function Realtime({ pollMs = 0, tables = DEFAULT_TABLES }: { pollMs?: number; tables?: string[] }) {
  const router = useRouter();
  const id = useId();

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => router.refresh();

    const channel = supabase.channel(`bw:${id}`);
    for (const table of tables) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    }
    channel.subscribe();

    const timer = pollMs ? setInterval(refresh, pollMs) : null;
    return () => {
      supabase.removeChannel(channel);
      if (timer) clearInterval(timer);
    };
  }, [router, pollMs, id, tables.join(",")]);

  return null;
}
