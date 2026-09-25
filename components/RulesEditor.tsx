"use client";

import { must } from "@/lib/action-result";
import { useState, useTransition } from "react";
import { toggleDefault, applyDefaults } from "@/app/rules-actions";

type Row = { scope: "project" | "item"; seq: number; name: string; crew: string[] };
type Profile = { id: string; full_name: string; role: string };

export function RulesEditor({ profiles, project, item }: {
  profiles: Profile[]; project: Row[]; item: Row[];
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div style={{ maxWidth: 860 }}>
      <Section title="שלבי הפרויקט" rows={project} profiles={profiles} onErr={setErr} />
      <Section title="שלבי הפריט" rows={item} profiles={profiles} onErr={setErr} />

      <div className="panel">
        <h4 className="mono" style={{ fontSize: 10, letterSpacing: ".22em", color: "var(--dim)", margin: "0 0 12px" }}>
          שני השערים
        </h4>
        <div style={{ fontSize: 14, lineHeight: 1.9 }}>
          אישור תוכניות לביצוע — מקס<br />
          בקרה לפני אריזה — ואדים או מקס
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--steel)", lineHeight: 1.7 }}>
          שערי החתימה לא משתנים בשיוך אוטומטי. ההרשאה נקבעת על העובד עצמו בדאטהבייס,
          בשדות <span className="mono">can_approve_plans</span> ו-<span className="mono">can_release</span>.
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 16 }}>
        <button className="btn" disabled={pending}
          onClick={() => {
            if (!confirm("לשייך מחדש את כל השלבים שטרם התחילו, לפי הכללים האלה?")) return;
            start(async () => {
              try {
                const { touched } = await must(applyDefaults());
                setMsg(`${touched} שלבים שויכו מחדש.`);
              } catch (e: any) { setErr(e.message); }
            });
          }}>
          {pending ? "מחיל…" : "החל על שלבים שטרם התחילו"}
        </button>
        {msg && <span style={{ fontSize: 13, color: "#7FD4A0" }}>{msg}</span>}
      </div>

      {err && <div style={{ color: "#F0897A", fontSize: 13, marginTop: 12 }}>{err}</div>}

      <div style={{ marginTop: 12, fontSize: 12, color: "var(--steel)", lineHeight: 1.7 }}>
        שלב שכבר בעבודה או שבוצע לא ישתנה — הרישום של מי שעשה את העבודה נשאר כמו שהוא.
      </div>
    </div>
  );
}

function Section({ title, rows, profiles, onErr }: {
  title: string; rows: Row[]; profiles: Profile[]; onErr: (s: string) => void;
}) {
  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h4 className="mono" style={{ fontSize: 10, letterSpacing: ".22em", color: "var(--dim)", margin: "0 0 8px" }}>
        {title}
      </h4>
      {rows.map((r) => (
        <div key={`${r.scope}-${r.seq}`} style={{
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          padding: "13px 0", borderBottom: "1px solid var(--line-soft)",
        }}>
          <span className="mono" style={{ fontSize: 10, color: "var(--dim)", width: 22 }}>
            {String(r.seq).padStart(2, "0")}
          </span>
          <span style={{ fontSize: 14, minWidth: 110 }}>{r.name}</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {profiles.map((p) => (
              <Chip key={p.id} row={r} profile={p} onErr={onErr} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Chip({ row, profile, onErr }: { row: Row; profile: Profile; onErr: (s: string) => void }) {
  const [on, setOn] = useState(row.crew.includes(profile.id));
  const [pending, start] = useTransition();

  return (
    <button className="chip" disabled={pending}
      style={{
        cursor: "pointer", padding: "7px 13px", fontSize: 11,
        borderColor: on ? "var(--bronze)" : "var(--line)",
        color: on ? "var(--bronze-lt)" : "var(--steel)",
        background: on ? "rgba(201,146,79,.14)" : undefined,
        opacity: pending ? 0.5 : 1,
      }}
      onClick={() => {
        const next = !on;
        setOn(next);
        start(async () => {
          try { await must(toggleDefault(row.scope, row.seq, profile.id, next)); }
          catch (e: any) { setOn(!next); onErr(e.message); }
        });
      }}>
      {profile.full_name}
    </button>
  );
}
