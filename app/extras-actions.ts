"use server";

import { revalidatePath } from "next/cache";
import { safe } from "@/lib/action-result";
import { createClient, currentUser } from "@/lib/supabase/server";
import { translateNote } from "@/lib/translate";

/** Something is missing, broken, or the customer asked for more. */
async function reportExtraImpl(form: FormData) {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me) throw new Error("לא מחובר");

  const title = String(form.get("title") ?? "").trim();
  const project_id = String(form.get("project_id") ?? "") || null;
  if (!title) throw new Error("צריך לכתוב מה חסר");

  const description = String(form.get("description") ?? "").trim() || null;
  const from = (me.lang ?? "he") as "he" | "ru";
  const translated = description ? await translateNote(description, from).catch(() => null) : null;

  const { data, error } = await supabase.from("extras").insert({
    project_id,
    item_id: String(form.get("item_id") ?? "") || null,
    title,
    description,
    description_lang: from,
    description_tr: translated ? { [from === "he" ? "ru" : "he"]: translated } : {},
    source: String(form.get("source") ?? "missing"),
    route: String(form.get("route") ?? "general"),
    /* "כללי" means nobody owns it yet — whoever picks it up becomes the owner */
    assigned_to: String(form.get("assigned_to") ?? "") || null,
    qty: Number(form.get("qty") ?? 1) || 1,
    reported_by: me.id,
  }).select("id").single();
  if (error) throw new Error(error.message);

  const photos = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  for (const file of photos) {
    const path = `${project_id ?? "general"}/extras/${data.id}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("measurements").upload(path, file);
    if (!upErr) {
      await supabase.from("extra_photos").insert({
        extra_id: data.id, project_id, storage_path: path, taken_by: me.id,
      });
    }
  }

  await supabase.from("activity_log").insert({
    actor: me.id, action: "דיווח חוסר או תוספת", entity: "extra", entity_id: data.id, detail: title,
  });

  revalidatePath("/", "layout");
}

/**
 * Moving an unassigned "כללי" item forward claims it. Otherwise nobody would
 * get credit for the work that nobody was told to do — which is exactly the
 * work worth noticing.
 */
async function setExtraStatusImpl(extraId: string, status: "open" | "work" | "done" | "cancelled") {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me) throw new Error("לא מחובר");

  const { data: extra } = await supabase
    .from("extras").select("assigned_to").eq("id", extraId).single();
  if (!extra) throw new Error("הדיווח לא נמצא");

  /* Workers: only their own items, or a "כללי" item they are taking on.
     Cancelling stays with the manager or the person it belongs to. */
  if (me.role !== "admin") {
    const mine = extra.assigned_to === me.id;
    const general = !extra.assigned_to;
    if (!mine && !general) throw new Error("הדיווח הזה משויך לעובד אחר");
    if (!mine && status !== "work" && status !== "done") throw new Error("רק מנהל יכול לבטל דיווח כללי");
  }

  const patch: Record<string, unknown> = { status };
  if (status === "work") patch.started_at = new Date().toISOString();
  if (status === "done") patch.done_at = new Date().toISOString();
  const claiming = !extra.assigned_to && (status === "work" || status === "done");
  if (claiming) patch.assigned_to = me.id;

  /* When claiming, only succeed if it is still unassigned — two people
     pressing at the same moment must not both think it is theirs. */
  let q = supabase.from("extras").update(patch).eq("id", extraId);
  if (claiming) q = q.is("assigned_to", null);
  const { data: updated, error } = await q.select("id");
  if (error) throw new Error(error.message);
  if (!updated?.length) {
    throw new Error(claiming ? "מישהו אחר כבר לקח את זה" : "אין הרשאה לעדכן את הדיווח");
  }

  if (claiming) {
    await supabase.from("activity_log").insert({
      actor: me.id, action: "לקח על עצמו חוסר כללי", entity: "extra", entity_id: extraId,
    });
  }

  revalidatePath("/", "layout");
}

/**
 * Route it: a CNC file from Lior, cut by hand, or "general" (either way — whoever gets to it).
 * assignedTo = null means "כללי" — open to the whole team.
 */
async function setExtraRouteImpl(extraId: string, route: "general" | "cnc" | "manual", assignedTo: string | null) {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me || me.role !== "admin") throw new Error("רק מנהל יכול לשייך");
  const { error } = await supabase.from("extras")
    .update({ route, assigned_to: assignedTo }).eq("id", extraId);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/* ---------- public actions: return the Hebrew error instead of throwing (see lib/action-result.ts) ---------- */

export async function reportExtra(form: FormData) {
  return safe(() => reportExtraImpl(form));
}

export async function setExtraStatus(extraId: string, status: "open" | "work" | "done" | "cancelled") {
  return safe(() => setExtraStatusImpl(extraId, status));
}

export async function setExtraRoute(extraId: string, route: "general" | "cnc" | "manual", assignedTo: string | null) {
  return safe(() => setExtraRouteImpl(extraId, route, assignedTo));
}
