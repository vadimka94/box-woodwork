"use server";

import { revalidatePath } from "next/cache";
import { safe } from "@/lib/action-result";
import { createClient, currentUser } from "@/lib/supabase/server";

/** P-244 → P-245. Runs before insert so the code stays human-readable. */
async function nextCode() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects").select("code").order("created_at", { ascending: false }).limit(50);
  const nums = (data ?? [])
    .map((r) => parseInt(String(r.code).replace(/\D/g, ""), 10))
    .filter((n) => !isNaN(n));
  return `P-${(nums.length ? Math.max(...nums) : 230) + 1}`;
}

/**
 * A new project always starts as a draft. Returns the code instead of
 * redirecting — a redirect thrown inside a try/catch on the client gets
 * swallowed, which is exactly how you end up staring at a 404.
 */
async function createProjectImpl(form: FormData): Promise<{ code: string }> {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me) throw new Error("לא מחובר — התחבר מחדש");
  if (me.role !== "admin") throw new Error("רק ואדים או מקס יכולים לפתוח פרויקט");

  const name = String(form.get("name") ?? "").trim();
  const client_name = String(form.get("client_name") ?? "").trim();
  if (!name || !client_name) throw new Error("צריך לפחות שם פרויקט ושם לקוח");

  const due = String(form.get("due_date") ?? "").trim();

  const { data, error } = await supabase.from("projects").insert({
    code: await nextCode(),
    name,
    client_name,
    client_phone: String(form.get("client_phone") ?? "").trim() || null,
    city: String(form.get("city") ?? "").trim() || null,
    due_date: due || null,
    production_note: String(form.get("production_note") ?? "").trim() || null,
    note_lang: me.lang ?? "he",
  kind: String(form.get("kind") ?? "full"),
    has_carpentry: String(form.get("has_carpentry") ?? "true") !== "false",
    status: "draft",
    created_by: me.id,
  }).select("code").single();

  if (error) throw new Error(`שמירה נכשלה: ${error.message}`);

  await supabase.from("activity_log").insert({
    actor: me.id, action: "יצר טיוטת פרויקט", entity: "project", detail: `${data.code} · ${name}`,
  });

  revalidatePath("/", "layout");
  return { code: data.code };
}

/** Items are the real unit of production — each gets its own seven stages. */
async function addItemImpl(projectId: string, form: FormData) {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me || me.role !== "admin") throw new Error("רק ואדים או מקס יכולים להוסיף פריט");

  const name = String(form.get("name") ?? "").trim();
  if (!name) throw new Error("צריך שם לפריט");

  const { data: item, error } = await supabase.from("items").insert({
    project_id: projectId,
    name,
    qty: Number(form.get("qty") ?? 1) || 1,
    note: String(form.get("note") ?? "").trim() || null,
    note_lang: me.lang ?? "he",
  }).select("id").single();
  if (error) throw new Error(`שמירת הפריט נכשלה: ${error.message}`);

  const photos = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  for (const file of photos) {
    const path = `${projectId}/${item.id}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("measurements").upload(path, file);
    if (upErr) throw new Error(`העלאת התמונה נכשלה: ${upErr.message}`);
    await supabase.from("item_photos").insert({
      item_id: item.id, project_id: projectId, storage_path: path, taken_by: me.id,
    });
  }

  revalidatePath("/", "layout");
}

async function deleteItemImpl(itemId: string) {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me || me.role !== "admin") throw new Error("רק מנהל יכול למחוק פריט");
  const { error } = await supabase.from("items").delete().eq("id", itemId);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

async function addPhotosImpl(projectId: string, itemId: string, form: FormData) {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me) throw new Error("לא מחובר");

  const photos = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  for (const file of photos) {
    const path = `${projectId}/${itemId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    const { error } = await supabase.storage.from("measurements").upload(path, file);
    if (error) throw new Error(`העלאה נכשלה: ${error.message}`);
    await supabase.from("item_photos").insert({
      item_id: itemId, project_id: projectId, storage_path: path, taken_by: me.id,
    });
  }
  revalidatePath("/", "layout");
}

/** Releases the project to the floor, and stamps revision v1. */
async function approveForProductionImpl(projectId: string) {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me || me.role !== "admin") throw new Error("רק ואדים או מקס יכולים לאשר לייצור");

  const { data: p } = await supabase
    .from("projects").select("*, items(id)").eq("id", projectId).single();
  if (!p) throw new Error("פרויקט לא נמצא");
  if (!p.client_name || !p.due_date || !(p.items?.length))
    throw new Error("חסרים פרטים — לקוח, תאריך יעד ופריט אחד לפחות");

  await supabase.from("project_revisions").insert({
    project_id: projectId, rev: "v1", approved_by: me.id,
    customer_approved_at: new Date().toISOString(),
  });
  const { error } = await supabase.from("projects").update({
    status: "active", current_rev: "v1",
    approved_at: new Date().toISOString(), approved_by: me.id,
  }).eq("id", projectId);
  if (error) throw new Error(error.message);

  const folders = ["הדמיות מאושרות ללקוח", "פיצוץ הרכבה", "פרזול ומידות", "קנט וכיוון סיב", "התקנה באתר"];
  await supabase.from("media_folders").insert(
    folders.map((name, sort) => ({ project_id: projectId, name, sort }))
  );

  await supabase.from("activity_log").insert({
    actor: me.id, action: "אישר לייצור", entity: "project", entity_id: projectId, detail: p.code,
  });

  revalidatePath("/", "layout");
}

/** Name, client and due date can be fixed at any time — a draft often starts half-filled. */
async function updateProjectDetailsImpl(projectId: string, form: FormData) {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me || me.role !== "admin") throw new Error("רק ואדים או מקס יכולים לערוך פרטי פרויקט");

  const name = String(form.get("name") ?? "").trim();
  const client_name = String(form.get("client_name") ?? "").trim();
  if (!name || !client_name) throw new Error("צריך לפחות שם פרויקט ושם לקוח");

  const { error } = await supabase.from("projects").update({
    name,
    client_name,
    client_phone: String(form.get("client_phone") ?? "").trim() || null,
    city: String(form.get("city") ?? "").trim() || null,
    due_date: String(form.get("due_date") ?? "").trim() || null,
  }).eq("id", projectId);
  if (error) throw new Error(`שמירה נכשלה: ${error.message}`);

  await supabase.from("activity_log").insert({
    actor: me.id, action: "עדכן פרטי פרויקט", entity: "project", entity_id: projectId, detail: name,
  });
  revalidatePath("/", "layout");
}

/* ---------- public actions: return the Hebrew error instead of throwing (see lib/action-result.ts) ---------- */

export async function createProject(form: FormData) {
  return safe(() => createProjectImpl(form));
}

export async function addItem(projectId: string, form: FormData) {
  return safe(() => addItemImpl(projectId, form));
}

export async function deleteItem(itemId: string) {
  return safe(() => deleteItemImpl(itemId));
}

export async function addPhotos(projectId: string, itemId: string, form: FormData) {
  return safe(() => addPhotosImpl(projectId, itemId, form));
}

export async function approveForProduction(projectId: string) {
  return safe(() => approveForProductionImpl(projectId));
}

export async function updateProjectDetails(projectId: string, form: FormData) {
  return safe(() => updateProjectDetailsImpl(projectId, form));
}
