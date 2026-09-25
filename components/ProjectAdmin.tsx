"use client";

import { must } from "@/lib/action-result";
import { useState, useTransition } from "react";
import { closeProject, reopenProject, deleteProject } from "@/app/archive-actions";

/** Closing is reversible. Deleting is not, so it asks twice and spells out what goes. */
export function ProjectAdmin({ projectId, code, status }: {
  projectId: string; code: string; status: string;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const closed = status === "done";

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <h4 className="mono">ניהול הפרויקט</h4>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {!closed ? (
          <button className="btn btn-go" disabled={pending}
            onClick={() => start(async () => {
              try { await must(closeProject(projectId)); } catch (e: any) { setErr(e.message); }
            })}>
            סגור פרויקט ✓
          </button>
        ) : (
          <button className="btn" disabled={pending}
            onClick={() => start(async () => {
              try { await must(reopenProject(projectId)); } catch (e: any) { setErr(e.message); }
            })}>
            פתח מחדש
          </button>
        )}

        <button className="btn btn-stop" disabled={pending}
          onClick={() => {
            if (!confirm(`למחוק את ${code} לצמיתות?\n\nיימחקו גם כל הפריטים, השלבים, החתימות, התקלות, ההתקנות, החוסרים והקבצים.`)) return;
            const typed = prompt(`אין דרך לשחזר.\nכדי לאשר, הקלד את מספר הפרויקט: ${code}`);
            if (typed !== code) { if (typed !== null) alert("המספר לא תואם. המחיקה בוטלה."); return; }
            start(async () => { try { await must(deleteProject(projectId)); } catch (e: any) { setErr(e.message); } });
          }}>
          מחק לצמיתות
        </button>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "var(--steel)", lineHeight: 1.7 }}>
        סגירה מעבירה לארכיון ומורידה מהרשימות וממסך המפעל — אפשר לפתוח מחדש בכל רגע.
        מחיקה היא סופית.
      </div>

      {err && <div style={{ color: "#B03B2C", fontSize: 13, marginTop: 10 }}>{err}</div>}
    </div>
  );
}
