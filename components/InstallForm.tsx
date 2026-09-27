"use client";

import { must } from "@/lib/action-result";
import { useRef, useState, useTransition } from "react";
import { createInstallation, setInstallCrew, setInstallStatus } from "@/app/schedule-actions";

type P = { id: string; full_name: string; role: string };

export function NewInstallation({ projects, profiles }: { projects: any[]; profiles: P[] }) {
  const [open, setOpen] = useState(false);
  /* "other" = work with no project card: a pop-up job, or a standing site */
  const [kind, setKind] = useState<"project" | "other">("project");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);

  if (!open) {
    return <button className="btn btn-primary" onClick={() => setOpen(true)}>+ קבע התקנה</button>;
  }

  const other = kind === "other";

  return (
    <form ref={ref} className="panel"
      action={(fd) => start(async () => {
        try { await must(createInstallation(fd)); ref.current?.reset(); setOpen(false); setKind("project"); }
        catch (e: any) { setErr(e.message); }
      })}>
      <input type="hidden" name="kind" value={kind} />

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <KindTab on={!other} onPick={() => { setKind("project"); setErr(null); }}
          title="פרויקט" desc="התקנה של עבודה שיש לה כרטיס פרויקט" />
        <KindTab on={other} onPick={() => { setKind("other"); setErr(null); }}
          title="אחר" desc="עבודה מזדמנת או אתר קבוע — בלי פרויקט" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          {other ? (
            <>
              <label>במה מדובר</label>
              <input name="title" required placeholder='למשל: קמ"ג דימונה — הרכבת ארונות'
                style={{ marginTop: 7 }} />
            </>
          ) : (
            <>
              <label>פרויקט</label>
              <select name="project_id" required style={{ marginTop: 7 }}>
                <option value="">— בחר —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.code} · {p.name} · {p.client_name}</option>
                ))}
              </select>
            </>
          )}
        </div>
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
          <input name="address" required={other}
            placeholder={other ? "לאן נוסעים" : "אם שונה מכתובת הלקוח"} style={{ marginTop: 7 }} />
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <label>הערות לצוות</label>
        <textarea name="note" rows={2} placeholder="חניה, קומה, מעלית, מי פותח…" style={{ marginTop: 7 }} />
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

      {err && <div style={{ color: "#F0897A", fontSize: 13, marginTop: 12 }}>{err}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "שומר…" : other ? "קבע עבודה" : "קבע התקנה"}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>ביטול</button>
      </div>
    </form>
  );
}

function KindTab({ title, desc, on, onPick }: {
  title: string; desc: string; on: boolean; onPick: () => void;
}) {
  return (
    <button type="button" onClick={onPick}
      style={{
        flex: 1, textAlign: "start", padding: "12px 14px", borderRadius: 12,
        border: `2px solid ${on ? "var(--bronze)" : "var(--line)"}`,
        background: on ? "rgba(201,146,79,.1)" : "transparent",
      }}>
      <div style={{ fontSize: 15, color: on ? "var(--bronze-lt)" : undefined }}>
        {on ? "● " : "○ "}{title}
      </div>
      <div style={{ fontSize: 11, color: "var(--steel)", marginTop: 5, lineHeight: 1.5 }}>{desc}</div>
    </button>
  );
}

export function InstallCrew({ installationId, profiles, current }: {
  installationId: string; profiles: P[]; current: string[];
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {profiles.map((p) => (
        <CrewChip key={p.id} installationId={installationId} profile={p} on={current.includes(p.id)} />
      ))}
    </div>
  );
}

function CrewChip({ installationId, profile, on }: { installationId: string; profile: P; on: boolean }) {
  const [active, setActive] = useState(on);
  const [pending, start] = useTransition();
  return (
    <button className="chip" disabled={pending}
      style={{
        cursor: "pointer", padding: "7px 13px", fontSize: 11,
        borderColor: active ? "var(--bronze)" : "var(--line)",
        color: active ? "var(--bronze-lt)" : "var(--steel)",
        background: active ? "rgba(201,146,79,.14)" : undefined,
      }}
      onClick={() => {
        const next = !active; setActive(next);
        start(async () => {
          try { await must(setInstallCrew(installationId, profile.id, next)); }
          catch { setActive(!next); }
        });
      }}>
      {profile.full_name}
    </button>
  );
}


/** Closing out an installation, or calling it off. */
export function InstallStatus({ installationId, status }: { installationId: string; status: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = (s: "planned" | "done" | "cancelled") =>
    start(async () => { try { await must(setInstallStatus(installationId, s)); } catch (e: any) { setErr(e.message); } });

  return (
    <>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {status !== "done" && <button className="btn btn-go" disabled={pending} onClick={() => go("done")}>ההתקנה בוצעה ✓</button>}
        {status === "done" && <button className="btn" disabled={pending} onClick={() => go("planned")}>החזר למתוכננת</button>}
        <button className="btn btn-stop" disabled={pending}
          onClick={() => { if (confirm("לבטל את ההתקנה?")) go("cancelled"); }}>בטל התקנה</button>
      </div>
      {err && <div style={{ color: "#B03B2C", fontSize: 13, marginTop: 8 }}>{err}</div>}
    </>
  );
}
