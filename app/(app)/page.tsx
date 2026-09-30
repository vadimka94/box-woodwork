import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { listProjects, openBlocks, pendingGates, deliveredWaiting } from "@/lib/queries";
import { StageRail } from "@/components/StageRail";
import { REASON_LABEL } from "@/lib/i18n";
import { getLeads, summarize, stageLabel, fmtDate, daysSince, fmtDateTime } from "@/lib/crm";
import { salesInsights } from "@/lib/sales-insights";
import { SalesNumbers } from "@/components/SalesNumbers";
import { StalledDeals } from "@/components/StalledDeals";

const since = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m} דק׳` : m < 1440 ? `${Math.floor(m / 60)} שע׳` : `${Math.floor(m / 1440)} ימים`;
};

export default async function Dashboard() {
  const me = (await currentUser())!;
  if (me.role === "display") redirect("/tv");
  if (me.role !== "admin") redirect("/tasks");

  const [projects, blocks, gates, crm, handedOver] = await Promise.all([
    listProjects(), openBlocks(), pendingGates(), getLeads(), deliveredWaiting(),
  ]);
  const sales = summarize(crm.leads);
  const numbers = salesInsights(crm.leads);
  const waiting = gates.planGates.length + gates.releaseGates.length;
  /* delivered jobs are finished work — they do not belong in the live count */
  const doneIds = new Set(handedOver.map((p: any) => p.id));
  const active = projects.filter((p) => p.status === "active" && !doneIds.has(p.id));
  const onTheBoard = projects.filter((p) => !doneIds.has(p.id));

  return (
    <>
      <h1>לוח בקרה</h1>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(158px,1fr))", marginBottom: 28 }}>
        <Kpi value={blocks.length} label="תקלות פתוחות" color="var(--stop)" />
        <Kpi value={waiting} label="ממתין לחתימה" color="var(--bronze)" />
        <Kpi value={active.length} label="פרויקטים פעילים" color="var(--work)" />
        <Kpi value={projects.filter((p) => p.status === "draft").length} label="טיוטות" color="var(--steel)" />
      </div>

      <StalledDeals deals={sales.stalled as any} />

      {(sales.attention.length > 0 || sales.upcomingMeetings.length > 0) && (
        <>
          <Eyebrow>מכירות — לחזור ללקוחות</Eyebrow>
          {sales.upcomingMeetings.slice(0, 3).map((l: any) => (
            <Row key={`m-${l.id}`} tone="gold" chip="פגישה קרובה"
              title={l.customer?.name ?? ""}
              body={`${fmtDateTime(l.meeting_at)} · ${l.meeting_address || l.customer?.address || l.customer?.city || ""}`}
              href={`/crm/${l.id}`} />
          ))}
          {sales.attention.slice(0, 5).map((l: any) => (
            <Row key={l.id} tone="stop" chip={stageLabel(l.kind, l.stage)}
              title={l.customer?.name ?? ""}
              body={l.follow_up_on
                ? `ביקשת לחזור ב-${fmtDate(l.follow_up_on)}`
                : `${daysSince(l.stage_changed_at)} ימים בלי התקדמות`}
              href={`/crm/${l.id}`} />
          ))}
          {sales.attention.length > 5 && (
            <a href="/crm" className="mono" style={{ fontSize: 12, color: "var(--bronze)" }}>
              ועוד {sales.attention.length - 5} בלוח המכירות ←
            </a>
          )}
        </>
      )}

      {waiting > 0 && (
        <>
          <Eyebrow>ממתין לחתימה שלך</Eyebrow>
          {gates.planGates.map((p: any) => (
            <Row key={p.id} tone="gold" chip="אישור תוכניות"
              title={`${p.code} · ${p.name}`}
              body="ההדמיה אושרה מול הלקוח. עד לחתימה, תכנות החיתוך נעול."
              href={`/projects/${p.code}`} />
          ))}
          {gates.releaseGates.map((i: any) => (
            <Row key={i.id} tone="gold" chip="בקרה לפני אריזה"
              title={`${i.project.code} · ${i.name}`}
              body="הפריט מורכב ועבר בקרת איכות. עד לחתימה, אריזה והתקנה נעולות."
              href={`/projects/${i.project.code}`} />
          ))}
        </>
      )}

      {blocks.length > 0 && (
        <>
          <Eyebrow>דורש טיפול עכשיו</Eyebrow>
          {blocks.map((b: any) => (
            <Row key={b.id} tone="stop" chip={REASON_LABEL[b.reason_code]}
              title={`${b.project.code} · ${b.item?.name ?? b.project.name} — ${b.stage.name}`}
              body={b.note}
              meta={`${b.reporter?.full_name ?? ""} · ${since(b.reported_at)}`}
              href={`/projects/${b.project.code}`} />
          ))}
        </>
      )}

      {handedOver.length > 0 && (
        <div style={{
          marginTop: 22, padding: "12px 15px", borderRadius: 12,
          border: "1px solid var(--line-soft)", background: "rgba(0,0,0,.02)",
        }}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: ".22em", color: "var(--dim)", marginBottom: 9 }}>
            נמסר — ממתין להשלמה
          </div>
          {handedOver.map((p: any) => (
            <Link key={p.id} href={`/projects/${p.code}`} style={{
              display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
              padding: "5px 0", fontSize: 13, color: "var(--steel)", textDecoration: "none",
            }}>
              <span className="mono" style={{ fontSize: 11, color: "var(--bronze)" }}>{p.code}</span>
              <span>{p.name}</span>
              <span style={{ color: "var(--dim)" }}>
                {p.owed.length ? `· ${p.owed.map((o: any) => o.title).join(", ")}` : ""}
              </span>
            </Link>
          ))}
        </div>
      )}

      <SalesNumbers d={numbers} />

      <Eyebrow>כל הפרויקטים</Eyebrow>
      <div className="grid">
        {onTheBoard.map((p: any) => {
          const all = p.items?.flatMap((i: any) => i.stages ?? []) ?? [];
          const pct = all.length
            ? Math.round((all.filter((s: any) => s.status === "done").length / all.length) * 100) : 0;
          return (
            <Link key={p.id} href={`/projects/${p.code}`} className="panel" style={{ textDecoration: "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span className="mono" style={{ fontSize: 11, color: "var(--bronze)", letterSpacing: ".14em" }}>{p.code}</span>
                {p.status === "draft" && <span className="chip gold">טיוטה</span>}
              </div>
              <h3 style={{ fontFamily: "var(--display)", fontWeight: 500, fontSize: 21, margin: "9px 0 3px" }}>{p.name}</h3>
              <div style={{ fontSize: 13, color: "var(--steel)" }}>
                {p.client_name} · {p.items?.length ?? 0} פריטים
              </div>
              <div className="mono" style={{ display: "flex", justifyContent: "space-between", margin: "18px 0 12px", fontSize: 11, color: "var(--dim)" }}>
                <span style={{ color: "var(--bone)", fontSize: 14 }}>{pct}%</span>
                <span>יעד {p.due_date ?? "—"}</span>
              </div>
              {p.items?.map((i: any) => (
                <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
                  <span style={{ width: 100, fontSize: 12, color: "var(--steel)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                    {i.name}
                  </span>
                  <div style={{ flex: 1 }}><StageRail stages={i.stages ?? []} /></div>
                </div>
              ))}
            </Link>
          );
        })}
      </div>
    </>
  );
}

function Kpi({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="panel" style={{ padding: 20 }}>
      <div className="mono" style={{ fontSize: 36, lineHeight: 1, color }}>{value}</div>
      <div style={{ marginTop: 10, fontSize: 12, color: "var(--steel)" }}>{label}</div>
    </div>
  );
}
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono" style={{ fontSize: 10, letterSpacing: ".26em", color: "var(--dim)", margin: "22px 0 11px" }}>
      {children}
    </div>
  );
}
function Row({ tone, chip, title, body, meta, href }: {
  tone: "stop" | "gold"; chip: string; title: string; body: string; meta?: string; href: string;
}) {
  const stop = tone === "stop";
  return (
    <Link href={href} className="panel" style={{
      display: "flex", gap: 14, marginBottom: 10, textDecoration: "none", alignItems: "flex-start",
      borderColor: stop ? "rgba(216,80,63,.4)" : "rgba(201,146,79,.45)",
      background: stop
        ? "linear-gradient(90deg,rgba(216,80,63,.1),rgba(255,255,255,.6))"
        : "linear-gradient(90deg,rgba(201,146,79,.12),rgba(255,255,255,.6))",
    }}>
      <span className={`chip ${stop ? "stop" : "gold"}`}>{chip}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14 }}>{title}</div>
        <div style={{
          marginTop: 9, padding: "11px 13px", borderRadius: 10, background: "rgba(0,0,0,.045)",
          fontSize: 13, lineHeight: 1.65, color: stop ? "#8E2E20" : "#7E5620",
        }}>{body}</div>
        {meta && <div className="mono" style={{ marginTop: 6, fontSize: 10, color: "var(--dim)" }}>{meta}</div>}
      </div>
    </Link>
  );
}
