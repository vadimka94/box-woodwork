"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { must } from "@/lib/action-result";
import { snoozeLead, giveUpLead } from "@/app/crm-actions";
import { stageLabel, daysSince, waLink } from "@/lib/crm-labels";

/**
 * Deals that have had all three nudges and still went quiet.
 *
 * They are deliberately NOT left in the attention pile: a list that never
 * empties stops being read. Each row here asks one question — is this still
 * alive? — and offers the only two honest answers. Nothing closes by itself;
 * the system just refuses to let you keep not deciding.
 */

type Deal = {
  id: string; kind: string; stage: string; title: string | null;
  stage_changed_at: string;
  customer?: { name?: string; phone?: string | null } | null;
};

export function StalledDeals({ deals }: { deals: Deal[] }) {
  if (!deals.length) return null;

  return (
    <>
      <div className="mono" style={{ fontSize: 10, letterSpacing: ".26em", color: "var(--dim)", margin: "22px 0 11px" }}>
        דורש הכרעה — שתקו אחרי שלוש פניות
      </div>
      {deals.map((d) => <Row key={d.id} d={d} />)}
    </>
  );
}

function Row({ d }: { d: Deal }) {
  const [err, setErr] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [pending, start] = useTransition();
  if (gone) return null;

  const name = d.customer?.name ?? "";
  const wa = waLink(d.customer?.phone);

  const act = (fn: () => Promise<any>) =>
    start(async () => {
      try { await must(fn()); setGone(true); } catch (e: any) { setErr(e.message); }
    });

  return (
    <div className="panel" style={{
      marginBottom: 10, borderColor: "rgba(201,146,79,.45)",
      background: "linear-gradient(90deg,rgba(201,146,79,.1),rgba(255,255,255,.6))",
    }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <span className="chip gold">{stageLabel(d.kind, d.stage)}</span>
        <div style={{ flex: 1, minWidth: 180 }}>
          <Link href={`/crm/${d.id}`} style={{ fontSize: 14, textDecoration: "none" }}>
            {name}{d.title ? ` · ${d.title}` : ""}
          </Link>
          <div className="mono" style={{ fontSize: 10, color: "var(--dim)", marginTop: 5 }}>
            {daysSince(d.stage_changed_at)} ימים בלי תשובה
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 14 }}>
        {wa && (
          <a className="btn" href={wa} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
            נסה שוב בוואטסאפ
          </a>
        )}
        <button className="btn" disabled={pending} onClick={() => act(() => snoozeLead(d.id, 7))}>
          עדיין חי — עוד שבוע
        </button>
        <button className="btn btn-stop" disabled={pending}
          onClick={() => {
            if (!confirm(`לסגור את העסקה של ${name} כ"הפסיק לענות"?\n\nתמיד אפשר לפתוח אותה מחדש.`)) return;
            act(() => giveUpLead(d.id));
          }}>
          הפסיק לענות — סגור
        </button>
      </div>

      {err && <div style={{ color: "#B03B2C", fontSize: 13, marginTop: 10 }}>{err}</div>}
    </div>
  );
}
