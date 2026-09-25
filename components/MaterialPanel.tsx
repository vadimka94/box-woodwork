"use client";

import { must } from "@/lib/action-result";
import { useState, useTransition } from "react";
import { orderMaterial, materialArrived, newSketchRound } from "@/app/material-actions";

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" }) : "";

/**
 * Material is the hinge of a contractor job: nothing can be cut before it
 * arrives, and an order that never shows up is the quietest way for a job to
 * die. So it gets its own panel with a date, not a checkbox.
 */
export function MaterialPanel({ projectId, orderedAt, eta, arrivedAt, note, sketchRound }: {
  projectId: string;
  orderedAt: string | null;
  eta: string | null;
  arrivedAt: string | null;
  note: string | null;
  sketchRound: number;
}) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const late = eta && !arrivedAt && new Date(eta) < new Date();

  return (
    <div className="panel" style={{
      marginTop: 16,
      borderColor: arrivedAt ? "rgba(46,131,85,.45)"
        : late ? "rgba(176,59,44,.5)"
        : orderedAt ? "rgba(185,106,24,.45)" : undefined,
    }}>
      <h4 className="mono">חומר</h4>

      {!orderedAt && (
        <>
          <div style={{ fontSize: 14, color: "var(--steel)", lineHeight: 1.7, marginBottom: 14 }}>
            עד שהחומר לא הוזמן, שלבי הייצור נעולים. סמן כאן אחרי הפירוק ללוחות.
          </div>

          {!open ? (
            <button className="btn btn-primary" onClick={() => setOpen(true)}>הזמנתי חומר</button>
          ) : (
            <form action={(fd) => start(async () => {
              try {
                await must(orderMaterial(projectId, String(fd.get("eta") ?? ""), String(fd.get("note") ?? "")));
                setOpen(false);
              } catch (e: any) { setErr(e.message); }
            })}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label>תאריך אספקה צפוי</label>
                  <input name="eta" type="date" style={{ marginTop: 7 }} />
                </div>
                <div>
                  <label>ספק / הערה</label>
                  <input name="note" placeholder="שם הספק, מספר הזמנה" style={{ marginTop: 7 }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button className="btn btn-primary" disabled={pending}>
                  {pending ? "שומר…" : "שמור"}
                </button>
                <button type="button" className="btn" onClick={() => setOpen(false)}>ביטול</button>
              </div>
            </form>
          )}
        </>
      )}

      {orderedAt && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {arrivedAt
              ? <span className="chip go">החומר הגיע · {fmt(arrivedAt)}</span>
              : late
                ? <span className="chip stop">איחור באספקה</span>
                : <span className="chip work">הוזמן — ממתין לאספקה</span>}
            {eta && !arrivedAt && (
              <span className="mono" style={{ fontSize: 13, color: "var(--steel)" }}>
                צפוי {fmt(eta)}
              </span>
            )}
          </div>

          {note && (
            <div style={{ fontSize: 13, color: "var(--steel)", marginTop: 10 }}>{note}</div>
          )}

          {!arrivedAt && (
            <button className="btn btn-go" style={{ marginTop: 14 }} disabled={pending}
              onClick={() => start(async () => {
                try { await must(materialArrived(projectId)); } catch (e: any) { setErr(e.message); }
              })}>
              החומר הגיע ✓
            </button>
          )}
        </>
      )}

      {/* sketch rounds live here too — the contractor asking for a change is
          a normal event in this flow, not an exception */}
      <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line-soft)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="chip">סקיצה — סבב {sketchRound}</span>
          <button className="btn" disabled={pending}
            onClick={() => {
              if (!confirm("הקבלן ביקש שינוי? הסקיצה תחזור לתכנון וסבב חדש ייפתח.")) return;
              start(async () => {
                try { await must(newSketchRound(projectId)); } catch (e: any) { setErr(e.message); }
              });
            }}>
            הקבלן ביקש שינוי
          </button>
        </div>
      </div>

      {err && <div style={{ color: "#B03B2C", fontSize: 13, marginTop: 12 }}>{err}</div>}
    </div>
  );
}
