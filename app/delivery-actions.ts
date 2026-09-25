"use server";

import { revalidatePath } from "next/cache";
import { safe } from "@/lib/action-result";
import { createClient, currentUser } from "@/lib/supabase/server";
import { canDeliverProject, deliverLabel } from "@/lib/delivery";

/**
 * The last button on a job. Every stage is done and the work has left the
 * building — either the contractor collected it, or we installed it and the
 * customer has it.
 *
 * Nothing still owed → straight to the archive.
 * Something still owed (a missing trim, an angle the customer asked for) →
 * the project drops off the working lists but stays open, and the database
 * archives it by itself the moment the last shortage is closed.
 */
async function markDeliveredImpl(projectId: string, note: string) {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me) throw new Error("לא מחובר — התחבר מחדש");

  const { data: project } = await supabase
    .from("projects").select("*").eq("id", projectId).single();
  if (!project) throw new Error("פרויקט לא נמצא");

  const word = deliverLabel(project.kind);

  if (project.status === "done") throw new Error("הפרויקט כבר בארכיון");
  if (project.status === "draft") throw new Error("הפרויקט עדיין טיוטה");
  if (project.status === "cancelled") throw new Error("הפרויקט בוטל");
  if (project.delivered_at) throw new Error(`הפרויקט כבר מסומן כ${word}`);

  if (!(await canDeliverProject(projectId, me)))
    throw new Error(`רק מנהל או הצוות שביצע את העבודה יכולים לסמן ש${word}`);

  const { data: stages } = await supabase
    .from("stages").select("status").eq("project_id", projectId);
  if (!stages?.length) throw new Error("אין שלבים בפרויקט");

  const left = stages.filter((s: any) => s.status !== "done").length;
  if (left) throw new Error(`נשארו ${left} שלבים שלא הושלמו — אי אפשר לסמן ש${word}`);

  const { data: owed } = await supabase
    .from("extras").select("id").eq("project_id", projectId).in("status", ["open", "work"]);
  const pending = owed?.length ?? 0;

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    delivered_at: now,
    delivered_by: me.id,
    delivery_note: note.trim() || null,
  };
  /* nothing owed → archive in the same breath */
  if (!pending) {
    patch.status = "done";
    patch.closed_at = now;
    patch.closed_by = me.id;
  }

  const { error } = await supabase.from("projects").update(patch).eq("id", projectId);
  if (error) throw new Error(error.message);

  await supabase.from("activity_log").insert({
    actor: me.id,
    action: `סימן ש${word}`,
    entity: "project",
    entity_id: projectId,
    detail: pending
      ? `${project.code} · ממתין להשלמת ${pending} חוסרים`
      : `${project.code} · הועבר לארכיון`,
  });

  revalidatePath("/", "layout");
  return { archived: !pending, pending };
}

/** Pressed by mistake. Only a manager can take it back. */
async function undoDeliveredImpl(projectId: string) {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me || me.role !== "admin") throw new Error("רק ואדים או מקס יכולים לבטל");

  const { data: project } = await supabase
    .from("projects").select("code, delivered_at, kind").eq("id", projectId).single();
  if (!project?.delivered_at) throw new Error("הפרויקט לא מסומן כנמסר");

  const { error } = await supabase.from("projects").update({
    delivered_at: null, delivered_by: null, delivery_note: null,
    status: "active", closed_at: null, closed_by: null,
  }).eq("id", projectId);
  if (error) throw new Error(error.message);

  await supabase.from("activity_log").insert({
    actor: me.id, action: `ביטל סימון ${deliverLabel(project.kind)}`,
    entity: "project", entity_id: projectId, detail: project.code,
  });

  revalidatePath("/", "layout");
}

/* ---------- public actions: return the Hebrew error instead of throwing (see lib/action-result.ts) ---------- */

export async function markDelivered(projectId: string, note: string) {
  return safe(() => markDeliveredImpl(projectId, note));
}

export async function undoDelivered(projectId: string) {
  return safe(() => undoDeliveredImpl(projectId));
}
