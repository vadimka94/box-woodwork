import type { SalesInsights } from "@/lib/sales-insights";
import { money } from "@/lib/crm-labels";

/**
 * The quiet half of the dashboard. Everything above it is "what needs you now";
 * this is "what has been true lately". So it stays visually recessive — one
 * hue, thin bars, no colour coding to decode. The row label carries identity,
 * the bar length carries the number.
 */

const BAR = "var(--bronze)";

function Stat({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div style={{ minWidth: 120 }}>
      <div className="mono" style={{ fontSize: 27, lineHeight: 1.1, color: "var(--bone)" }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--steel)", marginTop: 5 }}>{label}</div>
      {hint && <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

/** One row of a magnitude list: label, bar, value. */
function Bar({ label, note, value, pct }: {
  label: string; note?: string; value: string; pct: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 0" }}>
      <span style={{
        width: 128, flexShrink: 0, fontSize: 13, overflow: "hidden",
        textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{label}</span>

      <div style={{ flex: 1, minWidth: 40, height: 8, borderRadius: 4, background: "var(--line-soft)" }}>
        <div style={{
          width: `${Math.max(pct, 2)}%`, height: "100%", borderRadius: 4, background: BAR,
        }} />
      </div>

      <span className="mono" style={{ width: 92, flexShrink: 0, textAlign: "end", fontSize: 12 }}>{value}</span>
      <span className="mono" style={{ width: 66, flexShrink: 0, textAlign: "end", fontSize: 11, color: "var(--dim)" }}>
        {note ?? ""}
      </span>
    </div>
  );
}

function Head({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono" style={{
      fontSize: 10, letterSpacing: ".22em", color: "var(--dim)", margin: "20px 0 8px",
    }}>{children}</div>
  );
}

export function SalesNumbers({ d }: { d: SalesInsights }) {
  if (d.total === 0) return null;

  const topRevenue = Math.max(1, ...d.sources.map((s) => s.revenue));
  const topLost = Math.max(1, ...d.lostReasons.map((r) => r.count));
  const gap = d.estimate.medianGapPct;

  return (
    <div className="panel" style={{ marginTop: 22 }}>
      <h4 className="mono" style={{ fontSize: 10, letterSpacing: ".22em", color: "var(--dim)", margin: "0 0 16px" }}>
        מכירות · {d.monthsBack} החודשים האחרונים
      </h4>

      <div style={{ display: "flex", gap: 30, flexWrap: "wrap" }}>
        <Stat value={d.closePct === null ? "—" : `${d.closePct}%`} label="אחוז סגירה"
              hint={d.empty ? "אין עדיין עסקאות שהוכרעו" : `${d.won} מתוך ${d.won + d.lost}`} />
        <Stat value={money(d.revenue)} label="נסגר" />
        <Stat value={d.daysToClose === null ? "—" : `${d.daysToClose}`} label="ימים עד סגירה" hint="חציון" />
        <Stat value={String(d.open)} label="פתוחות עכשיו" />
      </div>

      {d.sources.length > 0 && (
        <>
          <Head>מאיפה מגיעות עסקאות</Head>
          {d.sources.slice(0, 7).map((s) => (
            <Bar key={s.source} label={s.source}
                 pct={(s.revenue / topRevenue) * 100}
                 value={s.revenue ? money(s.revenue) : "—"}
                 note={`${s.won}/${s.leads}${s.closePct === null ? "" : ` · ${s.closePct}%`}`} />
          ))}
          <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 8, lineHeight: 1.6 }}>
            האורך הוא הכסף שנסגר. המספרים מימין: כמה נסגרו מתוך כמה פניות, ואחוז הסגירה.
          </div>
        </>
      )}

      {d.lostReasons.length > 0 && (
        <>
          <Head>למה לא נסגר</Head>
          {d.lostReasons.map((r) => (
            <Bar key={r.reason} label={r.label} pct={(r.count / topLost) * 100} value={String(r.count)} />
          ))}
        </>
      )}

      {d.estimate.total > 0 && (
        <>
          <Head>דיוק ההערכה שלפני הפגישה</Head>
          <div style={{ fontSize: 13, color: "var(--steel)", lineHeight: 1.9 }}>
            מתוך {d.estimate.total} עסקאות שנסגרו עם הערכה מראש:{" "}
            <strong style={{ color: "var(--bone)" }}>{d.estimate.inside}</strong> בתוך הטווח ·{" "}
            <strong style={{ color: "var(--bone)" }}>{d.estimate.above}</strong> יצאו יקרות יותר ·{" "}
            <strong style={{ color: "var(--bone)" }}>{d.estimate.below}</strong> יצאו זולות יותר
            {gap !== null && gap !== 0 && (
              <>
                <br />
                המחיר הסופי היה בחציון{" "}
                <strong style={{ color: "var(--bone)" }}>{Math.abs(gap)}%</strong>{" "}
                {gap > 0 ? "מעל" : "מתחת"} לאמצע ההערכה.
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
