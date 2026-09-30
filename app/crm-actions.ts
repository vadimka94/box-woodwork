"use server";

import { revalidatePath } from "next/cache";
import { safe } from "@/lib/action-result";
import { createClient, currentUser } from "@/lib/supabase/server";
/*
 * Every action returns { ok, error, data } instead of throwing.
 * In production Next.js replaces a thrown message with a generic English
 * sentence, so the user never saw the Hebrew reason. A returned value
 * reaches the screen as-is.
 */
import { STAGES, STYLE_LABEL, stageLabel, waNumber, type LeadStage } from "@/lib/crm-labels";

async function admin() {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me) throw new Error("לא מחובר — התחבר מחדש");
  if (me.role !== "admin") throw new Error("רק ואדים או מקס יכולים לעבוד על לקוחות");
  return { supabase, me };
}

const str = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v || null;
};
const num = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").replace(/[^\d.]/g, "");
  return v ? Number(v) : null;
};

async function log(supabase: any, leadId: string, actor: string, kind: string, note: string | null = null) {
  await supabase.from("lead_events").insert({ lead_id: leadId, actor, kind, note });
}

/**
 * The follow-up rhythm: 3 days, then 7, then 14. Converted quotes close in a
 * couple of days; the ones that die sit untouched for weeks. Three nudges is
 * where the industry advice lands, and after the third the honest move is to
 * ask for a yes or a no rather than keep chasing.
 */
const NUDGE_DAYS = [3, 7, 14];

/** Stages where silence is the enemy and the ball is in our court to chase. */
const CHASED_STAGES = ["waiting_info", "estimate_sent", "awaiting_payment"];

const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
};

/** step is 1-based; returns null once the three nudges are spent. */
const nudge = (step: number) =>
  step >= 1 && step <= NUDGE_DAYS.length ? inDays(NUDGE_DAYS[step - 1]) : null;

function done() {
  revalidatePath("/crm", "layout");
  revalidatePath("/");
}

/** The customer who already owns this phone number, if any. */
async function customerByPhone(supabase: any, phone: string | null) {
  const wa = waNumber(phone);
  if (!wa) return null;
  const { data } = await supabase.from("customers").select("id, name, phone, city, kind").not("phone", "is", null);
  return (data ?? []).find((c: any) => waNumber(c.phone) === wa) ?? null;
}

/** Live check while typing a phone number in "פנייה חדשה". */
async function findCustomerImpl(phone: string) {
  const { supabase } = await admin();
  if ((waNumber(phone) ?? "").length < 11) return null;
  const c = await customerByPhone(supabase, phone);
  if (!c) return null;
  const { data: deals } = await supabase
    .from("leads").select("stage, final_price").eq("customer_id", c.id);
  return {
    id: c.id as string,
    name: c.name as string,
    city: (c.city ?? null) as string | null,
    kind: c.kind as string,
    deals: deals?.length ?? 0,
    won: (deals ?? []).filter((d: any) => d.stage === "won").length,
    open: (deals ?? []).filter((d: any) => d.stage !== "won" && d.stage !== "lost").length,
  };
}

/**
 * The 10-second add from the phone.
 * - customer_id given (from the customer card, or "yes, it's them"): the deal goes on that card.
 * - force_new: the user saw the match and said it's someone else.
 * - otherwise a matching phone number still lands on the existing card.
 */
