"use client";

import { must } from "@/lib/action-result";
import { useState, useTransition } from "react";
import { signPlansGate, signReleaseGate } from "@/app/actions";

/**
 * The two manager checkpoints. Gold with a lock, not red — red means a
 * production fault; this is a signature that hasn't happened yet.
 */
export function GateCard({ kind, ready, signed, signedBy, signedAt, targetId, canSign }: {
  kind: "plans" | "release";
  ready: boolean; signed: boolean;
  signedBy?: string | null; signedAt?: string | null;
  targetId: string; canSign: boolean;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const title = kind === "plans" ? "אישור תוכניות לביצוע" : "בקרה לפני אריזה";
  const owner = kind === "plans" ? "מקס" : "ואדים או מקס";
  const holds = kind === "plans" ? "כל שלבי הייצור" : "אריזה והתקנה";

  return (
    <div className="panel" style={{
      margin: "14px 0",
      borderColor: signed ? "rgba(63,169,106,.4)" : ready ? "rgba(201,146,79,.55)" : "var(--line)",
      background: ready && !signed
        ? "linear-gradient(90deg,rgba(201,146,79,.14),rgba(255,255,255,.012))" : undefined,
      opacity: !ready && !signed ? 0.72 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span style={{
          width: 34, height: 34, borderRadius: 99, display: "grid", placeItems: "center",
          border: "1px solid var(--line)", color: signed ? "#7FD4A0" : "var(--bronze-lt)",
        }}>{signed ? "✓" : "🔒"}</span>

        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 16 }}>{title}</div>
          <div style={{ fontSize: 12, color: "var(--steel)", marginTop: 5, lineHeight: 1.6 }}>
            {signed ? `אושר ע״י ${signedBy ?? ""} · ${signedAt ? new Date(signedAt).toLocaleString("he-IL") : ""}`
              : ready ? `הכל מוכן — ממתין לחתימת ${owner}. עד אז ${holds} נעולים.`
                : `ייפתח לחתימה בסוף השלב הקודם. עד אז ${holds} נעולים.`}
          </div>
        </div>

        {!signed && canSign && (
          <button className={`btn${ready ? " btn-primary" : ""}`} disabled={!ready || pending}
            onClick={() => start(async () => {
              try {
                kind === "plans" ? await must(signPlansGate(targetId)) : await must(signReleaseGate(targetId));
              } catch (e: any) { setErr(e.message); }
            })}>
            {kind === "plans" ? "מאושר לביצוע" : "מאושר לאריזה"}
          </button>
        )}
        {!signed && !canSign && <span className="chip gold">חתימה של {owner}</span>}
      </div>
      {err && <div style={{ color: "#F0897A", fontSize: 13, marginTop: 10 }}>{err}</div>}
    </div>
  );
}
