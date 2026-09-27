import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { floorBoard, openBlocks, pendingGates } from "@/lib/queries";
import { getInstallations, isoDay, HE_DAYS, jobCode, jobTitle, isOtherJob } from "@/lib/schedule";
import { getExtras } from "@/lib/extras";
import { ROUTE_LABEL, SOURCE_LABEL } from "@/lib/extra-labels";
import { Realtime } from "@/components/Realtime";
import { REASON_LABEL, STATUS_LABEL } from "@/lib/i18n";
import { ru } from "@/lib/tv-i18n";

const STATIONS = ["מדידה ותכנון", "תכנות CNC", "מכונת CNC", "קנט", "הרכבה", "בקרת איכות", "אריזה", "התקנה"];
const COLOR: Record<string, string> = { work: "#F0A050", stop: "#FF5544" };

const since = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m} דק׳` : m < 1440 ? `${Math.floor(m / 60)} שע׳` : `${Math.floor(m / 1440)} ימים`;
};

/**
 * The board is now weighted by what needs a person to do something.
 * Problems and shortages take the top half at full size, because they are the
 * reason anyone looks up. The stations underneath are context — you glance at
 * them to see where a job is, not to be told to act — so they run as a compact
 * strip the same height as the installation row.
 */
export default async function TvPage() {
  const me = await currentUser();
  if (!me) redirect("/login");

  const today = new Date();
  const horizon = new Date(); horizon.setDate(horizon.getDate() + 6);

  const [rows, blocks, gates, installs, extras] = await Promise.all([
    floorBoard(), openBlocks(), pendingGates(),
    getInstallations(isoDay(today), isoDay(horizon)),
    getExtras({ openOnly: true }),
  ]);

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const iso = isoDay(d);
    return { d, iso, jobs: installs.filter((x: any) => x.scheduled_date === iso) };
  });

  const waiting = [
    ...gates.planGates.map((p: any) => ({ code: p.code, what: p.name, why: "אישור תוכניות" })),
    ...gates.releaseGates.map((i: any) => ({ code: i.project.code, what: i.name, why: "בקרה לפני אריזה" })),
  ];

  const busy = STATIONS
    .map((station) => {
      const here = rows.filter((r: any) => r.station === station);
      const lead = here.find((r: any) => r.status === "stop") ?? here[0];
      return lead ? { station, lead } : null;
    })
    .filter(Boolean) as { station: string; lead: any }[];

  const idle = STATIONS.filter((s) => !busy.some((b) => b.station === s));

  const topBlock = blocks[0];
  const topExtra = extras[0];
  const moreBlocks = Math.max(0, blocks.length - 1) + waiting.length;
  const moreExtras = Math.max(0, extras.length - 1);
  const hasAlerts = !!topBlock || !!topExtra || waiting.length > 0;

  return (
    <div style={{
      height: "100dvh", overflow: "hidden", background: "#08090B",
      padding: "1.4vh 1vw", display: "flex", flexDirection: "column", gap: "1.2vh",
    }}>
      <Realtime pollMs={30000} />

      <div style={{
        flex: "0 0 auto", display: "flex", justifyContent: "space-between", alignItems: "baseline",
        borderBottom: "2px solid #2A2E35", paddingBottom: "1vh",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "1.4vw" }}>
          <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: "3.2vh", color: "#FFFDF9" }}>
            BOX <span style={{ color: "#E0A860" }}>WOODWORK</span>
          </div>
          <Link href="/" className="mono" style={{
            fontSize: "1.6vh", color: "#98A1AC", border: "1px solid #2A2E35",
            borderRadius: 99, padding: ".6vh 1vw", textDecoration: "none",
          }}>← למערכת</Link>
        </div>
        <div className="mono" style={{ fontSize: "3vh", color: "#E8ECF1" }}>
          {HE_DAYS[today.getDay()]} · {String(today.getDate()).padStart(2, "0")}.{String(today.getMonth() + 1).padStart(2, "0")}
        </div>
      </div>

      {/* ---------- what needs a person: now the largest thing on the wall ---------- */}
      {hasAlerts && (
        <div style={{
          flex: "0 0 auto", height: "32vh", display: "grid", gap: "1vw",
          gridTemplateColumns: topBlock && topExtra ? "1fr 1fr" : "1fr",
        }}>
          {topBlock && (
            <Card tone="#FF5544" he="עצור" count={blocks.length + waiting.length} more={moreBlocks}
              tag={REASON_LABEL[topBlock.reason_code]}
              main={topBlock.item?.name ?? topBlock.project?.name}
              sub={`${topBlock.project?.code} · ${topBlock.stage?.name} · ${topBlock.reporter?.full_name ?? ""}`}
              detail={topBlock.note} detailRu={topBlock.note_tr?.ru}
              right={since(topBlock.reported_at)} blink />
          )}

          {!topBlock && waiting.length > 0 && (
            <Card tone="#E0A860" he="ממתין לחתימה" count={waiting.length} more={waiting.length - 1}
              tag={waiting[0].why} main={waiting[0].what} sub={waiting[0].code} right="נעול" />
          )}

          {topExtra && (
            <Link href={`/extras#${topExtra.id}`} style={{ textDecoration: "none", display: "block", minHeight: 0 }}>
              <Card tone="#C08FE0" he="חוסרים ותוספות" count={extras.length} more={moreExtras}
                tag={SOURCE_LABEL[topExtra.source]}
                main={topExtra.title}
                sub={`${topExtra.project?.code ?? "כללי"} · ${ROUTE_LABEL[topExtra.route]} · ${topExtra.assignee?.full_name ?? "כללי — מי לוקח?"}`}
                detail={topExtra.description} detailRu={topExtra.description_tr?.ru}
                right={topExtra.status === "work" ? "בעבודה" : "פתוח"} />
            </Link>
          )}
        </div>
      )}

      {/* ---------- installations : clickable ---------- */}
      <div style={{ flex: "0 0 auto", display: "flex", gap: ".5vw", height: "14vh" }}>
        <div style={{ display: "grid", placeItems: "center", padding: "0 .8vw",
                      borderRadius: 12, border: "1px solid #22262C" }}>
          <div className="mono" style={{ fontSize: "2.2vh", color: "#E8ECF1" }}>התקנות</div>
          <div className="mono" style={{ fontSize: "1.7vh", color: "#98A1AC" }}>{ru("התקנות")}</div>
        </div>

        {week.map(({ d, iso, jobs }) => {
          const isBusy = jobs.length > 0;
          const isToday = iso === isoDay(today);
          const j = jobs[0];

          const inner = (
            <div className={isBusy ? "blink" : ""} style={{
              height: "100%", borderRadius: 14, padding: ".8vh .6vw", overflow: "hidden",
              border: `2px solid ${isBusy ? "#F0A050" : isToday ? "#4A515A" : "#1C2026"}`,
              background: isBusy ? "rgba(240,160,80,.18)" : "#0E1014",
              boxShadow: isBusy ? "0 0 28px rgba(240,160,80,.3)" : "none",
            }}>
              <div className="mono" style={{
                fontSize: "2.3vh", color: isBusy ? "#FFC98A" : isToday ? "#E0A860" : "#AEB6C0",
              }}>
                {HE_DAYS[d.getDay()].slice(0, 2)} {d.getDate()}/{d.getMonth() + 1}
              </div>

              {j && (
                <>
                  <div className="mono" style={{
                    fontSize: isOtherJob(j) ? "2.6vh" : "4.6vh", color: "#FFD9A8", lineHeight: 1.15,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {isOtherJob(j) ? jobTitle(j) : jobCode(j)}
                  </div>
                  <div className="mono" style={{ fontSize: "2.6vh", color: "#F0A050" }}>
                    {j.start_time ? j.start_time.slice(0, 5) : "—"}
                  </div>
                  <div style={{ fontSize: "2vh", color: "#E8ECF1",
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {j.crew?.map((c: any) => c.full_name).join(", ") || "ללא צוות"}
                  </div>
                </>
              )}
            </div>
          );

          return j ? (
            <Link key={iso} href={`/schedule/${j.id}`}
              style={{ flex: 1, minWidth: 0, textDecoration: "none" }}>{inner}</Link>
          ) : (
            <div key={iso} style={{ flex: 1, minWidth: 0 }}>{inner}</div>
          );
        })}
      </div>

      {/* ---------- the floor : a compact strip, same height as the week ---------- */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: ".5vw" }}>
        <div style={{ display: "grid", placeItems: "center", padding: "0 .8vw",
                      borderRadius: 12, border: "1px solid #22262C" }}>
          <div className="mono" style={{ fontSize: "2.2vh", color: "#E8ECF1" }}>תחנות</div>
          <div className="mono" style={{ fontSize: "1.7vh", color: "#98A1AC" }}>Станции</div>
        </div>

        {busy.map(({ station, lead }) => {
          const c = COLOR[lead.status];
          return (
            <div key={station} style={{
              position: "relative", overflow: "hidden", flex: 1, minWidth: 0, borderRadius: 14,
              padding: ".8vh .7vw", background: "#0E1014", border: `2px solid ${c}55`,
            }}>
              <span style={{ position: "absolute", insetBlock: 0, insetInlineEnd: 0, width: 6, background: c }} />

              <div className="mono" style={{ fontSize: "2.4vh", color: c,
                                             overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {station}
              </div>
              <div className="mono" style={{ fontSize: "1.6vh", color: "#98A1AC",
                                             overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ru(station)}
              </div>

              <div style={{
                fontFamily: "var(--display)", fontWeight: 500, fontSize: "3.4vh",
                lineHeight: 1.15, color: "#FFFDF9", marginTop: ".6vh",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{lead.item ?? lead.project}</div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: ".4vw", marginTop: ".3vh" }}>
                <span className="mono" style={{ fontSize: "2.4vh", color: "#E8ECF1" }}>{lead.code}</span>
                <span className={`mono ${lead.status === "stop" ? "blink" : ""}`}
                  style={{ fontSize: "2.3vh", color: c, whiteSpace: "nowrap" }}>
                  {STATUS_LABEL[lead.status]}
                </span>
              </div>

              <div style={{ fontSize: "2.1vh", color: "#D6DCE4",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {lead.crew ?? "—"}
              </div>
            </div>
          );
        })}

        {busy.length === 0 && (
          <div style={{
            flex: 1, display: "grid", placeItems: "center",
            border: "2px dashed #22262C", borderRadius: 14, color: "#8B939E",
          }}>
            <div style={{ fontFamily: "var(--display)", fontSize: "2.6vh" }}>אין עבודה פעילה</div>
            <div className="mono" style={{ fontSize: "1.6vh" }}>{ru("אין עבודה פעילה על הרצפה")}</div>
          </div>
        )}
      </div>

      {idle.length > 0 && busy.length > 0 && (
        <div style={{ flex: "0 0 auto", display: "flex", gap: ".4vw", alignItems: "center", overflow: "hidden" }}>
          <span className="mono" style={{ fontSize: "1.8vh", color: "#8B939E", whiteSpace: "nowrap" }}>
            פנויות · {ru("פנויות")}
          </span>
          {idle.map((station) => (
            <span key={station} className="mono" style={{
              fontSize: "1.8vh", color: "#AEB6C0", border: "1px solid #2A2F36",
              borderRadius: 99, padding: ".4vh .7vw", whiteSpace: "nowrap",
            }}>{station}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Now the big one. It fills the top of the wall, so the text can breathe. */
function Card({ tone, he, count, more, tag, main, sub, detail, detailRu, right, blink }: {
  tone: string; he: string; count: number; more: number;
  tag: string; main: string; sub: string;
  detail?: string | null; detailRu?: string | null; right: string; blink?: boolean;
}) {
  return (
    <div style={{
      position: "relative", overflow: "hidden", height: "100%", borderRadius: 18,
      border: `2px solid ${tone}66`, background: "#0D0F13", padding: "1.6vh 1.4vw",
      display: "flex", flexDirection: "column",
    }}>
      <span style={{ position: "absolute", insetBlock: 0, insetInlineEnd: 0, width: 10, background: tone }} />

      <div style={{ display: "flex", alignItems: "baseline", gap: ".9vw", flexWrap: "wrap" }}>
        <span className="mono" style={{ fontSize: "4.2vh", color: tone, lineHeight: 1 }}>{count}</span>
        <span className="mono" style={{ fontSize: "2.6vh", letterSpacing: ".1em", color: tone }}>{he}</span>
        <span className="mono" style={{ fontSize: "2.2vh", color: tone, opacity: .8 }}>{ru(he)}</span>
        <span className={`mono ${blink ? "blink" : ""}`}
          style={{ marginInlineStart: "auto", fontSize: "2.8vh", color: tone }}>{right}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "1vw", marginTop: "1.4vh", flexWrap: "wrap" }}>
        <span className="mono" style={{
          fontSize: "2.3vh", color: tone, whiteSpace: "nowrap",
          border: `2px solid ${tone}77`, borderRadius: 99, padding: ".5vh 1.1vw",
        }}>{tag}</span>
        <span style={{ fontFamily: "var(--display)", fontSize: "3.8vh", color: "#FFFDF9", lineHeight: 1.15 }}>
          {main}
        </span>
      </div>

      <div className="mono" style={{ fontSize: "2.5vh", color: "#D6DCE4", marginTop: ".8vh" }}>{sub}</div>

      {detail && (
        <div style={{
          marginTop: "1.2vh", padding: "1.2vh 1.2vw", borderRadius: 12, overflow: "hidden",
          background: "rgba(255,255,255,.05)", borderInlineStart: `5px solid ${tone}`,
        }}>
          <div style={{ fontSize: "2.7vh", lineHeight: 1.4, color: "#EFEDE9" }}>{detail}</div>
          {detailRu
            ? <div style={{ fontSize: "2.3vh", lineHeight: 1.4, color: "#A9C4E4", marginTop: ".6vh" }}>{detailRu}</div>
            : <div className="mono" style={{ fontSize: "1.9vh", color: "#8B939E", marginTop: ".6vh" }}>
                — תרגום לרוסית לא זמין —
              </div>}
        </div>
      )}

      {more > 0 && (
        <div className="mono" style={{ fontSize: "2vh", color: tone, opacity: .8, marginTop: "auto", paddingTop: "1vh" }}>
          + עוד {more}
        </div>
      )}
    </div>
  );
}
