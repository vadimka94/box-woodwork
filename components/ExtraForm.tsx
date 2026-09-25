"use client";

import { must, orAlert } from "@/lib/action-result";
import { useRef, useState, useTransition } from "react";
import { reportExtra, setExtraStatus, setExtraRoute } from "@/app/extras-actions";
import { SOURCE_LABEL, ROUTE_LABEL, GENERAL_ASSIGNEE_LABEL } from "@/lib/extra-labels";
import { t, type Lang } from "@/lib/i18n";

type P = { id: string; full_name: string; role: string };
type Route = "general" | "cnc" | "manual";

export function ExtraForm({ projects, profiles, lang = "he" }: { projects: any[]; profiles: P[]; lang?: Lang }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);

  if (!open) {
    return <button className="btn btn-primary" onClick={() => setOpen(true)}>+ {t("דווח חוסר או תוספת", lang)}</button>;
  }

  return (
    <form ref={ref} className="panel"
      action={(fd) => start(async () => {
        try {
          files.forEach((f) => fd.append("photos", f));
          await must(reportExtra(fd)); ref.current?.reset(); setFiles([]); setOpen(false);
        } catch (e: any) { setErr(e.message); }
      })}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <label>{t("פרויקט", lang)} <span style={{ color: "var(--dim)" }}>({t("לא חובה", lang)})</span></label>
          <select name="project_id" style={{ marginTop: 7 }}>
            <option value="">{t("ללא פרויקט — כללי", lang)}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label>{t("כמות", lang)}</label>
          <input name="qty" type="number" min={1} defaultValue={1} style={{ marginTop: 7 }} />
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <label>{t("מה צריך", lang)}</label>
        <input name="title" required placeholder="מדף נוסף 80×35 לארון הימני" style={{ marginTop: 7 }} />
      </div>

      <div style={{ marginTop: 14 }}>
        <label>{t("פירוט", lang)}</label>
        <textarea name="description" rows={3}
          placeholder="גוון, מידות מדויקות, איפה זה יושב, מה קרה" style={{ marginTop: 7 }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
        <div>
          <label>{t("סיבה", lang)}</label>
          <select name="source" style={{ marginTop: 7 }}>
            {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{t(v, lang)}</option>)}
          </select>
        </div>
        <div>
          <label>{t("מסלול ייצור", lang)}</label>
          <select name="route" defaultValue="general" style={{ marginTop: 7 }}>
            {Object.entries(ROUTE_LABEL).map(([k, v]) => <option key={k} value={k}>{t(v, lang)}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <label>{t("מי מטפל", lang)}</label>
        <select name="assigned_to" defaultValue="" style={{ marginTop: 7 }}>
          <option value="">{t(GENERAL_ASSIGNEE_LABEL, lang)}</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
        <div style={{ fontSize: 12, color: "var(--steel)", marginTop: 6 }}>
          {t("כולם רואים את הדיווח עד שמישהו לוקח אותו על עצמו.", lang)}
        </div>
      </div>

      <label className="btn" style={{
        display: "inline-flex", gap: 8, marginTop: 14, cursor: "pointer",
        borderStyle: "dashed", borderColor: "rgba(201,146,79,.5)", color: "var(--bronze-lt)",
      }}>
        📷 {t("תמונה מהשטח", lang)}
        <input type="file" accept="image/*" capture="environment" multiple hidden
          onChange={(e) => setFiles([...(e.target.files ?? [])])} />
      </label>

      {files.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {files.map((f, i) => (
            <img key={i} src={URL.createObjectURL(f)} alt="" width={88} height={88}
              style={{ borderRadius: 10, objectFit: "cover", border: "1px solid var(--line)" }} />
          ))}
        </div>
      )}

      {err && <div style={{ color: "#F0897A", fontSize: 13, marginTop: 12 }}>{err}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button className="btn btn-primary" disabled={pending}>{pending ? "שולח…" : "שלח דיווח"}</button>
        <button type="button" className="btn" onClick={() => { setOpen(false); setFiles([]); }}>ביטול</button>
      </div>
    </form>
  );
}

export function ExtraActions({ extraId, status, general = false, canCancel = true, lang = "he" }: {
  extraId: string; status: string; lang?: Lang;
  /** A "כללי" item nobody has taken yet — the first button claims it. */
  general?: boolean;
  canCancel?: boolean;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = (s: "open" | "work" | "done" | "cancelled") =>
    start(async () => { try { await must(setExtraStatus(extraId, s)); } catch (e: any) { setErr(e.message); } });

  return (
    <>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {general
          ? <button className="btn btn-work" disabled={pending} onClick={() => go("work")}>{t("אני לוקח את זה", lang)}</button>
          : status !== "work" && <button className="btn btn-work" disabled={pending} onClick={() => go("work")}>{t("התחלתי", lang)}</button>}
        <button className="btn btn-go" disabled={pending} onClick={() => go("done")}>{t("בוצע ✓", lang)}</button>
        {canCancel && <button className="btn" disabled={pending} onClick={() => go("cancelled")}>{t("בטל", lang)}</button>}
      </div>
      {err && <div style={{ color: "#F0897A", fontSize: 12 }}>{err}</div>}
    </>
  );
}

export function RoutePicker({ extraId, route, assignedTo, profiles, lang = "he" }: {
  extraId: string; route: string; assignedTo: string | null; profiles: P[]; lang?: Lang;
}) {
  const [pending, start] = useTransition();
  const set = (r: Route, who: string | null) =>
    start(() => orAlert(setExtraRoute(extraId, r, who)));

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <span className="mono" style={{ fontSize: 11, color: "var(--dim)" }}>מסלול:</span>
      {(Object.keys(ROUTE_LABEL) as Route[]).map((r) => (
        <button key={r} className="chip" disabled={pending}
          style={{
            cursor: "pointer", padding: "7px 13px", fontSize: 11,
            borderColor: route === r ? "var(--bronze)" : "var(--line)",
            color: route === r ? "var(--bronze-lt)" : "var(--steel)",
            background: route === r ? "rgba(201,146,79,.14)" : undefined,
          }}
          onClick={() => set(r, assignedTo)}>
          {t(ROUTE_LABEL[r], lang)}
        </button>
      ))}

      <select value={assignedTo ?? ""} disabled={pending}
        style={{ width: "auto", minWidth: 130, padding: "8px 12px", fontSize: 12 }}
        onChange={(e) => set(route as Route, e.target.value || null)}>
        <option value="">{t(GENERAL_ASSIGNEE_LABEL, lang)}</option>
        {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
      </select>
    </div>
  );
}
