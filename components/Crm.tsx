"use client";

import { must } from "@/lib/action-result";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addLead, updateCustomer, updateLead, setStage, addNote,
  uploadLeadFiles, markLost, reopenLead, markWon, undoWon, findCustomer, mergeCustomers,
} from "@/app/crm-actions";
import {
  STAGES, STYLE_LABEL, SOURCE_OPTIONS, LOST_REASONS, FILE_KIND_LABEL, KIND_LABEL,
  stageLabel, toLocalInput, todayIL, addBusinessDays, type LeadStage,
} from "@/lib/crm-labels";

/* ---------- shared bits ---------- */

const Err = ({ msg }: { msg: string | null }) =>
  msg ? (
    <div style={{
      color: "#B03B2C", fontSize: 13, marginTop: 12, padding: "10px 12px", borderRadius: 10,
      background: "rgba(216,80,63,.08)", border: "1px solid rgba(216,80,63,.3)",
    }}>{msg}</div>
  ) : null;

const Saved = ({ on }: { on: boolean }) =>
  on ? <span style={{ fontSize: 13, color: "var(--go)" }}>נשמר ✓</span> : null;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", marginBottom: 7 }}>{label}</label>
      {children}
    </div>
  );
}

const Two = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 }}>{children}</div>
);

/** Runs a server action, shows the error, and flashes "נשמר". */
function useAction() {
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    start(async () => {
      setErr(null); setSaved(false);
      try {
        const r: any = await fn();
        if (r && typeof r === "object" && r.ok === false) throw new Error(r.error);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        after?.();
      } catch (e: any) { setErr(e?.message ?? "שגיאה"); }
    });
  return { err, saved, pending, run };
}

/* ---------- quick add ---------- */

type Match = { id: string; name: string; city: string | null; kind: string; deals: number; won: number; open: number };

/**
 * "פנייה חדשה". While the phone number is typed, the system checks whether
 * this person is already a customer and says so before anything is saved.
 * `customer` = opened from a customer card: the details are already known.
 */
