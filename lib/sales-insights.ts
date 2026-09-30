import { LOST_REASONS } from "@/lib/crm-labels";

/**
 * The numbers the CRM already knows but never said out loud.
 *
 * All of it is computed from the same `leads` rows the board already loads —
 * no extra query, no new table. A deal that was never decided (still open)
 * is excluded from every rate, because an open deal is not a lost one.
 */

const MONTHS_BACK = 12;

const cutoff = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - MONTHS_BACK);
  return d.toISOString();
};

const num = (v: any) => (v === null || v === undefined || v === "" ? null : Number(v));
const days = (from: string, to: string) =>
  Math.max(0, Math.round((+new Date(to) - +new Date(from)) / 86_400_000));

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

const UNKNOWN = "לא ידוע";

export type SourceRow = {
  source: string; leads: number; won: number; lost: number;
  closePct: number | null; revenue: number;
};
export type ReasonRow = { reason: string; label: string; count: number };

export function salesInsights(allLeads: any[]) {
  const since = cutoff();
  const leads = (allLeads ?? []).filter((l) => String(l.created_at) >= since);

  const won = leads.filter((l) => l.stage === "won");
  const lost = leads.filter((l) => l.stage === "lost");
  const decided = won.length + lost.length;

  /* ---------- headline ---------- */
  const closePct = decided ? Math.round((won.length / decided) * 100) : null;
  const revenue = won.reduce((s, l) => s + (num(l.final_price) ?? 0), 0);
  const daysToClose = median(
    won.filter((l) => l.deposit_at).map((l) => days(l.created_at, l.deposit_at))
  );

  /* ---------- by source ---------- */
  const bySource = new Map<string, SourceRow>();
  for (const l of leads) {
    const key = String(l.source ?? l.customer?.source ?? UNKNOWN).trim() || UNKNOWN;
    const row = bySource.get(key) ?? { source: key, leads: 0, won: 0, lost: 0, closePct: null, revenue: 0 };
    row.leads++;
    if (l.stage === "won") { row.won++; row.revenue += num(l.final_price) ?? 0; }
    if (l.stage === "lost") row.lost++;
    bySource.set(key, row);
  }
  const sources = [...bySource.values()]
    .map((r) => ({ ...r, closePct: r.won + r.lost ? Math.round((r.won / (r.won + r.lost)) * 100) : null }))
    .sort((a, b) => b.revenue - a.revenue || b.leads - a.leads);

  /* ---------- why we lose ---------- */
  const reasons = new Map<string, number>();
  for (const l of lost) {
    const key = String(l.lost_reason ?? "other");
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }
  const lostReasons: ReasonRow[] = [...reasons.entries()]
    .map(([reason, count]) => ({ reason, label: LOST_REASONS[reason] ?? "אחר", count }))
    .sort((a, b) => b.count - a.count);

  /* ---------- were the pre-visit estimates honest? ----------
     Only deals that carried a range AND ended with a final price can answer
     this; anything else would quietly inflate the "accurate" bucket.        */
  const priced = won.filter(
    (l) => num(l.final_price) !== null && (num(l.estimate_min) !== null || num(l.estimate_max) !== null)
  );
  let inside = 0, above = 0, below = 0;
  const gaps: number[] = [];
  for (const l of priced) {
    const fin = num(l.final_price)!;
    const lo = num(l.estimate_min) ?? num(l.estimate_max)!;
    const hi = num(l.estimate_max) ?? num(l.estimate_min)!;
    if (fin > hi) above++;
    else if (fin < lo) below++;
    else inside++;
    const mid = (lo + hi) / 2;
    if (mid > 0) gaps.push(Math.round(((fin - mid) / mid) * 100));
  }
  const estimate = {
    total: priced.length,
    inside, above, below,
    medianGapPct: median(gaps),   /* +12 = final price ran 12% over the estimate */
  };

  return {
    monthsBack: MONTHS_BACK,
    total: leads.length,
    open: leads.filter((l) => l.stage !== "won" && l.stage !== "lost").length,
    won: won.length,
    lost: lost.length,
    closePct,
    revenue,
    daysToClose,
    sources,
    lostReasons,
    estimate,
    /* nothing decided yet — the panel should say so instead of showing 0% */
    empty: decided === 0,
  };
}

export type SalesInsights = ReturnType<typeof salesInsights>;