async function addLeadImpl(fd: FormData): Promise<{ id: string }> {
  const { supabase, me } = await admin();

  const phone = str(fd, "phone");
  const kind = str(fd, "kind") === "contractor" ? "contractor" : "private";

  let customerId: string | null = str(fd, "customer_id");
  if (customerId) {
    const { data: exists } = await supabase
      .from("customers").select("id, city, source").eq("id", customerId).maybeSingle();
    if (!exists) throw new Error("הלקוח לא נמצא — אולי אוחד או נמחק");
    /* fill in what the card was missing, never overwrite */
    const fill: Record<string, string> = {};
    if (!exists.city && str(fd, "city")) fill.city = str(fd, "city")!;
    if (Object.keys(fill).length) await supabase.from("customers").update(fill).eq("id", customerId);
  } else if (str(fd, "force_new") !== "1") {
    customerId = (await customerByPhone(supabase, phone))?.id ?? null;
  }

  const name = str(fd, "name");
  if (!customerId && !name) throw new Error("צריך שם");

  if (!customerId) {
    const { data: c, error } = await supabase.from("customers").insert({
      name, phone, kind,
      city: str(fd, "city"),
      source: str(fd, "source"),
      created_by: me.id,
    }).select("id").single();
    if (error) throw new Error(`שמירת הלקוח נכשלה: ${error.message}`);
    customerId = c.id;
  }

  const { data: lead, error } = await supabase.from("leads").insert({
    customer_id: customerId,
    kind,
    title: str(fd, "title"),
    request: str(fd, "request"),
    /* on the deal, not the customer — a repeat customer can arrive twice
       through two different channels, and both deserve the credit */
    source: str(fd, "source"),
    created_by: me.id,
  }).select("id").single();
  if (error) throw new Error(`שמירת הפנייה נכשלה: ${error.message}`);

  await log(supabase, lead.id, me.id, "created", str(fd, "request"));
  done();
  return { id: lead.id };
}

/** Customer details: name, phone, address, source. */
async function updateCustomerImpl(customerId: string, fd: FormData) {
  const { supabase } = await admin();
  const name = str(fd, "name");
  if (!name) throw new Error("צריך שם");
  const { error } = await supabase.from("customers").update({
    name,
    phone: str(fd, "phone"),
    city: str(fd, "city"),
    address: str(fd, "address"),
    source: str(fd, "source"),
    notes: str(fd, "notes"),
  }).eq("id", customerId);
  if (error) throw new Error(error.message);
  done();
}

/** The deal itself: what they want, price range, visit, final price, style. */
async function updateLeadImpl(leadId: string, fd: FormData) {
  const { supabase } = await admin();

  const patch: Record<string, unknown> = {};
  const text = ["title", "request", "models", "meeting_address", "contract_mode", "style"];
  const nums = ["estimate_min", "estimate_max", "final_price", "deposit_amount"];
  for (const k of text) if (fd.has(k)) patch[k] = str(fd, k);
  for (const k of nums) if (fd.has(k)) patch[k] = num(fd, k);
  if (fd.has("follow_up_on")) patch.follow_up_on = str(fd, "follow_up_on");
  /* the browser sends the visit time already converted to UTC */
  if (fd.has("meeting_at")) patch.meeting_at = str(fd, "meeting_at");

  if (patch.style && !STYLE_LABEL[String(patch.style)]) throw new Error("סגנון לא מוכר");

  const { error } = await supabase.from("leads").update(patch).eq("id", leadId);
  if (error) throw new Error(error.message);
  done();
}

/** Moves a deal along. "won" and "lost" have their own actions. */
/**
 * What a stage means, enforced.
 *
 * Moving BACKWARD is always free — a wrong click should cost nothing, and a
 * pipeline that punishes correction is a pipeline people stop touching.
 * Moving FORWARD into a stage whose whole meaning is a number requires that
 * number: "פגישה נקבעה" without a date is not a booked meeting, and a deal
 * sitting in "הערכת מחיר נשלחה" with no estimate makes the accuracy report
 * a lie.
 *
 * hard  — refused outright.
 * soft  — refused once, and allowed on a second, deliberate press.
 */
