"use client";

import { must } from "@/lib/action-result";
import { useState, useTransition } from "react";
import { approveForProduction } from "@/app/project-actions";

/** Nothing reaches the floor until this list is green. */
export function ApprovePanel({ projectId, checks, canApprove }: {
  projectId: string;
  checks: { ok: boolean; label: string }[];
  canApprove: boolean;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ready = checks.every((c) => c.ok);

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h4 className="mono" style={{ fontSize: 10, letterSpacing: ".22em", color: "var(--dim)", margin: "0 0 16px" }}>
        מוכנות לאישור
      </h4>

      {checks.map((c) => (
        <div key={c.label} style={{
          display: "flex", alignItems: "center", gap: 11, padding: "11px 0",
          borderBottom: "1px solid var(--line-soft)", fontSize: 14,
          color: c.ok ? undefined : "var(--steel)",
        }}>
          <span style={{
            width: 20, height: 20, borderRadius: 99, display: "grid", placeItems: "center", fontSize: 11,
            border: `1px solid ${c.ok ? "rgba(63,169,106,.5)" : "var(--line)"}`,
            background: c.ok ? "rgba(63,169,106,.16)" : undefined,
            color: c.ok ? "#7FD4A0" : "var(--dim)",
          }}>{c.ok ? "✓" : "—"}</span>
          {c.label}
        </div>
      ))}

      <button className={`btn btn-big${ready && canApprove ? " btn-primary" : ""}`}
        style={{ marginTop: 18 }} disabled={!ready || !canApprove || pending}
        onClick={() => start(async () => {
          try { await must(approveForProduction(projectId)); } catch (e: any) { setErr(e.message); }
        })}>
        {pending ? "מאשר…" : "אשר פרויקט לייצור"}
      </button>

      {!canApprove && (
        <div style={{ marginTop: 11, fontSize: 12, color: "var(--steel)" }}>
          רק ואדים או מקס יכולים לאשר פרויקט.
        </div>
      )}
      {err && <div style={{ color: "#F0897A", fontSize: 13, marginTop: 10 }}>{err}</div>}
    </div>
  );
}
