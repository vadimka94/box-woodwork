import { createClient } from "@/lib/supabase/server";
import { signFiles } from "@/lib/plans";
import { EARLY_STAGES, STALE_DAYS, daysSince, todayIL } from "@/lib/crm-labels";

export * from "@/lib/crm-labels";

/** A deal needs a nudge when its follow-up date arrived, or it sat too long before the visit. */
export function needsAttention(l: any) {
  if (l.stage === "won" || l.stage === "lost") return false;
  if (l.follow_up_on && l.follow_up_on <= todayIL()) return true;
  if (l.stage === "awaiting_payment" && daysSince(l.stage_changed_at) >= STALE_DAYS) return true;
  return EARLY_STAGES.includes(l.stage) && daysSince(l.stage_changed_at) >= STALE_DAYS;
}

export async function getLeads() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*, customer:customers(*), project:projects(code)")
    .order("stage_changed_at", { ascending: false });
  if (error) {
    console.error("getLeads:", error.message);
    return { leads: [] as any[], missingTables: /does not exist|schema cache/i.test(error.message) };
  }
  return { leads: (data ?? []) as any[], missingTables: false };
}

export async function getLead(id: string) {
  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("*, customer:customers(*), project:projects(code, name, status, items(id))")
    .eq("id", id)
    .single();
  if (!lead) return null;

  const [{ data: events }, { data: files }, { data: profiles }, { data: history }] = await Promise.all([
    supabase.from("lead_events").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    supabase.from("lead_files").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name"),
    /* the same customer's other deals — mostly contractors who come back */
    supabase.from("leads").select("id, stage, kind, title, final_price, created_at, project:projects(code)")
      .eq("customer_id", lead.customer_id).neq("id", id).order("created_at", { ascending: false }),
  ]);

  const who = (pid: string | null) => profiles?.find((p) => p.id === pid)?.full_name ?? "";

  return {
    ...lead,
    events: (events ?? []).map((e: any) => ({ ...e, actor_name: who(e.actor) })),
    files: await signFiles("measurements", files ?? []),
    history: history ?? [],
  } as any;
}

/** The link from a project back to the deal it came from. Admins only — RLS hides it from others. */
export async function leadForProject(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads").select("id, final_price, deposit_amount").eq("project_id", projectId).maybeSingle();
  return data;
}

/** Numbers for the top of the board and the dashboard. */
export function summarize(leads: any[]) {
  const monthStart = todayIL().slice(0, 7);
  const thisMonth = leads.filter((l) => String(l.created_at).slice(0, 7) === monthStart);
  const reachedMeeting = (l: any) =>
    l.kind === "private" && (l.meeting_at || ["meeting_set", "meeting_done", "awaiting_payment", "won"].includes(l.stage));

  const privates = leads.filter((l) => l.kind === "private");
  const decided = privates.filter((l) => reachedMeeting(l) || l.stage === "lost");
  const toMeetingPct = decided.length
    ? Math.round((decided.filter(reachedMeeting).length / decided.length) * 100)
    : null;

  const open = leads.filter((l) => l.stage !== "won" && l.stage !== "lost");
  const awaiting = leads.filter((l) => l.stage === "awaiting_payment");

  return {
    newThisMonth: thisMonth.length,
    toMeetingPct,
    open: open.length,
    attention: open.filter(needsAttention),
    awaitingCount: awaiting.length,
    awaitingDeposits: awaiting.reduce((s, l) => s + Number(l.deposit_amount ?? (l.final_price ? l.final_price / 2 : 0)), 0),
    upcomingMeetings: leads
      .filter((l) => l.stage === "meeting_set" && l.meeting_at && new Date(l.meeting_at).getTime() > Date.now() - 3 * 3600_000)
      .sort((a, b) => String(a.meeting_at).localeCompare(String(b.meeting_at))),
  };
}

/** Money that actually came in: deals that reached a deposit. */
const wonTotal = (deals: any[]) =>
  deals.filter((d) => d.stage === "won").reduce((s, d) => s + Number(d.final_price ?? 0), 0);

/** The customer list, with a one-line summary of their history. */
export async function getCustomers(q?: string) {
  const supabase = await createClient();
  const [{ data: customers, error }, { data: leads }] = await Promise.all([
    supabase.from("customers").select("*").order("created_at", { ascending: false }),
    supabase.from("leads").select("id, customer_id, stage, final_price, created_at"),
  ]);
  if (error) {
    console.error("getCustomers:", error.message);
    return [];
  }

  const needle = (q ?? "").trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");

  return (customers ?? [])
    .filter((c: any) => {
      if (!needle) return true;
      if (digits.length >= 3 && String(c.phone ?? "").replace(/\D/g, "").includes(digits.replace(/^0/, ""))) return true;
      return [c.name, c.city, c.address, c.notes].some((v) => String(v ?? "").toLowerCase().includes(needle));
    })
    .map((c: any) => {
      const deals = (leads ?? []).filter((l: any) => l.customer_id === c.id);
      const last = deals.map((d: any) => d.created_at).sort().pop() ?? c.created_at;
      return {
        ...c,
        dealCount: deals.length,
        wonCount: deals.filter((d: any) => d.stage === "won").length,
        openCount: deals.filter((d: any) => d.stage !== "won" && d.stage !== "lost").length,
        total: wonTotal(deals),
        lastAt: last,
      };
    })
    .sort((a: any, b: any) => String(b.lastAt).localeCompare(String(a.lastAt)));
}

/** One customer and everything they ever ordered or asked about. */
export async function getCustomer(id: string) {
  const supabase = await createClient();
  const { data: customer } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
  if (!customer) return null;

  const [{ data: deals }, { data: others }] = await Promise.all([
    supabase.from("leads")
      .select("*, project:projects(code, name, status, due_date)")
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
    /* for the merge picker */
    supabase.from("customers").select("id, name, phone, city").neq("id", id).order("name"),
  ]);

  const list = deals ?? [];
  const won = list.filter((d: any) => d.stage === "won");
  return {
    ...customer,
    deals: list,
    others: others ?? [],
    stats: {
      deals: list.length,
      won: won.length,
      lost: list.filter((d: any) => d.stage === "lost").length,
      open: list.filter((d: any) => d.stage !== "won" && d.stage !== "lost").length,
      total: wonTotal(list),
      openBalance: won.reduce((s: number, d: any) =>
        s + Math.max(0, Number(d.final_price ?? 0) - Number(d.deposit_amount ?? 0)), 0),
      firstAt: list.length ? list[list.length - 1].created_at : customer.created_at,
      lastAt: list.length ? list[0].created_at : customer.created_at,
    },
  } as any;
}
