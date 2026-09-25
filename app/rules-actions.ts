"use server";

import { revalidatePath } from "next/cache";
import { safe } from "@/lib/action-result";
import { createClient, currentUser } from "@/lib/supabase/server";

/** Adds or removes a person from the standing rule for one stage. */
async function toggleDefaultImpl(scope: "project" | "item", seq: number, profileId: string, on: boolean) {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me || me.role !== "admin") throw new Error("רק ואדים או מקס יכולים לשנות שיוך");

  if (on) {
    const { error } = await supabase.from("stage_defaults")
      .upsert({ scope, seq, profile_id: profileId });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("stage_defaults")
      .delete().eq("scope", scope).eq("seq", seq).eq("profile_id", profileId);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/", "layout");
}

/**
 * Re-staffs stages that nobody has touched yet. Stages already in progress or
 * finished keep their crew — the record of who actually did the work stands.
 */
async function applyDefaultsImpl() {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me || me.role !== "admin") throw new Error("רק ואדים או מקס יכולים להחיל שיוך");

  const [{ data: stages }, { data: defaults }] = await Promise.all([
    supabase.from("stages").select("id, scope, seq, status").eq("status", "idle"),
    supabase.from("stage_defaults").select("*"),
  ]);

  let touched = 0;
  for (const s of stages ?? []) {
    const crew = (defaults ?? []).filter((d) => d.scope === s.scope && d.seq === s.seq);
    await supabase.from("stage_crew").delete().eq("stage_id", s.id);
    if (crew.length) {
      await supabase.from("stage_crew")
        .insert(crew.map((c) => ({ stage_id: s.id, profile_id: c.profile_id, added_by: me.id })));
    }
    touched++;
  }

  await supabase.from("activity_log").insert({
    actor: me.id, action: "החיל שיוך ברירת מחדל", detail: `${touched} שלבים`,
  });

  revalidatePath("/", "layout");
  return { touched };
}

/* ---------- public actions: return the Hebrew error instead of throwing (see lib/action-result.ts) ---------- */

export async function toggleDefault(scope: "project" | "item", seq: number, profileId: string, on: boolean) {
  return safe(() => toggleDefaultImpl(scope, seq, profileId, on));
}

export async function applyDefaults() {
  return safe(() => applyDefaultsImpl());
}
