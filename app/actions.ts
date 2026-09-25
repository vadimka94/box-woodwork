"use server";

import { revalidatePath } from "next/cache";
import { safe } from "@/lib/action-result";
import { createClient, currentUser } from "@/lib/supabase/server";
import { translateNote } from "@/lib/translate";
import type { BlockReason, StageStatus } from "@/lib/types";

/** Move a stage. The database also enforces the gates — this is the friendly path. */
async function setStageStatusImpl(stageId: string, to: StageStatus) {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me) throw new Error("not signed in");

  const { data: stage } = await supabase.from("stages").select("*").eq("id", stageId).single();
  if (!stage) throw new Error("stage not found");

  const patch: Record<string, unknown> = { status: to };
  if (to === "work" && !stage.started_at) patch.started_at = new Date().toISOString();
  if (to === "done") patch.completed_at = new Date().toISOString();

  const { error } = await supabase.from("stages").update(patch).eq("id", stageId);
  if (error) throw new Error(error.message); // gate triggers surface here


  await supabase.from("stage_events").insert({
    stage_id: stageId, project_id: stage.project_id, item_id: stage.item_id,
    from_status: stage.status, to_status: to, actor: me.id,
  });

  revalidatePath("/", "layout");
}

/** Report a problem: a category the system can analyse, plus the person's own words. */
async function reportBlockImpl(stageId: string, reason: BlockReason, note: string) {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me) throw new Error("not signed in");
  if (!note.trim()) throw new Error("empty note");

  const { data: stage } = await supabase.from("stages").select("*").eq("id", stageId).single();
  if (!stage) throw new Error("stage not found");

  const from = (me.lang ?? "he") as "he" | "ru";
  const translated = await translateNote(note, from).catch(() => null);

  await supabase.from("blocks").insert({
    stage_id: stageId, project_id: stage.project_id, item_id: stage.item_id,
    reason_code: reason, note, note_lang: from,
    note_tr: translated ? { [from === "he" ? "ru" : "he"]: translated } : {},
    reported_by: me.id,
  });
  await supabase.from("stages").update({ status: "stop" }).eq("id", stageId);
  await supabase.from("stage_events").insert({
    stage_id: stageId, project_id: stage.project_id, item_id: stage.item_id,
    from_status: stage.status, to_status: "stop", actor: me.id,
    reason_code: reason, note,
  });

  revalidatePath("/", "layout");
}

async function resolveBlockImpl(blockId: string, resolution?: string) {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me || me.role !== "admin") throw new Error("admins only");

  const { data: block } = await supabase.from("blocks").select("*").eq("id", blockId).single();
  if (!block) return;

  await supabase.from("blocks")
    .update({ resolved_at: new Date().toISOString(), resolved_by: me.id, resolution_note: resolution })
    .eq("id", blockId);
  await supabase.from("stages").update({ status: "work" }).eq("id", block.stage_id);
  await supabase.from("stage_events").insert({
    stage_id: block.stage_id, project_id: block.project_id, item_id: block.item_id,
    from_status: "stop", to_status: "work", actor: me.id, note: resolution ?? "טופל",
  });

  revalidatePath("/", "layout");
}

/** The two checkpoints. Rights are checked inside the database functions. */
async function signPlansGateImpl(projectId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("sign_gate_plans", { pid: projectId });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

async function signReleaseGateImpl(itemId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("sign_gate_release", { iid: itemId });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/** Field measurement photo, straight from the phone camera. */
async function uploadItemPhotoImpl(itemId: string, projectId: string, file: File) {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me) throw new Error("not signed in");

  const path = `${projectId}/${itemId}/${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from("measurements").upload(path, file, { upsert: false });
  if (error) throw new Error(error.message);

  await supabase.from("item_photos").insert({
    item_id: itemId, project_id: projectId, storage_path: path, taken_by: me.id,
  });
  revalidatePath("/", "layout");
}

/* ---------- public actions: return the Hebrew error instead of throwing (see lib/action-result.ts) ---------- */

export async function setStageStatus(stageId: string, to: StageStatus) {
  return safe(() => setStageStatusImpl(stageId, to));
}

export async function reportBlock(stageId: string, reason: BlockReason, note: string) {
  return safe(() => reportBlockImpl(stageId, reason, note));
}

export async function resolveBlock(blockId: string, resolution?: string) {
  return safe(() => resolveBlockImpl(blockId, resolution));
}

export async function signPlansGate(projectId: string) {
  return safe(() => signPlansGateImpl(projectId));
}

export async function signReleaseGate(itemId: string) {
  return safe(() => signReleaseGateImpl(itemId));
}

export async function uploadItemPhoto(itemId: string, projectId: string, file: File) {
  return safe(() => uploadItemPhotoImpl(itemId, projectId, file));
}
