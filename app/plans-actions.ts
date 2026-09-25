"use server";

import { revalidatePath } from "next/cache";
import { safe } from "@/lib/action-result";
import { createClient, currentUser } from "@/lib/supabase/server";
import { kindOf } from "@/lib/plans";

/** Uploads drawings, renders or SketchUp files into one folder of a project. */
async function uploadPlanFilesImpl(projectId: string, folderId: string, form: FormData) {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me || (me.role !== "admin" && me.role !== "cnc"))
    throw new Error("רק ואדים, מקס או ליאור יכולים להעלות תוכניות");

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) throw new Error("לא נבחרו קבצים");

  const { data: project } = await supabase
    .from("projects").select("current_rev").eq("id", projectId).single();
  const { data: revision } = await supabase
    .from("project_revisions").select("id").eq("project_id", projectId)
    .eq("rev", project?.current_rev ?? "v1").maybeSingle();

  for (const file of files) {
    const safe = file.name.replace(/[^\w.\-]/g, "_");
    const path = `${projectId}/${folderId}/${Date.now()}-${safe}`;
    const { error } = await supabase.storage.from("plans").upload(path, file);
    if (error) throw new Error(`העלאה נכשלה: ${error.message}`);

    await supabase.from("media_files").insert({
      project_id: projectId, folder_id: folderId, revision_id: revision?.id ?? null,
      name: file.name, kind: kindOf(file.name), storage_path: path,
      size_bytes: file.size, uploaded_by: me.id,
    });
  }

  await supabase.from("activity_log").insert({
    actor: me.id, action: "העלה תוכניות", entity: "project", entity_id: projectId,
    detail: `${files.length} קבצים`,
  });

  revalidatePath("/", "layout");
}

async function deletePlanFileImpl(fileId: string) {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me || me.role !== "admin") throw new Error("רק מנהל יכול למחוק קובץ");

  const { data: file } = await supabase
    .from("media_files").select("storage_path").eq("id", fileId).single();
  if (file) await supabase.storage.from("plans").remove([file.storage_path]);
  await supabase.from("media_files").delete().eq("id", fileId);

  revalidatePath("/", "layout");
}

/* ---------- public actions: return the Hebrew error instead of throwing (see lib/action-result.ts) ---------- */

export async function uploadPlanFiles(projectId: string, folderId: string, form: FormData) {
  return safe(() => uploadPlanFilesImpl(projectId, folderId, form));
}

export async function deletePlanFile(fileId: string) {
  return safe(() => deletePlanFileImpl(fileId));
}
