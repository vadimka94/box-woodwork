import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import {
  getLead, KIND_LABEL, STYLE_LABEL, LOST_REASONS, FILE_KIND_LABEL, EVENT_LABEL, STAGE_COLOR,
  stageLabel, money, fmtDateTime, fmtDate, waLink, wazeLink,
} from "@/lib/crm";
import {
  StageBar, CustomerForm, DealForm, NoteForm, FileUpload, WonPanel, LostPanel, ReopenButton, UndoWonButton,
} from "@/components/Crm";
import { Realtime } from "@/components/Realtime";

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await currentUser();
  if (!me || me.role !== "admin") redirect("/tasks");
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();

  const c = lead.customer;
  const wa = waLink(c.phone);
  const address = lead.meeting_address || c.address || c.city;
  const waze = wazeLink(address);
  const transfers = lead.files.filter((f: any) => f.kind === "transfer");
  const closed = lead.stage === "won" || lead.stage === "lost";
  const readyToClose = lead.stage === "awaiting_payment";

  return (
    <>
      <Realtime tables={["leads", "lead_events", "lead_files"]} />
      <Link href="/crm" className="mono" style={{ fontSize: 12, color: "var(--steel)", textDecoration: "none" }}>
        → חזרה ללוח
      </Link>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start", marginTop: 10 }}>
        <div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="chip" style={{ borderColor: STAGE_COLOR[lead.stage], color: STAGE_COLOR[lead.stage] }}>
              {stageLabel(lead.kind, lead.stage)}
            </span>
            <span className="chip">{KIND_LABEL[lead.kind as "private" | "contractor"]}</span>
            {c.source && <span className="chip">{c.source}</span>}
          </div>
          <h1 style={{ margin: "10px 0 4px" }}>
            <Link href={`/crm/customers/${c.id}`} style={{ textDecoration: "none", color: "inherit" }}>{c.name}</Link>
          </h1>
          <Link href={`/crm/customers/${c.id}`} className="mono"
            style={{ fontSize: 12, color: "var(--bronze)", textDecoration: "none" }}>
            כרטיס לקוח{lead.history.length ? ` · ${lead.history.length} עבודות נוספות` : ""} ←
          </Link>
          <div style={{ color: "var(--steel)", fontSize: 14 }}>
            {lead.title ?? (lead.style ? STYLE_LABEL[lead.style] : "")}
            {lead.final_price ? ` · ${money(lead.final_price)}` : ""}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {wa && <a className="btn btn-go" href={wa} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>וואטסאפ</a>}
          {c.phone && <a className="btn" href={`tel:${c.phone}`} style={{ textDecoration: "none" }}>חייג</a>}
          {waze && <a className="btn" href={waze} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>נווט ב-Waze</a>}
        </div>
      </div>

      {lead.stage === "meeting_set" && lead.meeting_at && (
        <div className="lockbar" style={{ marginTop: 16 }}>
          פגישה: {fmtDateTime(lead.meeting_at)}{address ? ` · ${address}` : ""}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <StageBar leadId={lead.id} kind={lead.kind} stage={lead.stage} />
      </div>

      {lead.stage === "won" && lead.project && (
        <div className="panel" style={{ marginBottom: 16, borderColor: "rgba(46,131,85,.45)" }}>
          <div style={{ fontSize: 15 }}>
            ✓ נסגר · מקדמה {money(lead.deposit_amount)} התקבלה ב-{fmtDate(lead.deposit_at)}
          </div>
          <div style={{ fontSize: 13, color: "var(--steel)", marginTop: 6 }}>
            יתרה לגבייה בסיום ההתקנה:{" "}
            {lead.final_price ? money(Number(lead.final_price) - Number(lead.deposit_amount ?? 0)) : "—"}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start", marginTop: 12 }}>
            <Link href={`/projects/${lead.project.code}`} className="btn btn-primary"
              style={{ textDecoration: "none", display: "inline-block" }}>
              לפרויקט {lead.project.code} ←
            </Link>
            {lead.project.status === "draft" && !(lead.project.items?.length) && (
              <UndoWonButton leadId={lead.id} />
            )}
          </div>
          {(lead.project.status !== "draft" || (lead.project.items?.length ?? 0) > 0) && (
            <div style={{ fontSize: 12, color: "var(--steel)", marginTop: 10, lineHeight: 1.7 }}>
              אי אפשר לבטל את הסגירה מכאן, כי בפרויקט כבר יש פריטים או שהוא אושר לייצור.
              אם העסקה באמת בוטלה — מוחקים את הפרויקט מתוך דף הפרויקט, ואז חוזרים לכאן ומבטלים את הסגירה.
            </div>
          )}
        </div>
      )}

      {lead.stage === "won" && !lead.project && (
        <div className="panel lockbar" style={{ marginBottom: 16 }}>
          <div>העסקה מסומנת כנסגרה, אבל הפרויקט שלה נמחק.</div>
          <div style={{ marginTop: 10 }}><UndoWonButton leadId={lead.id} /></div>
        </div>
      )}

      {lead.stage === "lost" && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 15 }}>לא נסגר · {LOST_REASONS[lead.lost_reason] ?? "—"}</div>
          {lead.lost_note && <div style={{ fontSize: 13, color: "var(--steel)", marginTop: 6 }}>{lead.lost_note}</div>}
          <div style={{ marginTop: 12 }}><ReopenButton leadId={lead.id} /></div>
        </div>
      )}

      {readyToClose && <WonPanel lead={lead} hasTransfer={transfers.length > 0} />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16, alignItems: "start" }}>
        <div>
          <div className="panel" style={{ marginBottom: 16 }}>
            <h4 className="mono">העבודה</h4>
            <DealForm lead={lead} />
          </div>

          <div className="panel" style={{ marginBottom: 16 }}>
            <h4 className="mono">פרטי לקוח</h4>
            <CustomerForm c={c} />
          </div>
        </div>

        <div>
          <div className="panel" style={{ marginBottom: 16 }}>
            <h4 className="mono">קבצים</h4>
            <FileUpload leadId={lead.id} defaultKind={readyToClose ? "transfer" : "measure"} />
            {lead.files.length === 0 && (
              <div style={{ fontSize: 13, color: "var(--steel)", marginTop: 12 }}>
                עוד אין קבצים. מידות ותמונות מהפגישה, אישור ההעברה והחוזה — הכול נשמר כאן.
              </div>
            )}
            {Object.keys(FILE_KIND_LABEL).map((k) => {
              const list = lead.files.filter((f: any) => f.kind === k);
              if (!list.length) return null;
              return (
                <div key={k} style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 13, color: "var(--steel)", marginBottom: 8 }}>{FILE_KIND_LABEL[k]}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {list.map((f: any) => (
                      <a key={f.id} href={f.url ?? "#"} target="_blank" rel="noreferrer" title={f.name ?? ""}>
                        {/\.pdf$/i.test(f.storage_path)
                          ? <span className="chip" style={{ padding: "30px 14px" }}>PDF</span>
                          : <img src={f.url ?? ""} alt="" width={88} height={88}
                              style={{ borderRadius: 10, objectFit: "cover", border: "1px solid var(--line)" }} />}
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="panel" style={{ marginBottom: 16 }}>
            <h4 className="mono">ציר זמן</h4>
            {!closed && <NoteForm leadId={lead.id} />}
            <div style={{ marginTop: 18 }}>
              {lead.events.map((e: any) => (
                <div key={e.id} style={{ padding: "11px 0", borderTop: "1px solid var(--line-soft)" }}>
                  <div className="mono" style={{ fontSize: 11, color: "var(--dim)" }}>
                    {fmtDateTime(e.created_at)} · {EVENT_LABEL[e.kind] ?? e.kind}{e.actor_name ? ` · ${e.actor_name}` : ""}
                  </div>
                  {e.note && <div style={{ fontSize: 14, marginTop: 4, whiteSpace: "pre-wrap" }}>{e.note}</div>}
                </div>
              ))}
            </div>
          </div>

          {lead.history.length > 0 && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <h4 className="mono">עבודות קודמות של הלקוח</h4>
              {lead.history.map((h: any) => (
                <Link key={h.id} href={`/crm/${h.id}`} style={{
                  display: "flex", justifyContent: "space-between", gap: 8, padding: "9px 0",
                  borderTop: "1px solid var(--line-soft)", textDecoration: "none", fontSize: 14,
                }}>
                  <span>{h.title ?? stageLabel(h.kind, h.stage)} {h.project?.code ? `· ${h.project.code}` : ""}</span>
                  <span className="mono" style={{ color: "var(--steel)" }}>{money(h.final_price)} · {fmtDate(h.created_at)}</span>
                </Link>
              ))}
            </div>
          )}

          {!closed && <LostPanel leadId={lead.id} />}
        </div>
      </div>
    </>
  );
}
