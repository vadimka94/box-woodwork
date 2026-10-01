"use client";

import { must } from "@/lib/action-result";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "@/app/project-actions";

const KINDS = [
  {
    value: "full",
    title: "לקוח פרטי",
    desc: "מדידה בשטח, תכנון, אישור לקוח, ייצור והתקנה אצלו. עשרה שלבים.",
  },
  {
    value: "contractor",
    title: "קבלן",
    desc: "מקבלים מידות, מייצרים, הקבלן אוסף מהמפעל. בלי מדידה ובלי התקנה.",
  },
];

const CARPENTRY = [
  {
    value: "yes",
    title: "עם נגרות",
    desc: "חיפוי יחד עם שידה, ארונית או מזנון. כולל קנט והרכבה — שמונה שלבים.",
  },
  {
    value: "no",
    title: "בלי נגרות",
    desc: "לוחות חיפוי בלבד. בלי קנט ובלי הרכבה — שישה שלבים.",
  },
];

export function NewProjectForm() {
  const [kind, setKind] = useState("full");
  /* deliberately empty: a contractor job must be answered, not defaulted */
  const [carp, setCarp] = useState("");
  /* rare, but it happens: a wall has to come down before anyone can measure */
  const [prep, setPrep] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const needsCarp = kind === "contractor";
  const blocked = needsCarp && !carp;

  return (
    <div style={{ maxWidth: 720 }}>
      <form action={(fd) => start(async () => {
        if (blocked) { setErr("בחר אם העבודה כוללת נגרות"); return; }
        try {
          const { code } = await must(createProject(fd));
          router.push(`/projects/${code}`);
          router.refresh();
        } catch (e: any) {
          setErr(e?.message ?? "שגיאה לא ידועה");
        }
      })}>
        <div className="panel" style={{ marginBottom: 16 }}>
          <h4 className="mono">סוג העבודה</h4>
          <input type="hidden" name="kind" value={kind} />
          <div style={{ display: "grid", gap: 10 }}>
            {KINDS.map((k) => (
              <Choice key={k.value} {...k} on={kind === k.value}
                onPick={() => { setKind(k.value); setErr(null); if (k.value === "full") setCarp(""); }} />
            ))}
          </div>
        </div>

        {needsCarp && (
          <div className="panel" style={{
            marginBottom: 16,
            borderColor: blocked ? "rgba(216,80,63,.5)" : undefined,
          }}>
            <h4 className="mono">האם יש נגרות בעבודה?</h4>
            <input type="hidden" name="has_carpentry" value={carp === "yes" ? "true" : "false"} />
            <div style={{ display: "grid", gap: 10 }}>
              {CARPENTRY.map((c) => (
                <Choice key={c.value} {...c} on={carp === c.value}
                  onPick={() => { setCarp(c.value); setErr(null); }} />
              ))}
            </div>
            {blocked && (
              <div style={{ marginTop: 12, fontSize: 13, color: "#B03B2C" }}>
                חובה לבחור — זה קובע אילו שלבים ייווצרו.
              </div>
            )}
          </div>
        )}

        {!needsCarp && (
          <div className="panel" style={{
            marginBottom: 16,
            borderColor: prep ? "rgba(201,146,79,.6)" : undefined,
          }}>
            <h4 className="mono">שלב הכנה בשטח</h4>
            <input type="hidden" name="prep_required" value={prep ? "true" : "false"} />
            <button type="button" onClick={() => setPrep(!prep)}
              style={{
                textAlign: "start", padding: "16px 18px", borderRadius: 12, width: "100%",
                border: `2px solid ${prep ? "var(--bronze)" : "var(--line)"}`,
                background: prep ? "rgba(201,146,79,.1)" : "transparent",
              }}>
              <div style={{ fontSize: 17, color: prep ? "var(--bronze-lt)" : undefined }}>
                {prep ? "■ " : "□ "}צריך לעבוד בשטח לפני המדידה
              </div>
              <div style={{ fontSize: 12, color: "var(--steel)", marginTop: 6, lineHeight: 1.6 }}>
                פירוק קיר גבס, תשתית חשמל או כל הכנה אחרת שבלעדיה אי אפשר
                לקחת מידות לייצור. זה לא פריט — זה שלב של הפרויקט, לפני המדידה.
              </div>
            </button>

            {prep && (
              <div style={{ marginTop: 14 }}>
                <label style={{ display: "block", fontSize: 12, color: "var(--steel)", marginBottom: 7 }}>
                  מה צריך לעשות בשטח
                </label>
                <textarea name="prep_note" rows={2}
                  placeholder="למשל: פירוק קיר הגבס בכניסה והעברת תשתית חשמל לארון" />
                <div className="lockbar" style={{ marginTop: 12 }}>
                  כל השלבים הבאים — מדידה, תכנון והייצור — יהיו נעולים עד שתסמן
                  שעבודת ההכנה בוצעה.
                </div>
              </div>
            )}
          </div>
        )}

        <div className="panel" style={{ marginBottom: 16 }}>
          <Field label="שם הפרויקט" name="name"
            placeholder={needsCarp ? "חיפוי קירות — לובי" : "מטבח + אי מרכזי"} required />
          <Two>
            <Field label={needsCarp ? "קבלן" : "לקוח"} name="client_name"
              placeholder={needsCarp ? "שם הקבלן" : "משפחת אברמוב"} required />
            <Field label="טלפון" name="client_phone" placeholder="052-0000000" />
          </Two>
          <Two>
            <Field label={needsCarp ? "אתר" : "עיר"} name="city" placeholder="רעננה" />
            <Field label="תאריך יעד" name="due_date" type="date" />
          </Two>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--steel)", marginBottom: 7 }}>
              הערות ייצור
            </label>
            <textarea name="production_note" rows={3}
              placeholder={needsCarp
                ? "דגם פורמייקה, סוג החירוץ, גוון, אילוצי מסירה…"
                : "גוונים, פרזול, אילוצי הובלה…"} />
          </div>
        </div>

        {err && (
          <div style={{
            color: "#B03B2C", fontSize: 13, marginBottom: 12, padding: "12px 14px",
            borderRadius: 12, background: "rgba(216,80,63,.1)", border: "1px solid rgba(216,80,63,.3)",
          }}>{err}</div>
        )}

        <button className="btn btn-primary btn-big" disabled={pending || blocked}>
          {pending ? "יוצר…" : "צור פרויקט כטיוטה"}
        </button>
      </form>

      <div style={{ marginTop: 12, fontSize: 12, color: "var(--steel)", lineHeight: 1.7 }}>
        הפרויקט נשמר כטיוטה. אחרי היצירה תוסיף פריטים, והוא ייכנס לרצפת הייצור
        רק בלחיצה על "אשר פרויקט לייצור".
      </div>
    </div>
  );
}

function Choice({ title, desc, on, onPick }: {
  title: string; desc: string; on: boolean; onPick: () => void;
}) {
  return (
    <button type="button" onClick={onPick}
      style={{
        textAlign: "start", padding: "16px 18px", borderRadius: 12,
        border: `2px solid ${on ? "var(--bronze)" : "var(--line)"}`,
        background: on ? "rgba(201,146,79,.1)" : "transparent",
      }}>
      <div style={{ fontSize: 17, color: on ? "var(--bronze-lt)" : undefined }}>
        {on ? "● " : "○ "}{title}
      </div>
      <div style={{ fontSize: 12, color: "var(--steel)", marginTop: 6, lineHeight: 1.6 }}>{desc}</div>
    </button>
  );
}

function Field({ label, name, placeholder, type = "text", required }: {
  label: string; name: string; placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 12, color: "var(--steel)", marginBottom: 7 }}>
        {label}{required && <span style={{ color: "var(--bronze)" }}> *</span>}
      </label>
      <input name={name} type={type} placeholder={placeholder} required={required} />
    </div>
  );
}
const Two = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>{children}</div>
);
