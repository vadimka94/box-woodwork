"use client";

import { must } from "@/lib/action-result";
import { useState, useTransition } from "react";
import { setStageStatus, reportBlock } from "@/app/actions";
import { REASON_LABEL, t, type Lang } from "@/lib/i18n";
import type { BlockReason, StageStatus } from "@/lib/types";

/** The three buttons a person on the floor actually presses. */
export function StageActions({ stageId, status, lang = "he", locked }:
  { stageId: string; status: StageStatus; lang?: Lang; locked?: string | null }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<BlockReason>("missing_hardware");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (locked) {
    return <div className="lockbar">🔒 {t(
      locked === "gate_plans" ? "נעול — ממתין לאישור התוכניות"
      : locked === "material" ? "נעול — החומר עוד לא הוזמן"
      : "נעול — ממתין לבקרה לפני אריזה", lang)}</div>;
  }

  const move = (to: StageStatus) =>
    start(async () => { try { await must(setStageStatus(stageId, to)); } catch (e: any) { setErr(e.message); } });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {status !== "work" && (
          <button className="btn btn-work btn-big" style={{ flex: 1, minWidth: 120 }}
            disabled={pending} onClick={() => move("work")}>{t("התחלתי", lang)}</button>
        )}
        <button className="btn btn-go btn-big" style={{ flex: 1, minWidth: 120 }}
          disabled={pending} onClick={() => move("done")}>{t("בוצע ✓", lang)}</button>
        {status !== "stop" && (
          <button className="btn btn-stop btn-big" style={{ flex: 1, minWidth: 120 }}
            disabled={pending} onClick={() => setOpen(!open)}>{t("תקוע / חסר", lang)}</button>
        )}
      </div>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <select value={reason} onChange={(e) => setReason(e.target.value as BlockReason)}
            style={{ minHeight: 54 }}>
            {Object.entries(REASON_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{t(v, lang)}</option>
            ))}
          </select>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={lang === "ru"
              ? "Опишите, чего именно не хватает"
              : "פרט מה בדיוק חסר — זה יגיע ישירות לוואדים ולמקס"} />
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-stop btn-big" style={{ flex: 1 }} disabled={pending || !note.trim()}
              onClick={() => start(async () => {
                try { await must(reportBlock(stageId, reason, note)); setOpen(false); setNote(""); }
                catch (e: any) { setErr(e.message); }
              })}>{t("שלח דיווח", lang)}</button>
            <button className="btn btn-big" style={{ maxWidth: 120 }}
              onClick={() => setOpen(false)}>{t("ביטול", lang)}</button>
          </div>
        </div>
      )}

      {err && <div style={{ color: "#F0897A", fontSize: 13 }}>{err}</div>}
    </div>
  );
}