const STAGE_NEEDS: Record<string, { hard?: (l: any) => boolean; soft?: (l: any) => boolean; why: string }> = {
  estimate_sent: {
    soft: (l) => l.estimate_min === null && l.estimate_max === null,
    why: "לא רשומה הערכת מחיר",
  },
  meeting_set: {
    hard: (l) => !l.meeting_at,
    why: "לא נקבע מועד לפגישה",
  },
  meeting_done: {
    hard: (l) => l.final_price === null,
    why: "לא נרשם מחיר סופי",
  },
  awaiting_payment: {
    hard: (l) => l.final_price === null,
    why: "לא נרשם מחיר סופי",
  },
};

async function setStageImpl(leadId: string, stage: LeadStage, force = false) {
  const { supabase, me } = await admin();
  const { data: lead } = await supabase
    .from("leads")
    .select("kind, stage, meeting_at, final_price, estimate_min, estimate_max")
    .eq("id", leadId).single();
  if (!lead) throw new Error("הפנייה לא נמצאה");
  if (stage === "won" || stage === "lost") throw new Error("לסגירה או לביטול יש כפתור נפרד");
  if (!STAGES[lead.kind as "private" | "contractor"].includes(stage)) throw new Error("השלב לא מתאים לסוג הלקוח");
  if (lead.stage === "won") throw new Error("העסקה כבר נסגרה ויש לה פרויקט");

  /* only on the way forward — going back never asks for anything */
  const order = STAGES[lead.kind as "private" | "contractor"];
  const forward = order.indexOf(stage) > order.indexOf(lead.stage as LeadStage);
  const need = forward ? STAGE_NEEDS[stage] : undefined;
  if (need?.hard?.(lead)) {
    throw new Error(`${need.why} — אי אפשר להעביר ל"${stageLabel(lead.kind, stage)}" בלעדיו`);
  }
  if (need?.soft?.(lead) && !force) {
    throw new Error(`SOFT:${need.why}`);
  }

  /* entering a stage where we are the ones waiting arms the first nudge;
     any other move clears it, because the reason to chase is gone */
  const chased = CHASED_STAGES.includes(stage);
  const { error } = await supabase.from("leads").update({
    stage,
    stage_changed_at: new Date().toISOString(),
    follow_up_on: chased ? nudge(1) : null,
    follow_up_step: chased ? 1 : 0,
  }).eq("id", leadId);
  if (error) throw new Error(error.message);

  await log(supabase, leadId, me.id, "stage", stageLabel(lead.kind, stage));
  done();
}

async function addNoteImpl(leadId: string, fd: FormData) {
  const { supabase, me } = await admin();
  const note = str(fd, "note");
  const kind = ["note", "call", "whatsapp", "meeting"].includes(String(fd.get("kind"))) ? String(fd.get("kind")) : "note";
  if (!note) throw new Error("ההערה ריקה");
  await log(supabase, leadId, me.id, kind, note);

  const follow = str(fd, "follow_up_on");
  if (follow) {
    /* a date typed by hand always wins, and it ends the automatic rhythm */
    await supabase.from("leads")
      .update({ follow_up_on: follow, follow_up_step: 0 }).eq("id", leadId);
  } else {
    /* no date given: this touch counts, so move to the next interval */
    const { data: lead } = await supabase
      .from("leads").select("stage, follow_up_step").eq("id", leadId).single();
    if (lead && CHASED_STAGES.includes(lead.stage)) {
      const next = Number(lead.follow_up_step ?? 0) + 1;
      await supabase.from("leads").update({
        follow_up_on: nudge(next),          /* null once the three are spent */
        follow_up_step: next,
      }).eq("id", leadId);
    }
  }
  done();
}

