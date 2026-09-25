import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser, createClient } from "@/lib/supabase/server";
import { getTimeline, FLAG_LABEL, FLAG_NOTE } from "@/lib/timeline";
import { STATUS_LABEL, REASON_LABEL } from "@/lib/i18n";

const HE_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const COLOR: Record<string, string> = {
  idle: "var(--idle)", work: "var(--work)", done: "var(--go)", stop: "var(--stop)",
};
const dur = (s: number) =>
  s < 60 ? `${s} שנ׳` : s < 3600 ? `${Math.round(s / 60)} דק׳` : `${(s / 3600).toFixed(1)} שע׳`;

/** Every mark one person made, in order, so you can judge it yourself. */
export default async function WorkerTimeline({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ d?: string; only?: string }>;
}) {
  const me = await currentUser();
  if (!me || me.role !== "admin") redirect("/tasks");

  const { id } = await params;
  const { d, only } = await searchParams;
  const days = Number(d ?? 14);

  const supabase = await createClient();
  const { data: worker } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  if (!worker) notFound();

  const all = await getTimeline(id, days);
  const flagged = all.filter((e) => e.flags.length > 0);
  const events = only === "flags" ? flagged : all;

  const byDay = events.reduce((acc: Record<string, typeof events>, e) => {
    const key = e.at.slice(0, 10);
    (acc[key] ??= []).push(e);
    return acc;
  }, {});

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>{worker.full_name}</h1>
          <div style={{ color: "var(--steel)", fontSize: 14 }}>
            {(worker.title ?? []).join(" · ")} · {all.length} סימונים ב-{days} ימים
          </div>
        </div>
        <Link className="btn" href="/usage" style={{ textDecoration: "none" }}>← למעקב שימוש</Link>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "20px 0" }}>
        {[7, 14, 30].map((n) => (
          <Link key={n} href={`/usage/${id}?d=${n}${only ? `&only=${only}` : ""}`}
            className={`btn${days === n ? " btn-primary" : ""}`} style={{ textDecoration: "none" }}>
            {n} ימים
          </Link>
        ))}
        <Link href={`/usage/${id}?d=${days}${only === "flags" ? "" : "&only=flags"}`}
          className={`btn${only === "flags" ? " btn-stop" : ""}`} style={{ textDecoration: "none" }}>
          {only === "flags" ? "הצג הכל" : `רק סימני שאלה · ${flagged.length}`}
        </Link>
      </div>

      {flagged.length > 0 && (
        <div className="lockbar" style={{ marginBottom: 20, fontSize: 13, lineHeight: 1.8 }}>
          {FLAG_NOTE}
        </div>
      )}

      {events.length === 0 && (
        <div className="panel" style={{ textAlign: "center", padding: 40, color: "var(--steel)" }}>
          {only === "flags" ? "אין סימני שאלה בתקופה הזו." : "אין סימונים בתקופה הזו."}
        </div>
      )}

      {Object.entries(byDay).map(([day, list]) => {
        const dd = new Date(day + "T00:00:00");
        return (
          <div key={day} style={{ marginBottom: 26 }}>
            <div className="mono" style={{ fontSize: 13, color: "var(--steel)", letterSpacing: ".12em", marginBottom: 10 }}>
              יום {HE_DAYS[dd.getDay()]} · {dd.getDate()}.{dd.getMonth() + 1} · {list.length} סימונים
            </div>

            {list.map((e) => (
              <div className="panel" key={e.id} style={{
                marginBottom: 10, padding: 18,
                borderColor: e.flags.length ? "rgba(176,59,44,.45)" : undefined,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span className="mono" style={{ fontSize: 15, color: "var(--bone)" }}>
                    {new Date(e.at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                  </span>

                  <span style={{ width: 10, height: 10, borderRadius: 99, background: COLOR[e.to] }} />

                  <span style={{ fontSize: 15, color: COLOR[e.to] }}>
                    {e.from ? `${STATUS_LABEL[e.from]} ← ` : ""}{STATUS_LABEL[e.to]}
                  </span>

                  <span style={{ flex: 1, minWidth: 160, fontSize: 15 }}>
                    {String(e.seq).padStart(2, "0")} · {e.stage}
                  </span>

                  <Link href={`/projects/${e.code}`} className="mono"
                    style={{ fontSize: 12, color: "var(--steel)", textDecoration: "none" }}>
                    {e.code} · {e.item ?? e.project}
                  </Link>
                </div>

                {e.workSeconds !== null && (
                  <div className="mono" style={{ fontSize: 12, color: "var(--steel)", marginTop: 10 }}>
                    זמן מההתחלה עד הסגירה: {dur(e.workSeconds)}
                  </div>
                )}

                {e.reason && (
                  <div style={{ marginTop: 10 }}>
                    <span className="chip stop">{REASON_LABEL[e.reason] ?? e.reason}</span>
                  </div>
                )}

                {e.note && (
                  <div style={{
                    marginTop: 10, padding: "11px 13px", borderRadius: 10, fontSize: 13, lineHeight: 1.7,
                    background: "rgba(0,0,0,.04)", color: "var(--bone)",
                  }}>{e.note}</div>
                )}

                {e.flags.length > 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                    {e.flags.map((f) => (
                      <span key={f} className="chip stop">◆ {FLAG_LABEL[f]}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}
