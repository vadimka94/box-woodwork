import type { Stage } from "@/lib/types";
import { STATUS_COLOR } from "@/lib/types";
import { t, type Lang } from "@/lib/i18n";

const SHORT: Record<number, string> = {
  1: "מדידה", 2: "הדמיה", 3: "אישור", 4: "CNC-P", 5: "CNC-C",
  6: "קנט", 7: "הרכבה", 8: "QC", 9: "אריזה", 10: "התקנה",
};

/** Ten bars that read at a glance: green done, orange working, red stuck. */
export function StageRail({ stages, lang = "he", big = false }:
  { stages: Stage[]; lang?: Lang; big?: boolean }) {
  const sorted = [...stages].sort((a, b) => a.seq - b.seq);
  return (
    <div className="rail">
      {sorted.map((s) => {
        const on = s.status !== "idle";
        const color = STATUS_COLOR[s.status];
        return (
          <div className="seg" key={s.id}>
            <div className="tick" style={{ color: on ? color : undefined, fontSize: big ? 12 : undefined }}>
              {big ? t(s.name, lang) : on ? t(SHORT[s.seq] ?? s.name, lang) : ""}
            </div>
            <div className={`bar${s.status === "stop" ? " blink" : ""}`}
              style={{ background: color, height: big ? 14 : undefined }} />
          </div>
        );
      })}
    </div>
  );
}
