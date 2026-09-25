import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import {
  getLeads, summarize, needsAttention, STAGES, KIND_LABEL, STAGE_COLOR, LOST_REASONS, STYLE_LABEL,
  stageLabel, money, fmtDateTime, fmtDate, daysSince, waLink,
} from "@/lib/crm";
import { QuickAdd } from "@/components/Crm";
import { Realtime } from "@/components/Realtime";
import { CrmTabs } from "@/components/CrmTabs";

/* column titles cover both private clients and contractors */
const BOARD_LABEL: Record<string, string> = {
  estimate_sent: "מחיר נשלח",
  awaiting_payment: "ממתין להעברה",
};

/** The sales board: every WhatsApp enquiry, from first message to deposit. */
export default async function CrmPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const me = await currentUser();
  if (!me || me.role !== "admin") redirect("/tasks");
  const { show } = await searchParams;

  const { leads, missingTables } = await getLeads();

  if (missingTables) {
    return (
      <>
        <h1>לקוחות ומכירות</h1>
        <div className="panel lockbar">
          הטבלאות של ניהול הלקוחות עוד לא קיימות בדאטהבייס. צריך להריץ פעם אחת את הקובץ
          <span className="mono"> sql/crm.sql </span> ב-SQL Editor של סופאבייס, ואז לרענן את הדף.
        </div>
      </>
    );
  }

  const s = summarize(leads);
  const columns = STAGES.private.filter((st) => st !== "won");
  const open = leads.filter((l) => l.stage !== "won" && l.stage !== "lost");
  const won = leads.filter((l) => l.stage === "won");
  const lost = leads.filter((l) => l.stage === "lost");

  return (
    <>
      <Realtime tables={["leads", "lead_events", "lead_files"]} />
      <CrmTabs active="board" />
      <h1>לקוחות ומכירות</h1>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", marginBottom: 20 }}>
        <Kpi value={String(s.newThisMonth)} label="פניות החודש" color="var(--bone)" />
        <Kpi value={s.toMeetingPct === null ? "—" : `${s.toMeetingPct}%`} label="מפנייה לפגישה (פרטיים)" color="var(--bronze)" />
        <Kpi value={String(s.attention.length)} label="לחזור אליהם" color={s.attention.length ? "var(--stop)" : "var(--go)"} />
        <Kpi value={money(s.awaitingDeposits)} label={`מקדמות בדרך · ${s.awaitingCount}`} color="var(--go)" />
      </div>

      <QuickAdd />

      {s.attention.length > 0 && (
        <>
          <Eyebrow>לחזור אליהם עכשיו</Eyebrow>
          {s.attention.map((l: any) => <AttentionRow key={l.id} l={l} />)}
        </>
      )}

      {s.upcomingMeetings.length > 0 && (
        <>
          <Eyebrow>פגישות קרובות</Eyebrow>
          <div className="grid">
            {s.upcomingMeetings.map((l: any) => (
              <Link key={l.id} href={`/crm/${l.id}`} className="panel" style={{ textDecoration: "none", padding: 16 }}>
                <div className="mono" style={{ color: "var(--bronze-lt)", fontSize: 14 }}>{fmtDateTime(l.meeting_at)}</div>
                <div style={{ fontSize: 17, marginTop: 6 }}>{l.customer?.name}</div>
                <div style={{ fontSize: 13, color: "var(--steel)", marginTop: 4 }}>
                  {l.meeting_address || l.customer?.address || l.customer?.city || "—"}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <Eyebrow>עסקאות פתוחות · {open.length}</Eyebrow>
      {open.length === 0 && (
        <div className="panel" style={{ textAlign: "center", color: "var(--steel)", padding: 30 }}>
          אין פניות פתוחות. פנייה חדשה מוואטסאפ? לחץ על "פנייה חדשה".
        </div>
      )}
      {open.length > 0 && (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 12, alignItems: "flex-start" }}>
          {columns.map((st) => {
            /* contractor stages share keys with the private path, so one column holds both */
            const here = open.filter((l) => l.stage === st);
            return (
              <div key={st} style={{ minWidth: 230, flex: "1 0 230px" }}>
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 4px", borderBottom: `3px solid ${STAGE_COLOR[st]}`, marginBottom: 10,
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{BOARD_LABEL[st] ?? stageLabel("private", st)}</span>
                  <span className="mono" style={{ fontSize: 12, color: "var(--steel)" }}>{here.length}</span>
                </div>
                {here.map((l: any) => <LeadCard key={l.id} l={l} />)}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 26, flexWrap: "wrap" }}>
        <Link className="btn" href={show === "won" ? "/crm" : "/crm?show=won"} style={{ textDecoration: "none" }}>
          נסגרו · {won.length}
        </Link>
        <Link className="btn" href={show === "lost" ? "/crm" : "/crm?show=lost"} style={{ textDecoration: "none" }}>
          לא נסגרו · {lost.length}
        </Link>
      </div>

      {show === "won" && (
        <div className="grid" style={{ marginTop: 14 }}>
          {won.map((l: any) => (
            <Link key={l.id} href={`/crm/${l.id}`} className="panel" style={{ textDecoration: "none", padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 16 }}>{l.customer?.name}</span>
                <span className="mono" style={{ color: "var(--go)" }}>{money(l.final_price)}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--steel)", marginTop: 6 }}>
                {l.project?.code ?? ""} · {l.title ?? (l.style ? STYLE_LABEL[l.style] : "")} · {fmtDate(l.deposit_at)}
              </div>
            </Link>
          ))}
        </div>
      )}

      {show === "lost" && (
        <div className="grid" style={{ marginTop: 14 }}>
          {lost.map((l: any) => (
            <Link key={l.id} href={`/crm/${l.id}`} className="panel" style={{ textDecoration: "none", padding: 16, opacity: .8 }}>
              <div style={{ fontSize: 16 }}>{l.customer?.name}</div>
              <div style={{ fontSize: 13, color: "var(--steel)", marginTop: 6 }}>
                {LOST_REASONS[l.lost_reason] ?? "—"}{l.lost_note ? ` · ${l.lost_note}` : ""} · {l.customer?.source ?? ""}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function LeadCard({ l }: { l: any }) {
  const late = needsAttention(l);
  const wa = waLink(l.customer?.phone);
  return (
    <div className="panel" style={{
      padding: 14, marginBottom: 10,
      borderColor: late ? "rgba(176,59,44,.5)" : undefined,
    }}>
      <Link href={`/crm/${l.id}`} style={{ textDecoration: "none", display: "block" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{l.customer?.name}</span>
          {l.kind === "contractor" && <span className="chip">{KIND_LABEL.contractor}</span>}
        </div>
        {(l.title || l.request) && (
          <div style={{ fontSize: 13, color: "var(--steel)", marginTop: 5, lineHeight: 1.5 }}>
            {l.title ?? String(l.request).slice(0, 70)}
          </div>
        )}
        <div className="mono" style={{ fontSize: 11, color: "var(--dim)", marginTop: 8 }}>
          {l.stage === "meeting_set" && l.meeting_at
            ? `פגישה ${fmtDateTime(l.meeting_at)}`
            : l.final_price
              ? money(l.final_price)
              : l.estimate_min || l.estimate_max
                ? `${money(l.estimate_min)}–${money(l.estimate_max)}`
                : l.customer?.source ?? ""}
        </div>
        <div className="mono" style={{ fontSize: 11, marginTop: 4, color: late ? "var(--stop)" : "var(--dim)" }}>
          {l.follow_up_on ? `לחזור: ${fmtDate(l.follow_up_on)}` : `${daysSince(l.stage_changed_at)} ימים בשלב`}
        </div>
      </Link>
      {wa && (
        <a href={wa} target="_blank" rel="noreferrer" className="btn"
          style={{ marginTop: 10, padding: "6px 12px", fontSize: 11, textDecoration: "none", display: "inline-block" }}>
          וואטסאפ
        </a>
      )}
    </div>
  );
}

function AttentionRow({ l }: { l: any }) {
  const why = l.follow_up_on
    ? `ביקשת לחזור ב-${fmtDate(l.follow_up_on)}`
    : `${daysSince(l.stage_changed_at)} ימים בלי התקדמות`;
  const wa = waLink(l.customer?.phone);
  return (
    <div className="panel" style={{
      display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 8, padding: 14,
      borderColor: "rgba(176,59,44,.4)", background: "linear-gradient(90deg,rgba(216,80,63,.07),#fff)",
    }}>
      <span className="chip stop">{stageLabel(l.kind, l.stage)}</span>
      <Link href={`/crm/${l.id}`} style={{ flex: 1, minWidth: 160, textDecoration: "none" }}>
        <span style={{ fontSize: 15 }}>{l.customer?.name}</span>
        <span style={{ fontSize: 13, color: "var(--steel)" }}> · {why}</span>
      </Link>
      {wa && (
        <a href={wa} target="_blank" rel="noreferrer" className="btn" style={{ textDecoration: "none", padding: "8px 14px" }}>
          וואטסאפ
        </a>
      )}
    </div>
  );
}

function Kpi({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="panel" style={{ padding: 18 }}>
      <div className="mono" style={{ fontSize: 30, lineHeight: 1, color }}>{value}</div>
      <div style={{ marginTop: 10, fontSize: 12, color: "var(--steel)" }}>{label}</div>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono" style={{ fontSize: 13, letterSpacing: ".12em", color: "var(--steel)", margin: "26px 0 12px" }}>
      {children}
    </div>
  );
}
