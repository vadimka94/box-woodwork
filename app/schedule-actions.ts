"use server";

import { revalidatePath } from "next/cache";
import { safe } from "@/lib/action-result";
import { createClient, currentUser } from "@/lib/supabase/server";

/**
 * Books a job on the calendar: a date, who is driving out, and what it is —
 * either a project, or a free-text title for work that has no project card
 * (a pop-up installation, a standing site). The database enforces that one
 * of the two is present; see migrations/015_other_installations.sql.
 */
async function createInstallationImpl(form: FormData) {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me || me.role !== "admin") throw new Error("רק ואדים או מקס יכולים לקבוע התקנה");

  const isOther = String(form.get("kind") ?? "project") === "other";
  const project_id = String(form.get("project_id") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const scheduled_date = String(form.get("scheduled_date") ?? "");
  /* a two-phase job needs a trip out before anything is measured — same
     calendar, different kind of day (see migrations/018_prep_phase.sql) */
  const purpose = String(form.get("purpose") ?? "install") === "prep" ? "prep" : "install";

  if (!scheduled_date) throw new Error("צריך תאריך");
  if (isOther && !title) throw new Error("צריך לכתוב במה מדובר");
  if (!isOther && !project_id) throw new Error("צריך לבחור פרויקט");

  const { data, error } = await supabase.from("installations").insert({
    project_id: isOther ? null : project_id,
    title: isOther ? title : null,
    purpose: isOther ? "install" : purpose,
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
    actor: me.id,
    action: isOther ? "קבע עבודה אחרת"
          : purpose === "prep" ? "קבע נסיעה לעבודת הכנה" : "קבע התקנה",
    entity: "installation", entity_id: data.id,
    detail: isOther ? `${scheduled_date} · ${title}` : scheduled_date,
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
