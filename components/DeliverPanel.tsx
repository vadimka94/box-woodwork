"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { must } from "@/lib/action-result";
import { markDelivered, undoDelivered } from "@/app/delivery-actions";

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "";

type Owed = { id: string; title: string; status: string };

/**
 * The last button on a job, and the only one that ends it. It stays grey until
 * every stage is actually done — a project closed by accident is far more
 * expensive to notice than one closed a day late.
 */
export function DeliverPanel({
  projectId, code, kind, deliveredAt, deliveredBy, deliveryNote,
  stagesLeft, owed, canDeliver, isAdmin,
}: {
  projectId: string;
  code: string;
  kind: string | null;
  deliveredAt: string | null;
  deliveredBy: string | null;
  deliveryNote: string | null;
  stagesLeft: number;
  owed: Owed[];
  canDeliver: boolean;
  isAdmin: boolean;
}) {
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const word = kind === "contractor" ? "נאסף" : "נמסר";
  const what = kind === "contractor"
    ? "הקבלן אסף את העבודה מהמפעל"
    : "ההתקנה בוצעה והעבודה נמסרה ללקוח";

  /* delivered, but the shop still owes something */
  if (deliveredAt) {
    return (
      <div className="panel" style={{ marginTop: 16, borderColor: "rgba(185,106,24,.45)" }}>
        <h4 className="mono">{word} — ממתין להשלמה</h4>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="chip work">{word} · {fmt(deliveredAt)}</span>
          {deliveredBy && (
            <span className="mono" style={{ fontSize: 11, color: "var(--dim)" }}>{deliveredBy}</span>
          )}
        </div>

        {deliveryNote && (
          <div style={{ fontSize: 13, color: "var(--steel)", marginTop: 10, lineHeight: 1.7 }}>
            {deliveryNote}
          </div>
        )}

        <div style={{ marginTop: 14, fontSize: 13, color: "var(--steel)", lineHeight: 1.8 }}>
          העבודה יצאה, אבל נשאר מה להשלים. הפרויקט ירד מהרשימות ומהמסך במפעל,
          והוא ייכנס לארכיון לבד ברגע שהחוסר האחרון ייסגר.
        </div>

        <div style={{ marginTop: 14 }}>
          {owed.map((o) => (
            <div key={o.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 0", borderTop: "1px solid var(--line-soft)",
            }}>
              <span className={`chip ${o.status === "work" ? "work" : "stop"}`}>
                {o.status === "work" ? "בעבודה" : "פתוח"}
              </span>
              <span style={{ fontSize: 14 }}>{o.title}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <Link href="/extras" className="btn" style={{ textDecoration: "none" }}>
            לחוסרים ותוספות
          </Link>
          {isAdmin && (
            <button className="btn" disabled={pending}
              onClick={() => {
                if (!confirm(`לבטל את סימון ה${word} על ${code}?\n\nהפרויקט יחזור לרשימות הפעילות.`)) return;
                start(async () => {
                  try { await must(undoDelivered(projectId)); } catch (e: any) { setErr(e.message); }
                });
              }}>
              בטל סימון
            </button>
          )}
        </div>

        {err && <div style={{ color: "#B03B2C", fontSize: 13, marginTop: 12 }}>{err}</div>}
      </div>
    );
  }

  const blocked = stagesLeft > 0 || !canDeliver;
  const why = !canDeliver
    ? "רק מנהל או הצוות שביצע את העבודה יכולים לסמן את זה."
    : stagesLeft > 0
      ? `נשארו ${stagesLeft} שלבים שלא הושלמו. הכפתור יידלק כשכולם יסומנו כבוצע.`
      : null;

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <h4 className="mono">סיום העבודה</h4>

      <div style={{ fontSize: 14, color: "var(--steel)", lineHeight: 1.8, marginBottom: 14 }}>
        לחיצה על "{word}" אומרת ש{what}.
        {" "}אם אין חוסרים פתוחים, הפרויקט עובר לארכיון מיד.
        {" "}אם יש — הוא ימתין להשלמתם וייסגר לבד.
      </div>

      {!blocked && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 12, color: "var(--steel)", marginBottom: 7 }}>
            הערת מסירה (לא חובה)
          </label>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="מי קיבל, מה נמסר, הערות מהשטח" />
        </div>
      )}

      {owed.length > 0 && (
        <div style={{
          marginBottom: 14, padding: "11px 13px", borderRadius: 10,
          background: "rgba(201,146,79,.12)", fontSize: 13, color: "#7E5620", lineHeight: 1.7,
        }}>
          יש {owed.length} חוסרים פתוחים בפרויקט. אפשר לסמן ש{word} —
          הפרויקט ימתין להשלמתם ולא ייכנס לארכיון עד אז.
        </div>
      )}

      <button className="btn btn-go btn-big" disabled={pending || blocked}
        onClick={() => {
          const tail = owed.length
            ? `\n\nנשארו ${owed.length} חוסרים פתוחים — הפרויקט ימתין להשלמתם.`
            : "\n\nהפרויקט יעבור לארכיון.";
          if (!confirm(`לסמן ש${code} ${word}?${tail}`)) return;
          start(async () => {
            try { await must(markDelivered(projectId, note)); } catch (e: any) { setErr(e.message); }
          });
        }}>
        {pending ? "שומר…" : `${word} ✓`}
      </button>

      {why && (
        <div style={{ marginTop: 12, fontSize: 12, color: "var(--dim)", lineHeight: 1.7 }}>{why}</div>
      )}

      {err && <div style={{ color: "#B03B2C", fontSize: 13, marginTop: 12 }}>{err}</div>}
    </div>
  );
}
