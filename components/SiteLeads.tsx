"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { must } from "@/lib/action-result";
import { approveSiteLead, markSiteLeadSpam } from "@/app/site-leads-actions";
import { STYLE_LABEL, waLink, fmtDateTime } from "@/lib/crm-labels";

/**
 * פנייה שממתינה להכרעה. שני כפתורים, כי יש בדיוק שתי תשובות:
 * זה לקוח — או שזה לא. כל מה שבאמצע רק יגרום לרשימה להתארך לנצח.
 */

type SiteLead = {
  id: string;
  name: string;
  phone: string;
  city: string | null;
  style: string | null;
  request: string | null;
  landed_on: string | null;
  created_at: string;
};

const CHANNEL: Record<string, string> = {
  "/nfc": "מדבקת NFC",
  "/wa": "וואטסאפ",
  "/ig": "אינסטגרם",
  "/fb": "פייסבוק",
  "/card": "כרטיס ביקור",
  "/quote": "הצעת מחיר",
  "/sign": "שלט",
};

export function SiteLeads({ leads }: { leads: SiteLead[] }) {
  if (!leads.length) return null;
  return (
    <>
      {leads.map((l) => <Row key={l.id} l={l} />)}
    </>
  );
}

function Row({ l }: { l: SiteLead }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [pending, start] = useTransition();
  if (gone) return null;

  const wa = waLink(l.phone);
  const channel = l.landed_on ? CHANNEL[l.landed_on] : null;

  const approve = () =>
    start(async () => {
      try {
        const { leadId } = await must(approveSiteLead(l.id));
        router.push(`/crm/${leadId}`);
      } catch (e: any) { setErr(e.message); }
    });

  const spam = () =>
    start(async () => {
      try { await must(markSiteLeadSpam(l.id)); setGone(true); }
      catch (e: any) { setErr(e.message); }
    });

  return (
    <div className="panel" style={{
      marginBottom: 10,
      borderColor: "rgba(201,146,79,.45)",
      background: "linear-gradient(90deg,rgba(201,146,79,.1),rgba(255,255,255,.6))",
    }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 16 }}>
            {l.name}
            {l.city && <span style={{ color: "var(--steel)" }}> · {l.city}</span>}
          </div>
          <div className="mono" style={{ fontSize: 13, color: "var(--bronze-lt)", marginTop: 4, direction: "ltr" }}>
            {l.phone}
          </div>
        </div>
        {l.style && <span className="chip gold">{STYLE_LABEL[l.style] ?? l.style}</span>}
      </div>

      {l.request && (
        <p style={{ margin: "12px 0 0", fontSize: 14, color: "var(--steel)", lineHeight: 1.7 }}>
          {l.request}
        </p>
      )}

      <div className="mono" style={{ fontSize: 10, color: "var(--dim)", marginTop: 10 }}>
        {fmtDateTime(l.created_at)}{channel ? ` · דרך ${channel}` : ""}
      </div>

      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 14 }}>
        <button className="btn btn-primary" disabled={pending} onClick={approve}>
          צור לקוח וליד
        </button>
        {wa && (
          <a className="btn" href={wa} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
            וואטסאפ
          </a>
        )}
        <button className="btn btn-stop" disabled={pending}
          onClick={() => {
            if (!confirm(`לסמן את הפנייה של ${l.name} כספאם?\n\nהיא לא תיכנס ללקוחות.`)) return;
            spam();
          }}>
          ספאם
        </button>
      </div>

      {err && <div style={{ color: "#B03B2C", fontSize: 13, marginTop: 10 }}>{err}</div>}
    </div>
  );
}
