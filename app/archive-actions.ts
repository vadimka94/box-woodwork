"use server";

import { revalidatePath } from "next/cache";
import { safe } from "@/lib/action-result";
import { redirect } from "next/navigation";
import { createClient, currentUser } from "@/lib/supabase/server";

/** Finished. Moves out of the working lists and off the floor screen. */
async function closeProjectImpl(projectId: string) {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me || me.role !== "admin") throw new Error("רק ואדים או מקס יכולים לסגור פרויקט");

  /* A job we still owe something on is not finished, however done the stages
     look. Close the shortage first — then the project closes by itself. */
  const { data: owed } = await supabase
    .from("extras").select("title").eq("project_id", projectId).in("status", ["open", "work"]);
  if (owed?.length) {
    const list = owed.slice(0, 3).map((e: any) => e.title).join(", ");
    throw new Error(
      `יש ${owed.length} חוסרים פתוחים בפרויקט (${list}${owed.length > 3 ? "…" : ""}) — ` +
      `צריך לסגור אותם לפני העברה לארכיון`
    );
  }

  const { error } = await supabase.from("projects")
    .update({ status: "done", closed_at: new Date().toISOString(), closed_by: me.id })
    .eq("id", projectId);
  if (error) throw new Error(error.message);

  await supabase.from("activity_log").insert({
    actor: me.id, action: "סגר פרויקט", entity: "project", entity_id: projectId,
  });
  revalidatePath("/", "layout");
}

async function reopenProjectImpl(projectId: string) {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me || me.role !== "admin") throw new Error("רק מנהל יכול לפתוח מחדש");

  const { error } = await supabase.from("projects")
    .update({ status: "active", closed_at: null, closed_by: null })
    .eq("id", projectId);
  if (error) throw new Error(error.message);

  await supabase.from("activity_log").insert({
    actor: me.id, action: "פתח פרויקט מחדש", entity: "project", entity_id: projectId,
  });
  revalidatePath("/", "layout");
}

/**
 * Gone for good. The database cascades items, stages, signatures, blocks,
 * installations and extras; the stored files have to be swept by hand,
 * otherwise they sit in the bucket forever paying rent.
 */
async function deleteProjectImpl(projectId: string) {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me || me.role !== "admin") throw new Error("רק ואדים או מקס יכולים למחוק פרויקט");

  for (const bucket of ["measurements", "plans"] as const) {
    const { data: files } = await supabase.storage.from(bucket).list(projectId, { limit: 1000 });
    if (files?.length) {
      // one level of folders under the project id, then the files inside them
      const paths: string[] = [];
      for (const f of files) {
        if (f.id) { paths.push(`${projectId}/${f.name}`); continue; }
        const { data: inner } = await supabase.storage.from(bucket).list(`${projectId}/${f.name}`, { limit: 1000 });
        inner?.forEach((x) => paths.push(`${projectId}/${f.name}/${x.name}`));
      }
      if (paths.length) await supabase.storage.from(bucket).remove(paths);
    }
  }

  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) throw new Error(error.message);

  await supabase.from("activity_log").insert({
    actor: me.id, action: "מחק פרויקט", entity: "project", detail: projectId,
  });

  revalidatePath("/", "layout");
  redirect("/projects");
}

/* ---------- public actions: return the Hebrew error instead of throwing (see lib/action-result.ts) ---------- */

export async function closeProject(projectId: string) {
  return safe(() => closeProjectImpl(projectId));
}

export async function reopenProject(projectId: string) {
  return safe(() => reopenProjectImpl(projectId));
}

export async function deleteProject(projectId: string) {
  return safe(() => deleteProjectImpl(projectId));
}
