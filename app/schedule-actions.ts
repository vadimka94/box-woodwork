"use server";

import { revalidatePath } from "next/cache";
import { safe } from "@/lib/action-result";
import { createClient, currentUser } from "@/lib/supabase/server";

/** Books an installation: a date, a project, and who is driving out. */
async function createInstallationImpl(form: FormData) {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me || me.role !== "admin") throw new Error("רק ואדים או מקס יכולים לקבוע התקנה");

  const project_id = String(form.get("project_id") ?? "");
  const scheduled_date = String(form.get("scheduled_date") ?? "");
  if (!project_id || !scheduled_date) throw new Error("צריך פרויקט ותאריך");

  const { data, error } = await supabase.from("installations").insert({
    project_id,
    scheduled_date,
    start_time: String(form.get("start_time") ?? "") || null,
    address: String(form.get("address") ?? "").trim() || null,
    note: String(form.get("note") ?? "").trim() || null,
    created_by: me.id,
  }).select("id").single();
  if (error) throw new Error(error.message);

  const crew = form.getAll("crew").map(String).filter(Boolean);
  if (crew.length) {
    await supabase.from("installation_crew")
      .insert(crew.map((profile_id) => ({ installation_id: data.id, profile_id })));
  }

  await supabase.from("activity_log").insert({
    actor: me.id, action: "קבע התקנה", entity: "installation", entity_id: data.id,
    detail: scheduled_date,
  });

  revalidatePath("/", "layout");
}

async function setInstallCrewImpl(installationId: string, profileId: string, on: boolean) {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me || me.role !== "admin") throw new Error("רק מנהל יכול לשנות צוות התקנה");

  if (on) {
    await supabase.from("installation_crew")
      .upsert({ installation_id: installationId, profile_id: profileId });
  } else {
    await supabase.from("installation_crew").delete()
      .eq("installation_id", installationId).eq("profile_id", profileId);
  }
  revalidatePath("/", "layout");
}

async function setInstallStatusImpl(installationId: string, status: "planned" | "done" | "cancelled") {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me || me.role !== "admin") throw new Error("רק מנהל יכול לעדכן התקנה");
  await supabase.from("installations").update({ status }).eq("id", installationId);
  revalidatePath("/", "layout");
}

/* ---------- public actions: return the Hebrew error instead of throwing (see lib/action-result.ts) ---------- */

export async function createInstallation(form: FormData) {
  return safe(() => createInstallationImpl(form));
}

export async function setInstallCrew(installationId: string, profileId: string, on: boolean) {
  return safe(() => setInstallCrewImpl(installationId, profileId, on));
}

export async function setInstallStatus(installationId: string, status: "planned" | "done" | "cancelled") {
  return safe(() => setInstallStatusImpl(installationId, status));
}
