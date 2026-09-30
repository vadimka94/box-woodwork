"use server";

import { revalidatePath } from "next/cache";
import { safe } from "@/lib/action-result";
import { createClient, currentUser } from "@/lib/supabase/server";
import { waNumber } from "@/lib/crm-labels";

/*
 * פנייה שהגיעה מהטופס באתר נוחתת ב-site_leads ולא בצינור המכירות, כי טופס
 * פתוח באינטרנט מקבל גם בוטים. כאן היא הופכת ללקוח וליד אמיתיים — או נזרקת.
 *
 * שום דבר לא נמחק: פנייה שסומנה כספאם נשארת בטבלה עם הסטטוס שלה, כדי
 * שתמיד אפשר יהיה לראות מה באמת הגיע ומה סוננן.
 */

async function admin() {
  const supabase = await createClient();
  const me = await currentUser();
  if (!me) throw new Error("לא מחובר — התחבר מחדש");
  if (me.role !== "admin") throw new Error("רק ואדים או מקס יכולים לטפל בפניות");
  return { supabase, me };
}

function done() {
  revalidatePath("/crm", "layout");
  revalidatePath("/");
}

/** הלקוח שכבר מחזיק במספר הזה, אם יש כזה */
async function customerByPhone(supabase: any, phone: string | null) {
  const wa = waNumber(phone);
  if (!wa) return null;
  const { data } = await supabase
    .from("customers").select("id, city").not("phone", "is", null);
  return (data ?? []).find((c: any) => waNumber(c.phone) === wa) ?? null;
}

async function approveImpl(id: string) {
  const { supabase, me } = await admin();

  const { data: sl, error: readErr } = await supabase
    .from("site_leads").select("*").eq("id", id).maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!sl) throw new Error("הפנייה לא נמצאה");
  if (sl.status !== "new") throw new Error("הפנייה הזו כבר טופלה");

  /* לקוח חוזר שכבר פנה פעם — לא פותחים לו כרטיס שני */
  const existing = await customerByPhone(supabase, sl.phone);
  let customerId: string = existing?.id ?? "";

  if (existing) {
    /* משלימים מה שחסר בכרטיס הקיים, בלי לדרוס מה שכבר נרשם */
    if (!existing.city && sl.city) {
      await supabase.from("customers").update({ city: sl.city }).eq("id", existing.id);
    }
  } else {
    const { data: c, error } = await supabase.from("customers").insert({
      name: sl.name,
      phone: sl.phone,
      city: sl.city,
      kind: "private",
      source: "אתר",
      created_by: me.id,
    }).select("id").single();
    if (error) throw new Error(`פתיחת כרטיס הלקוח נכשלה: ${error.message}`);
    customerId = c.id;
  }

  const { data: lead, error: leadErr } = await supabase.from("leads").insert({
    customer_id: customerId,
    kind: "private",
    request: sl.request,
    style: sl.style,
    source: "אתר",
    created_by: me.id,
  }).select("id").single();
  if (leadErr) throw new Error(`פתיחת הפנייה נכשלה: ${leadErr.message}`);

  await supabase.from("lead_events").insert({
    lead_id: lead.id,
    actor: me.id,
    kind: "created",
    note: sl.request ? `מהטופס באתר: ${sl.request}` : "הגיע מהטופס באתר",
  });

  const { error: closeErr } = await supabase.from("site_leads").update({
    status: "approved",
    lead_id: lead.id,
    handled_at: new Date().toISOString(),
    handled_by: me.id,
  }).eq("id", id);
  if (closeErr) throw new Error(closeErr.message);

  done();
  return { leadId: lead.id as string, isReturning: !!existing };
}

async function spamImpl(id: string) {
  const { supabase, me } = await admin();
  const { error } = await supabase.from("site_leads").update({
    status: "spam",
    handled_at: new Date().toISOString(),
    handled_by: me.id,
  }).eq("id", id).eq("status", "new");
  if (error) throw new Error(error.message);
  done();
}

/* ---------- public actions ---------- */

export async function approveSiteLead(id: string) {
  return safe(() => approveImpl(id));
}

export async function markSiteLeadSpam(id: string) {
  return safe(() => spamImpl(id));
}