async function uploadLeadFilesImpl(leadId: string, fd: FormData) {
  const { supabase, me } = await admin();
  const kind = String(fd.get("kind") ?? "other");
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) throw new Error("לא נבחר קובץ");

  for (const file of files) {
    const path = `crm/${leadId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("measurements").upload(path, file);
    if (upErr) throw new Error(`העלאה נכשלה: ${upErr.message}`);
    await supabase.from("lead_files").insert({
      lead_id: leadId, kind, storage_path: path, name: file.name, uploaded_by: me.id,
    });
  }
  await log(supabase, leadId, me.id, "file", `${files.length} קבצים`);
  done();
}

async function markLostImpl(leadId: string, fd: FormData) {
  const { supabase, me } = await admin();
  const reason = str(fd, "lost_reason");
  if (!reason) throw new Error("בחר סיבה");
  const { error } = await supabase.from("leads").update({
    stage: "lost", lost_reason: reason, lost_note: str(fd, "lost_note"),
    stage_changed_at: new Date().toISOString(), follow_up_on: null,
  }).eq("id", leadId).neq("stage", "won");
  if (error) throw new Error(error.message);
  await log(supabase, leadId, me.id, "lost", str(fd, "lost_note"));
  done();
}

/** "Still alive" — push it a week out and keep it in the decision list. */
async function snoozeLeadImpl(leadId: string, days = 7) {
  const { supabase, me } = await admin();
  const { data: lead } = await supabase.from("leads").select("stage").eq("id", leadId).single();
  if (!lead) throw new Error("הפנייה לא נמצאה");
  if (lead.stage === "won" || lead.stage === "lost") throw new Error("העסקה כבר סגורה");

  const { error } = await supabase.from("leads")
    .update({ follow_up_on: inDays(days) }).eq("id", leadId);
  if (error) throw new Error(error.message);
  await log(supabase, leadId, me.id, "note", `נדחה ל-${days} ימים`);
  done();
}

/** "Stopped answering" — close it with the reason already filled in. */
async function giveUpLeadImpl(leadId: string) {
  const { supabase, me } = await admin();
  const { error } = await supabase.from("leads").update({
    stage: "lost", lost_reason: "no_reply",
    lost_note: "לא ענה אחרי שלוש פניות",
    stage_changed_at: new Date().toISOString(),
    follow_up_on: null, follow_up_step: 0,
  }).eq("id", leadId).neq("stage", "won");
  if (error) throw new Error(error.message);
  await log(supabase, leadId, me.id, "lost", "הפסיק לענות");
  done();
}

async function reopenLeadImpl(leadId: string) {
  const { supabase, me } = await admin();
  const { error } = await supabase.from("leads").update({
    stage: "new", lost_reason: null, lost_note: null, stage_changed_at: new Date().toISOString(),
  }).eq("id", leadId).eq("stage", "lost");
  if (error) throw new Error(error.message);
  await log(supabase, leadId, me.id, "reopen");
  done();
}

/** Same numbering as a project opened by hand: P-244 → P-245. */
async function nextCode(supabase: any) {
  const { data } = await supabase
    .from("projects").select("code").order("created_at", { ascending: false }).limit(50);
  const nums = (data ?? [])
    .map((r: any) => parseInt(String(r.code).replace(/\D/g, ""), 10))
    .filter((n: number) => !isNaN(n));
  return `P-${(nums.length ? Math.max(...nums) : 230) + 1}`;
}

/**
 * The transfer confirmation arrived — the contract is live.
 * Opens the project as a draft, exactly like "פרויקט חדש" does, so every
 * existing rule (items, stages, approval) keeps working unchanged.
 * The price stays in the CRM: production notes are read by the whole floor.
 */
async function markWonImpl(leadId: string, fd: FormData): Promise<{ code: string }> {
  const { supabase, me } = await admin();

  const { data: lead } = await supabase
    .from("leads").select("*, customer:customers(*)").eq("id", leadId).single();
  if (!lead) throw new Error("הפנייה לא נמצאה");
  if (lead.stage === "won" || lead.project_id) throw new Error("כבר נפתח פרויקט לעסקה הזו");

  const deposit = num(fd, "deposit_amount");
  if (!deposit) throw new Error("צריך לרשום את סכום המקדמה");
  if (!str(fd, "due_date")) throw new Error("צריך תאריך יעד — בלעדיו אי אפשר לאשר את הפרויקט לייצור");

  const { count: transfers } = await supabase
    .from("lead_files").select("*", { count: "exact", head: true })
    .eq("lead_id", leadId).eq("kind", "transfer");
  if (!transfers) throw new Error("צריך להעלות קודם את צילום אישור ההעברה");

  const isContractor = lead.kind === "contractor";
  if (isContractor && !lead.style) throw new Error("לקבלן צריך לבחור סגנון — זה קובע אם יש נגרות");

  const name = str(fd, "project_name") ?? lead.title ?? (lead.style ? STYLE_LABEL[lead.style] : "פרויקט חדש");
  const noteParts = [
    lead.style && `סגנון: ${STYLE_LABEL[lead.style]}`,
    lead.models && `דגמים: ${lead.models}`,
    lead.request,
  ].filter(Boolean);

  const { data: project, error } = await supabase.from("projects").insert({
    code: await nextCode(supabase),
    name,
    client_name: lead.customer.name,
    client_phone: lead.customer.phone,
    city: lead.customer.city ?? lead.customer.address,
    due_date: str(fd, "due_date"),
    production_note: noteParts.join("\n") || null,
    note_lang: me.lang ?? "he",
    kind: isContractor ? "contractor" : "full",
    has_carpentry: isContractor ? lead.style !== "cladding" : true,
    status: "draft",
    created_by: me.id,
  }).select("id, code").single();
  if (error) throw new Error(`פתיחת הפרויקט נכשלה: ${error.message}`);

  const { error: upErr } = await supabase.from("leads").update({
    stage: "won",
    project_id: project.id,
    deposit_amount: deposit,
    deposit_at: new Date().toISOString(),
    stage_changed_at: new Date().toISOString(),
    follow_up_on: null,
  }).eq("id", leadId);
  if (upErr) throw new Error(upErr.message);

  await log(supabase, leadId, me.id, "won", `${project.code} · ${name}`);
  await supabase.from("activity_log").insert({
    actor: me.id, action: "סגר עסקה ופתח פרויקט", entity: "project",
    entity_id: project.id, detail: `${project.code} · ${lead.customer.name}`,
  });

  revalidatePath("/", "layout");
  return { code: project.code };
}

/**
 * Closed by mistake. Only allowed while the project is still an empty draft
 * (or was already deleted) — once items exist, real work hangs off it.
 */
async function undoWonImpl(leadId: string) {
  const { supabase, me } = await admin();
  const { data: lead } = await supabase.from("leads").select("stage, project_id").eq("id", leadId).single();
  if (!lead || lead.stage !== "won") throw new Error("העסקה לא במצב סגור");

  if (lead.project_id) {
    const { data: p } = await supabase
      .from("projects").select("id, code, status, items(id)").eq("id", lead.project_id).maybeSingle();
    if (p) {
      if (p.status !== "draft" || (p.items?.length ?? 0) > 0) {
        throw new Error(`אי אפשר לבטל — בפרויקט ${p.code} כבר יש פריטים או שהוא אושר לייצור`);
      }
      const { error: delErr } = await supabase.from("projects").delete().eq("id", p.id);
      if (delErr) throw new Error(`מחיקת הטיוטה נכשלה: ${delErr.message}`);
      await supabase.from("activity_log").insert({
        actor: me.id, action: "ביטל סגירת עסקה ומחק טיוטה", entity: "project", detail: p.code,
      });
    }
  }

  const { error } = await supabase.from("leads").update({
    stage: "awaiting_payment", project_id: null, deposit_at: null,
    stage_changed_at: new Date().toISOString(),
  }).eq("id", leadId);
  if (error) throw new Error(error.message);

  await log(supabase, leadId, me.id, "reopen", "הסגירה בוטלה — חזרה להמתנה להעברה");
  revalidatePath("/", "layout");
}


/**
 * The same person ended up on two cards. Everything moves to the one we keep;
 * empty fields on it are filled from the other; notes are joined.
 */
async function mergeCustomersImpl(keepId: string, dropId: string) {
  const { supabase, me } = await admin();
  if (!keepId || !dropId || keepId === dropId) throw new Error("צריך לבחור שני לקוחות שונים");

  const { data: both } = await supabase.from("customers").select("*").in("id", [keepId, dropId]);
  const keep = both?.find((c: any) => c.id === keepId);
  const drop = both?.find((c: any) => c.id === dropId);
  if (!keep || !drop) throw new Error("אחד הלקוחות לא נמצא");

  const fill: Record<string, unknown> = {};
  for (const k of ["phone", "city", "address", "source"]) {
    if (!keep[k] && drop[k]) fill[k] = drop[k];
  }
  if (drop.notes) fill.notes = keep.notes ? `${keep.notes}\n${drop.notes}` : drop.notes;
  if (drop.kind === "contractor") fill.kind = "contractor";

  const { data: moved, error: mvErr } = await supabase
    .from("leads").update({ customer_id: keepId }).eq("customer_id", dropId).select("id");
  if (mvErr) throw new Error(`העברת העסקאות נכשלה: ${mvErr.message}`);

  /* deleting a card deletes its deals — make sure none are still on it */
  const { count: left } = await supabase
    .from("leads").select("*", { count: "exact", head: true }).eq("customer_id", dropId);
  if (left) throw new Error(`האיחוד נעצר: ${left} עסקאות לא הועברו, והכרטיס הכפול לא נמחק`);

  if (Object.keys(fill).length) {
    const { error } = await supabase.from("customers").update(fill).eq("id", keepId);
    if (error) throw new Error(error.message);
  }

  const { error: delErr } = await supabase.from("customers").delete().eq("id", dropId);
  if (delErr) throw new Error(`מחיקת הכרטיס הכפול נכשלה: ${delErr.message}`);

  for (const l of moved ?? []) {
    await log(supabase, l.id, me.id, "note", `הלקוח "${drop.name}" אוחד לכרטיס של "${keep.name}"`);
  }
  done();
  return { moved: moved?.length ?? 0 };
}

/* ---------- public actions ---------- */

export async function addLead(fd: FormData) {
  return safe(() => addLeadImpl(fd));
}

export async function updateCustomer(customerId: string, fd: FormData) {
  return safe(() => updateCustomerImpl(customerId, fd));
}

export async function updateLead(leadId: string, fd: FormData) {
  return safe(() => updateLeadImpl(leadId, fd));
}

export async function setStage(leadId: string, stage: LeadStage, force = false) {
  return safe(() => setStageImpl(leadId, stage, force));
}

export async function addNote(leadId: string, fd: FormData) {
  return safe(() => addNoteImpl(leadId, fd));
}

export async function uploadLeadFiles(leadId: string, fd: FormData) {
  return safe(() => uploadLeadFilesImpl(leadId, fd));
}

export async function markLost(leadId: string, fd: FormData) {
  return safe(() => markLostImpl(leadId, fd));
}

export async function snoozeLead(leadId: string, days = 7) {
  return safe(() => snoozeLeadImpl(leadId, days));
}

export async function giveUpLead(leadId: string) {
  return safe(() => giveUpLeadImpl(leadId));
}

export async function reopenLead(leadId: string) {
  return safe(() => reopenLeadImpl(leadId));
}

export async function markWon(leadId: string, fd: FormData) {
  return safe(() => markWonImpl(leadId, fd));
}

export async function undoWon(leadId: string) {
  return safe(() => undoWonImpl(leadId));
}

export async function findCustomer(phone: string) {
  return safe(() => findCustomerImpl(phone));
}

export async function mergeCustomers(keepId: string, dropId: string) {
  return safe(() => mergeCustomersImpl(keepId, dropId));
}
