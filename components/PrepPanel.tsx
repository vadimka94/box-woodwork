"use client";

import Link from "next/link";
import { must } from "@/lib/action-result";
import { useRef, useState, useTransition } from "react";
import { setProjectPrep, updatePrepNote } from "@/app/project-actions";
import { createInstallation } from "@/app/schedule-actions";

type P = { id: string; full_name: string; role: string };

/**
 * Two-phase jobs. A few jobs a year cannot be measured on the first visit:
 * a drywall wall has to come down, or infrastructure has to be run, and only
 * then do the real measurements exist. That work is a stage of the project,
 * not an item — an item would drag the whole production chain behind it.
 *
 * This panel owns the three things that stage needs: the switch, a line
 * saying what has to be done on site, and a day on the calendar for it.
 */
export function PrepPanel({ project, prepVisit, profiles, isAdmin, children }: {
  project: any;
  prepVisit: any | null;
  profiles: P[];
  isAdmin: boolean;
  /** the seq-0 stage row, rendered by the page so it looks like every other stage */
  children?: React.ReactNode;
}) {
  const on = !!project.prep_required;

  if (!on) return isAdmin ? <TurnOn projectId={project.id} /> : null;

  return (
    <div className="panel" style={{ marginTop: 16, borderColor: "rgba(201,146,79,.6)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <h4 className="mono" style={{ margin: 0, fontSize: 10, letterSpacing: ".22em", color: "var(--dim)" }}>
          שלב מקדים
        </h4>
        <span className="chip gold">פרויקט דו-שלבי</span>
      </div>

      <Note projectId={project.id} note={project.prep_note} isAdmin={isAdmin} />

      {children}

      <Visit projectId={project.id} visit={prepVisit} profiles={profiles} isAdmin={isAdmin} />

      <div style={{ marginTop: 14, fontSize: 12, color: "var(--steel)", lineHeight: 1.7 }}>
        מדידה, תכנון וכל שלבי הייצור נעולים עד שהשלב הזה מסומן כבוצע.
      </div>

      {isAdmin && <TurnOff projectId={project.id} />}
    </div>
  );
}

/* ---------- what has to be done on site ---------- */

function Note({ projectId, note, isAdmin }: { projectId: string; note: string | null; isAdmin: boolean }) {
  const [edit, setEdit] = useState(false);
  const [value, setValue] = useState(note ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!edit) {
    return (
      <div style={{
        padding: "13px 15px", borderRadius: 12, fontSize: 14, lineHeight: 1.8,
        background: "rgba(201,146,79,.1)", borderInlineStart: "3px solid var(--bronze)",
      }}>
        {value || <span style={{ color: "var(--steel)" }}>לא נכתב מה צריך לעשות בשטח.</span>}
        {isAdmin && (
          <button className="btn" onClick={() => setEdit(true)}
            style={{ display: "block", marginTop: 10, fontSize: 12, padding: "6px 12px" }}>
            {value ? "ערוך" : "כתוב מה צריך לעשות"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <label style={{ display: "block", fontSize: 12, color: "var(--steel)", marginBottom: 7 }}>
        מה צריך לעשות בשטח
      </label>
      <textarea rows={2} value={value} onChange={(e) => setValue(e.target.value)}
        placeholder="למשל: פירוק קיר הגבס בכניסה והעברת תשתית חשמל לארון" />
      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <button className="btn btn-primary" disabled={pending}
          onClick={() => start(async () => {
            try { await must(updatePrepNote(projectId, value)); setEdit(false); }
            catch (e: any) { setErr(e.message); }
          })}>{pending ? "שומר…" : "שמור"}</button>
        <button className="btn" onClick={() => { setValue(note ?? ""); setEdit(false); }}>ביטול</button>
      </div>
      {err && <div style={{ color: "#B03B2C", fontSize: 13, marginTop: 8 }}>{err}</div>}
    </div>
  );
}

/* ---------- the day on the calendar ---------- */

function Visit({ projectId, visit, profiles, isAdmin }: {
  projectId: string; visit: any | null; profiles: P[]; isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);

  if (visit) {
    return (
      <div style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span className="mono" style={{ fontSize: 12, color: "var(--bronze-lt)" }}>
          יציאה לשטח · {visit.scheduled_date}
          {visit.start_time ? ` · ${String(visit.start_time).slice(0, 5)}` : ""}
        </span>
        <Link className="btn" href={`/schedule/${visit.id}`} style={{ textDecoration: "none" }}>
          פרטי היציאה ←
        </Link>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="lockbar" style={{ marginTop: 14 }}>טרם נקבע תאריך ליציאה לשטח.</div>
    );
  }

  if (!open) {
    return (
      <div style={{ marginTop: 14 }}>
        <div className="lockbar" style={{ marginBottom: 10 }}>
          עבודת ההכנה תופסת יום עבודה בשטח — כדאי שתהיה ביומן.
        </div>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>+ קבע יציאה לעבודת ההכנה</button>
      </div>
    );
  }

  return (
    <form ref={ref} style={{ marginTop: 14 }}
      action={(fd) => start(async () => {
        try { await must(createInstallation(fd)); ref.current?.reset(); setOpen(false); }
        catch (e: any) { setErr(e.message); }
      })}>
      <input type="hidden" name="kind" value="project" />
      <input type="hidden" name="purpose" value="prep" />
      <input type="hidden" name="project_id" value={projectId} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14 }}>
        <div>
          <label>תאריך</label>
          <input name="scheduled_date" type="date" required style={{ marginTop: 7 }} />
        </div>
        <div>
          <label>שעת יציאה</label>
          <input name="start_time" type="time" style={{ marginTop: 7 }} />
        </div>
        <div>
          <label>כתובת האתר</label>
          <input name="address" placeholder="אם שונה מכתובת הלקוח" style={{ marginTop: 7 }} />
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <label>הערות לצוות</label>
        <textarea name="note" rows={2} placeholder="מה מפרקים, איפה פוגשים, כלים שצריך לקחת…"
          style={{ marginTop: 7 }} />
      </div>

      <div style={{ marginTop: 14 }}>
        <label>מי יוצא</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {profiles.map((p) => (
            <label key={p.id} className="chip" style={{ cursor: "pointer", padding: "9px 14px", fontSize: 12 }}>
              <input type="checkbox" name="crew" value={p.id} style={{ width: "auto", marginInlineEnd: 7 }} />
              {p.full_name}
            </label>
          ))}
        </div>
      </div>

      {err && <div style={{ color: "#B03B2C", fontSize: 13, marginTop: 12 }}>{err}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button className="btn btn-primary" disabled={pending}>{pending ? "שומר…" : "קבע יציאה"}</button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>ביטול</button>
      </div>
    </form>
  );
}

/* ---------- the switch ---------- */

function TurnOn({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)} style={{ marginTop: 16 }}>
        + העבודה דורשת הכנה בשטח לפני המדידה
      </button>
    );
  }

  return (
    <div className="panel" style={{ marginTop: 16, borderColor: "rgba(201,146,79,.6)" }}>
      <h4 className="mono">הוספת שלב הכנה בשטח</h4>
      <div style={{ fontSize: 13, color: "var(--steel)", lineHeight: 1.8, marginBottom: 14 }}>
        ייווצר שלב חדש לפני המדידה. מדידה, תכנון וכל שלבי הייצור יישארו נעולים
        עד שהוא יסומן כבוצע.
      </div>
      <label style={{ display: "block", fontSize: 12, color: "var(--steel)", marginBottom: 7 }}>
        מה צריך לעשות בשטח
      </label>
      <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="למשל: פירוק קיר הגבס בכניסה והעברת תשתית חשמל לארון" />
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button className="btn btn-primary" disabled={pending}
          onClick={() => start(async () => {
            try { await must(setProjectPrep(projectId, true, note)); setOpen(false); }
            catch (e: any) { setErr(e.message); }
          })}>{pending ? "מוסיף…" : "הוסף שלב הכנה"}</button>
        <button className="btn" onClick={() => setOpen(false)}>ביטול</button>
      </div>
      {err && <div style={{ color: "#B03B2C", fontSize: 13, marginTop: 10 }}>{err}</div>}
    </div>
  );
}

function TurnOff({ projectId }: { projectId: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      <button className="btn" disabled={pending}
        style={{ marginTop: 12, fontSize: 12, padding: "7px 13px" }}
        onClick={() => {
          if (!confirm("לבטל את שלב ההכנה? הפרויקט יחזור להתחיל במדידה.")) return;
          start(async () => {
            try { await must(setProjectPrep(projectId, false)); } catch (e: any) { setErr(e.message); }
          });
        }}>
        בטל את שלב ההכנה
      </button>
      {err && <div style={{ color: "#B03B2C", fontSize: 13, marginTop: 8 }}>{err}</div>}
    </>
  );
}