export function QuickAdd({ customer, startOpen = false }: {
  customer?: { id: string; name: string; kind: string };
  startOpen?: boolean;
} = {}) {
  const [open, setOpen] = useState(startOpen);
  const [kind, setKind] = useState<"private" | "contractor">(
    customer?.kind === "contractor" ? "contractor" : "private");
  const [match, setMatch] = useState<Match | null>(null);
  const [useMatch, setUseMatch] = useState(true);
  const [checking, setChecking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { err, pending, run } = useAction();
  const router = useRouter();

  const lookup = (phone: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setChecking(true);
      const r = await findCustomer(phone).catch(() => null);
      setChecking(false);
      const m = r && r.ok ? r.data : null;
      setMatch(m);
      setUseMatch(true);
      if (m?.kind === "contractor") setKind("contractor");
    }, 450);
  };

  if (!open) {
    return (
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        + {customer ? "עסקה חדשה ללקוח" : "פנייה חדשה"}
      </button>
    );
  }

  const linked = customer ?? (match && useMatch ? match : null);

  return (
    <form className="panel" style={{ maxWidth: 640 }}
      action={(fd) => run(async () => {
        if (linked) fd.set("customer_id", linked.id);
        else if (match && !useMatch) fd.set("force_new", "1");
        const { id } = await must(addLead(fd));
        router.push(`/crm/${id}`);
      })}>
      <input type="hidden" name="kind" value={kind} />
      {customer && (
        <h4 className="mono">עסקה חדשה · {customer.name}</h4>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["private", "contractor"] as const).map((k) => (
          <button key={k} type="button" className="chip"
            onClick={() => setKind(k)}
            style={{
              cursor: "pointer", padding: "9px 16px", fontSize: 12,
              borderColor: kind === k ? "var(--bronze)" : "var(--line)",
              color: kind === k ? "var(--bronze-lt)" : "var(--steel)",
              background: kind === k ? "rgba(201,146,79,.12)" : undefined,
            }}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {!customer && (
        <>
          <Two>
            <Field label="טלפון">
              <input name="phone" type="tel" inputMode="tel" placeholder="052-0000000" autoFocus
                onChange={(e) => lookup(e.target.value)} />
            </Field>
            <Field label={linked ? "שם (שמור בכרטיס)" : "שם *"}>
              <input key={linked ? `c-${linked.id}` : "free"} name="name"
                required={!linked} disabled={!!linked}
                defaultValue={linked ? linked.name : ""}
                placeholder={kind === "contractor" ? "שם הקבלן או החברה" : "משפחת כהן"} />
            </Field>
          </Two>

          {checking && <div style={{ fontSize: 12, color: "var(--steel)", marginBottom: 10 }}>בודק אם הלקוח כבר קיים…</div>}

          {match && (
            <div className="panel" style={{
              padding: 14, marginBottom: 14,
              borderColor: useMatch ? "rgba(46,131,85,.5)" : "var(--line)",
              background: useMatch ? "rgba(46,131,85,.06)" : undefined,
            }}>
              <div style={{ fontSize: 15 }}>
                {useMatch ? "✓ " : ""}לקוח קיים: <strong>{match.name}</strong>
                {match.city ? ` · ${match.city}` : ""}
              </div>
              <div style={{ fontSize: 13, color: "var(--steel)", marginTop: 4 }}>
                {match.deals === 0 ? "אין לו עדיין עסקאות" :
                  `${match.deals} עסקאות קודמות · ${match.won} נסגרו${match.open ? ` · ${match.open} פתוחות עכשיו` : ""}`}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <a className="btn" href={`/crm/customers/${match.id}`} target="_blank" rel="noreferrer"
                  style={{ textDecoration: "none", padding: "7px 12px" }}>לכרטיס הלקוח</a>
                {useMatch ? (
                  <button type="button" className="btn" style={{ padding: "7px 12px" }}
                    onClick={() => setUseMatch(false)}>זה לקוח אחר — פתח כרטיס חדש</button>
                ) : (
                  <button type="button" className="btn btn-go" style={{ padding: "7px 12px" }}
                    onClick={() => setUseMatch(true)}>כן, זה הוא — שייך לכרטיס שלו</button>
                )}
              </div>
            </div>
          )}

          {!linked && (
            <Two>
              <Field label="עיר">
                <input name="city" placeholder="רעננה" />
              </Field>
              <Field label="מאיפה הגיע">
                <select name="source" defaultValue="לא ידוע">
                  {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </Two>
          )}
        </>
      )}

      <Field label="כותרת העבודה">
        <input name="title" placeholder={kind === "contractor" ? "חיפוי לובי — בניין 3" : "חיפוי סלון + מזנון"} />
      </Field>
      <Field label="מה מבקש">
        <textarea name="request" rows={2}
          placeholder={kind === "contractor" ? "40 מ״ר, פורמייקה אגוז" : "חיפוי קיר בסלון + מזנון תלוי"} />
      </Field>

      <Err msg={err} />
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "שומר…" : linked ? "פתח עסקה ללקוח" : "שמור ופתח כרטיס"}
        </button>
        <button type="button" className="btn" onClick={() => { setOpen(false); setMatch(null); }}>ביטול</button>
      </div>
    </form>
  );
}

/* ---------- stage bar ---------- */

export function StageBar({ leadId, kind, stage }: { leadId: string; kind: "private" | "contractor"; stage: string }) {
  const { err, pending, run } = useAction();
  const steps = STAGES[kind];
  const at = steps.indexOf(stage as LeadStage);
  const closed = stage === "won" || stage === "lost";
  /* "won" has its own panel because it opens the project */
  const next = !closed && at >= 0 && at < steps.length - 2 ? steps[at + 1] : null;

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {steps.map((s, i) => {
          const isOn = s === stage;
          const past = at >= 0 && i < at;
          const clickable = !closed && s !== "won" && !isOn;
          return (
            <button key={s} type="button" className="chip" disabled={!clickable || pending}
              onClick={() => run(() => setStage(leadId, s))}
              style={{
                cursor: clickable ? "pointer" : "default", padding: "8px 12px", fontSize: 11, opacity: 1,
                borderColor: isOn ? "var(--bronze)" : past ? "rgba(46,131,85,.45)" : "var(--line)",
                color: isOn ? "var(--bronze-lt)" : past ? "var(--go)" : "var(--steel)",
                background: isOn ? "rgba(201,146,79,.14)" : undefined,
                fontWeight: isOn ? 600 : 400,
              }}>
              {past ? "✓ " : ""}{stageLabel(kind, s)}
            </button>
          );
        })}
      </div>

      {next && (
        <button className="btn btn-primary" style={{ marginTop: 14 }} disabled={pending}
          onClick={() => run(() => setStage(leadId, next))}>
          {pending ? "מעביר…" : `לשלב הבא: ${stageLabel(kind, next)} ←`}
        </button>
      )}
      {!closed && (
        <div style={{ fontSize: 12, color: "var(--steel)", marginTop: 10 }}>
          אפשר ללחוץ על כל שלב כדי לקפוץ אליו, גם אחורה.
        </div>
      )}
      {stage === "won" && (
        <div style={{ fontSize: 12, color: "var(--steel)", marginTop: 10, lineHeight: 1.7 }}>
          העסקה נסגרה ונפתח לה פרויקט, לכן השלבים נעולים.
        </div>
      )}
      {stage === "lost" && (
        <div style={{ fontSize: 12, color: "var(--steel)", marginTop: 10 }}>
          העסקה סומנה כלא נסגרה. כדי להמשיך לעבוד עליה — "פתח מחדש".
        </div>
      )}
      <Err msg={err} />
    </div>
  );
}

/* ---------- customer ---------- */

export function CustomerForm({ c }: { c: any }) {
  const { err, saved, pending, run } = useAction();
  const sources = SOURCE_OPTIONS.includes(c.source ?? "") || !c.source ? SOURCE_OPTIONS : [c.source, ...SOURCE_OPTIONS];
  return (
    <form action={(fd) => run(() => updateCustomer(c.id, fd))}>
      <Two>
        <Field label="שם"><input name="name" defaultValue={c.name} required /></Field>
        <Field label="טלפון"><input name="phone" type="tel" defaultValue={c.phone ?? ""} /></Field>
      </Two>
      <Two>
        <Field label="עיר"><input name="city" defaultValue={c.city ?? ""} /></Field>
        <Field label="מאיפה הגיע">
          <select name="source" defaultValue={c.source ?? "לא ידוע"}>
            {sources.map((s: string) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </Two>
      <Field label="כתובת מלאה (לניווט)">
        <input name="address" defaultValue={c.address ?? ""} placeholder="רחוב, מספר, עיר" />
      </Field>
      <Field label="הערות על הלקוח">
        <textarea name="notes" rows={2} defaultValue={c.notes ?? ""} />
      </Field>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button className="btn" disabled={pending}>{pending ? "שומר…" : "שמור פרטי לקוח"}</button>
        <Saved on={saved} />
      </div>
      <Err msg={err} />
    </form>
  );
}

/* ---------- the deal ---------- */

export function DealForm({ lead }: { lead: any }) {
  const { err, saved, pending, run } = useAction();
  const isPrivate = lead.kind === "private";

  return (
    <form action={(fd) => {
      /* datetime-local has no timezone: turn it into a real moment here, in the browser */
      const local = String(fd.get("meeting_at_local") ?? "");
      fd.delete("meeting_at_local");
      if (isPrivate) fd.set("meeting_at", local ? new Date(local).toISOString() : "");
      run(() => updateLead(lead.id, fd));
    }}>
      <Field label="כותרת העבודה">
        <input name="title" defaultValue={lead.title ?? ""} placeholder="חיפוי סלון + מזנון" />
      </Field>
      <Field label="מה הלקוח מבקש">
        <textarea name="request" rows={3} defaultValue={lead.request ?? ""} />
      </Field>

      <h4 className="mono" style={{ marginTop: 8 }}>{isPrivate ? "הערכת מחיר (לפני פגישה)" : "הצעת מחיר"}</h4>
      <Two>
        <Field label="מ־ (₪)"><input name="estimate_min" inputMode="numeric" defaultValue={lead.estimate_min ?? ""} /></Field>
        <Field label="עד (₪)"><input name="estimate_max" inputMode="numeric" defaultValue={lead.estimate_max ?? ""} /></Field>
      </Two>

      {isPrivate && (
        <>
          <h4 className="mono" style={{ marginTop: 8 }}>פגישה בבית הלקוח</h4>
          <Two>
            <Field label="מועד">
              <input name="meeting_at_local" type="datetime-local" defaultValue={toLocalInput(lead.meeting_at)} />
            </Field>
            <Field label="כתובת הפגישה">
              <input name="meeting_address" defaultValue={lead.meeting_address ?? ""} placeholder="אם שונה מכתובת הלקוח" />
            </Field>
          </Two>
        </>
      )}

      <h4 className="mono" style={{ marginTop: 8 }}>{isPrivate ? "סיכום הפגישה" : "פרטי העבודה"}</h4>
      <Field label={isPrivate ? "סגנון העבודה" : "סגנון העבודה * (קובע אם יש נגרות)"}>
        <select name="style" defaultValue={lead.style ?? ""}>
          <option value="">— לא נבחר —</option>
          {Object.entries(STYLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="דגמים שנבחרו">
        <textarea name="models" rows={2} defaultValue={lead.models ?? ""} placeholder="פורמייקה אגוז 1234, חזיתות MDF לבן מט, ידיות שחורות" />
      </Field>
      <Two>
        <Field label="מחיר סופי (₪)">
          <input name="final_price" inputMode="numeric" defaultValue={lead.final_price ?? ""} />
        </Field>
        {isPrivate && (
          <Field label="החוזה">
            <select name="contract_mode" defaultValue={lead.contract_mode ?? ""}>
              <option value="">— עוד לא —</option>
              <option value="onsite">נחתם במקום</option>
              <option value="pdf">נשלח PDF בוואטסאפ</option>
            </select>
          </Field>
        )}
      </Two>

      <Field label="לחזור ללקוח בתאריך">
        <input name="follow_up_on" type="date" defaultValue={lead.follow_up_on ?? ""} />
      </Field>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button className="btn btn-primary" disabled={pending}>{pending ? "שומר…" : "שמור"}</button>
        <Saved on={saved} />
      </div>
      <Err msg={err} />
    </form>
  );
}

/* ---------- timeline note ---------- */

export function NoteForm({ leadId }: { leadId: string }) {
  const { err, pending, run } = useAction();
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={(fd) => run(() => addNote(leadId, fd), () => ref.current?.reset())}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <select name="kind" defaultValue="whatsapp" style={{ width: "auto", minWidth: 120 }}>
          <option value="whatsapp">וואטסאפ</option>
          <option value="call">שיחה</option>
          <option value="meeting">פגישה</option>
          <option value="note">הערה</option>
        </select>
        <input name="follow_up_on" type="date" title="לחזור ללקוח בתאריך" style={{ width: "auto" }} min={todayIL()} />
      </div>
      <textarea name="note" rows={2} required placeholder="מה סוכם? למשל: שלח מידות, מחכה לאישור מבן הזוג" />
      <div style={{ fontSize: 12, color: "var(--steel)", marginTop: 6 }}>
        התאריך לא חובה — אם תבחר, הכרטיס יקפוץ לך באותו יום.
      </div>
      <button className="btn" style={{ marginTop: 10 }} disabled={pending}>{pending ? "שומר…" : "הוסף לציר הזמן"}</button>
      <Err msg={err} />
    </form>
  );
}

/* ---------- files ---------- */

export function FileUpload({ leadId, defaultKind = "measure" }: { leadId: string; defaultKind?: string }) {
  const { err, saved, pending, run } = useAction();
  const [files, setFiles] = useState<File[]>([]);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={(fd) => {
      files.forEach((f) => fd.append("files", f));
      run(() => uploadLeadFiles(leadId, fd), () => { setFiles([]); ref.current?.reset(); });
    }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select name="kind" defaultValue={defaultKind} style={{ width: "auto", minWidth: 170 }}>
          {Object.entries(FILE_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="btn" style={{ cursor: "pointer", borderStyle: "dashed" }}>
          📷 בחר קבצים
          <input type="file" multiple hidden accept="image/*,application/pdf"
            onChange={(e) => setFiles([...(e.target.files ?? [])])} />
        </label>
        {files.length > 0 && (
          <button className="btn btn-primary" disabled={pending}>
            {pending ? "מעלה…" : `העלה ${files.length} קבצים`}
          </button>
        )}
        <Saved on={saved} />
      </div>
      <Err msg={err} />
    </form>
  );
}

/* ---------- closing ---------- */

export function WonPanel({ lead, hasTransfer }: { lead: any; hasTransfer: boolean }) {
  const { err, pending, run } = useAction();
  const router = useRouter();
  const half = lead.final_price ? Math.round(Number(lead.final_price) / 2) : "";

  return (
    <form className="panel" style={{ borderColor: "rgba(46,131,85,.45)", marginBottom: 16 }}
      action={(fd) => run(async () => {
        const { code } = await must(markWon(lead.id, fd));
        router.push(`/projects/${code}`);
      })}>
      <h4 className="mono">מקדמה התקבלה — פתיחת פרויקט</h4>
      {!hasTransfer && (
        <div className="lockbar" style={{ marginBottom: 14 }}>
          קודם מעלים את צילום אישור ההעברה (למטה, בחלק "קבצים"), ורק אז אפשר לסגור.
        </div>
      )}
      <Two>
        <Field label="סכום המקדמה שהתקבל (₪) *">
          <input name="deposit_amount" inputMode="numeric" defaultValue={lead.deposit_amount ?? half} required />
        </Field>
        <Field label="תאריך יעד לפרויקט *">
          <input name="due_date" type="date" required defaultValue={addBusinessDays(26)} />
        </Field>
      </Two>
      <Field label="שם הפרויקט">
        <input name="project_name" defaultValue={lead.title ?? ""} placeholder="חיפוי סלון + מזנון" />
      </Field>
      <div style={{ fontSize: 12, color: "var(--steel)", marginBottom: 12, lineHeight: 1.7 }}>
        תאריך היעד מחושב אוטומטית: 26 ימי עבודה (א׳–ה׳) מהיום. אפשר לשנות.
        נפתח פרויקט כטיוטה עם פרטי הלקוח, הסגנון והדגמים. המחיר לא עובר לפרויקט — העובדים רואים את הערות הייצור.
      </div>
      <button className="btn btn-go btn-big" disabled={pending || !hasTransfer}>
        {pending ? "פותח פרויקט…" : "✓ נסגר — פתח פרויקט"}
      </button>
      <Err msg={err} />
    </form>
  );
}

export function LostPanel({ leadId }: { leadId: string }) {
  const [open, setOpen] = useState(false);
  const { err, pending, run } = useAction();
  if (!open) {
    return <button className="btn" onClick={() => setOpen(true)}>סמן כלא נסגר</button>;
  }
  return (
    <form className="panel" action={(fd) => run(() => markLost(leadId, fd), () => setOpen(false))}>
      <Field label="למה לא נסגר?">
        <select name="lost_reason" required defaultValue="">
          <option value="" disabled>בחר סיבה</option>
          {Object.entries(LOST_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="פירוט (לא חובה)">
        <input name="lost_note" placeholder="קיבל הצעה זולה ב־20%" />
      </Field>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-stop" disabled={pending}>{pending ? "שומר…" : "סמן כלא נסגר"}</button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>ביטול</button>
      </div>
      <Err msg={err} />
    </form>
  );
}

export function ReopenButton({ leadId }: { leadId: string }) {
  const { err, pending, run } = useAction();
  return (
    <>
      <button className="btn" disabled={pending} onClick={() => run(() => reopenLead(leadId))}>
        {pending ? "פותח…" : "פתח מחדש"}
      </button>
      <Err msg={err} />
    </>
  );
}

export function UndoWonButton({ leadId }: { leadId: string }) {
  const { err, pending, run } = useAction();
  return (
    <>
      <button className="btn" disabled={pending}
        onClick={() => {
          if (!confirm("לבטל את הסגירה?\n\nטיוטת הפרויקט שנפתחה תימחק, והעסקה תחזור ל\"ממתין להעברה\".")) return;
          run(() => undoWon(leadId));
        }}>
        {pending ? "מבטל…" : "בטל סגירה"}
      </button>
      <Err msg={err} />
    </>
  );
}

/* ---------- merge two cards of the same person ---------- */

export function MergePanel({ keep, others }: {
  keep: { id: string; name: string };
  others: { id: string; name: string; phone: string | null; city: string | null }[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState("");
  const { err, pending, run } = useAction();
  const router = useRouter();

  if (!open) {
    return <button className="btn" onClick={() => setOpen(true)}>איחוד עם כרטיס כפול</button>;
  }

  const needle = q.trim().toLowerCase();
  const list = others.filter((o) =>
    !needle || [o.name, o.phone, o.city].some((v) => String(v ?? "").toLowerCase().includes(needle))
  ).slice(0, 30);
  const chosen = others.find((o) => o.id === pick);

  return (
    <div className="panel">
      <h4 className="mono">איחוד כרטיסים</h4>
      <div style={{ fontSize: 13, color: "var(--steel)", lineHeight: 1.7, marginBottom: 12 }}>
        בוחרים את הכרטיס הכפול. כל העסקאות שלו יעברו לכרטיס של <strong>{keep.name}</strong>,
        פרטים חסרים יושלמו ממנו, והכרטיס הכפול יימחק.
      </div>
      <input placeholder="חיפוש לפי שם, טלפון או עיר" value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ maxHeight: 220, overflowY: "auto", marginTop: 8 }}>
        {list.map((o) => (
          <label key={o.id} style={{
            display: "flex", gap: 10, alignItems: "center", padding: "8px 4px",
            borderBottom: "1px solid var(--line-soft)", cursor: "pointer",
          }}>
            <input type="radio" name="merge" checked={pick === o.id} onChange={() => setPick(o.id)}
              style={{ width: "auto" }} />
            <span style={{ color: "var(--bone)" }}>{o.name}</span>
            <span className="mono" style={{ fontSize: 11 }}>{o.phone ?? ""} {o.city ? `· ${o.city}` : ""}</span>
          </label>
        ))}
        {list.length === 0 && <div style={{ fontSize: 13, color: "var(--steel)", padding: 8 }}>לא נמצא</div>}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button className="btn btn-stop" disabled={!chosen || pending}
          onClick={() => {
            if (!chosen) return;
            if (!confirm(`לאחד את "${chosen.name}" לתוך "${keep.name}"?\n\nהכרטיס של "${chosen.name}" יימחק, והעסקאות שלו יעברו לכאן. אי אפשר לבטל.`)) return;
            run(() => mergeCustomers(keep.id, chosen.id), () => { setOpen(false); setPick(""); router.refresh(); });
          }}>
          {pending ? "מאחד…" : "אחד לכרטיס הזה"}
        </button>
        <button className="btn" onClick={() => setOpen(false)}>ביטול</button>
      </div>
      <Err msg={err} />
    </div>
  );
}
