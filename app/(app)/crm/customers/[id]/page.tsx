import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import {
  getCustomer, KIND_LABEL, STYLE_LABEL, STAGE_COLOR, LOST_REASONS,
  stageLabel, money, fmtDate, waLink, wazeLink,
} from "@/lib/crm";
import { CustomerForm, QuickAdd, MergePanel } from "@/components/Crm";
import { CrmTabs } from "@/components/CrmTabs";
import { Realtime } from "@/components/Realtime";

/** The customer card: who they are and everything they ever ordered. */
export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await currentUser();
  if (!me || me.role !== "admin") redirect("/tasks");
  const { id } = await params;
  const c = await getCustomer(id);
  if (!c) notFound();

  const wa = waLink(c.phone);
  const waze = wazeLink(c.address || c.city);
  const s = c.stats;

  return (
    <>
      <Realtime tables={["leads"]} />
      <CrmTabs active="customers" />

      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start", marginTop: 12 }}>
        <div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="chip">{KIND_LABEL[c.kind as "private" | "contractor"]}</span>
            {c.source && <span className="chip">{c.source}</span>}
            {s.won >= 2 && <span className="chip go">לקוח חוזר</span>}
          </div>
          <h1 style={{ margin: "10px 0 4px" }}>{c.name}</h1>
          <div style={{ color: "var(--steel)", fontSize: 14 }}>
            {[c.phone, c.address || c.city].filter(Boolean).join(" · ")}
            {" · "}לקוח מאז {fmtDate(s.firstAt)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {wa && <a className="btn btn-go" href={wa} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>וואטסאפ</a>}
          {c.phone && <a className="btn" href={`tel:${c.phone}`} style={{ textDecoration: "none" }}>חייג</a>}
          {waze && <a className="btn" href={waze} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>נווט ב-Waze</a>}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", margin: "20px 0" }}>
        <Kpi value={money(s.total)} label="סך עבודות שנסגרו" color="var(--go)" />
        <Kpi value={String(s.won)} label="עבודות שנסגרו" color="var(--bone)" />
        <Kpi value={String(s.open)} label="עסקאות פתוחות" color={s.open ? "var(--work)" : "var(--dim)"} />
        <Kpi value={fmtDate(s.lastAt)} label="פנייה אחרונה" color="var(--bronze)" />
      </div>

      {c.notes && (
        <div className="lockbar" style={{ marginBottom: 16, whiteSpace: "pre-wrap" }}>{c.notes}</div>
      )}

      <div style={{ marginBottom: 16 }}>
        <QuickAdd customer={{ id: c.id, name: c.name, kind: c.kind }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16, alignItems: "start" }}>
        <div className="panel">
          <h4 className="mono">כל העסקאות · {s.deals}</h4>
          {c.deals.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--steel)" }}>אין עדיין עסקאות.</div>
          )}
          {c.deals.map((d: any) => (
            <Link key={d.id} href={`/crm/${d.id}`} style={{
              display: "block", padding: "12px 0", borderTop: "1px solid var(--line-soft)", textDecoration: "none",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontSize: 15 }}>
                  {d.title ?? (d.style ? STYLE_LABEL[d.style] : null) ?? (d.request ? String(d.request).slice(0, 50) : "עסקה")}
                </span>
                <span className="mono" style={{ fontSize: 14, color: d.stage === "won" ? "var(--go)" : "var(--steel)" }}>
                  {money(d.final_price)}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
                <span className="chip" style={{ borderColor: STAGE_COLOR[d.stage], color: STAGE_COLOR[d.stage] }}>
                  {stageLabel(d.kind, d.stage)}
                </span>
                {d.project && <span className="chip gold">{d.project.code}</span>}
                {d.stage === "lost" && d.lost_reason && (
                  <span style={{ fontSize: 12, color: "var(--steel)" }}>{LOST_REASONS[d.lost_reason]}</span>
                )}
                <span className="mono" style={{ fontSize: 11, color: "var(--dim)" }}>{fmtDate(d.created_at)}</span>
              </div>
              {d.models && (
                <div style={{ fontSize: 12, color: "var(--steel)", marginTop: 6 }}>דגמים: {d.models}</div>
              )}
            </Link>
          ))}
        </div>

        <div>
          <div className="panel" style={{ marginBottom: 16 }}>
            <h4 className="mono">פרטי לקוח</h4>
            <CustomerForm c={c} />
            <div style={{ fontSize: 12, color: "var(--steel)", marginTop: 10, lineHeight: 1.7 }}>
              "הערות על הלקוח" נשארות בכרטיס לכל העסקאות הבאות — למשל העדפות גוונים או תנאי תשלום.
            </div>
          </div>
          <MergePanel keep={{ id: c.id, name: c.name }} others={c.others} />
        </div>
      </div>
    </>
  );
}

function Kpi({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="panel" style={{ padding: 18 }}>
      <div className="mono" style={{ fontSize: 26, lineHeight: 1, color }}>{value}</div>
      <div style={{ marginTop: 10, fontSize: 12, color: "var(--steel)" }}>{label}</div>
    </div>
  );
}
