import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/supabase/server";
import { getUsage } from "@/lib/usage";

const HE_SHORT = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

const ago = (isoStr: string | null) => {
  if (!isoStr) return "מעולם";
  const m = Math.max(1, Math.round((Date.now() - new Date(isoStr).getTime()) / 60000));
  if (m < 60) return `לפני ${m} דק׳`;
  if (m < 1440) return `לפני ${Math.floor(m / 60)} שע׳`;
  return `לפני ${Math.floor(m / 1440)} ימים`;
};

const dur = (sec: number) => {
  if (sec < 60) return `${sec} שנ׳`;
  if (sec < 3600) return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} דק׳`;
  return `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")} שע׳`;
};

export default async function UsagePage({
  searchParams,
}: { searchParams: Promise<{ d?: string }> }) {
  const me = await currentUser();
  if (!me || me.role !== "admin") redirect("/tasks");

  const { d } = await searchParams;
  const days = Number(d ?? 14);
  const rows = await getUsage(days);
  const maxVisits = Math.max(1, ...rows.flatMap((r) => r.perDay.map((x) => x.visits)));

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ marginBottom: 0 }}>מעקב שימוש</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {[7, 14, 30].map((n) => (
            <Link key={n} href={`/usage?d=${n}`} className={`btn${days === n ? " btn-primary" : ""}`}
              style={{ textDecoration: "none" }}>{n} ימים</Link>
          ))}
        </div>
      </div>

      <div style={{ color: "var(--steel)", fontSize: 14, margin: "14px 0 24px", lineHeight: 1.75, maxWidth: 700 }}>
        כל כניסה למערכת נרשמת בנפרד, עם משך אמיתי. המספר החשוב הוא{" "}
        <b style={{ fontWeight: 500, color: "var(--bone)" }}>כמות הכניסות</b> — עובד שנכנס שמונה
        פעמים ביום עובד מול המערכת, וזה שנכנס פעם אחת ממלא הכל בדיעבד.
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(380px,1fr))" }}>
        {rows.map((r) => {
          const cold = !r.lastSeen || (Date.now() - +new Date(r.lastSeen)) > 3 * 24 * 3600 * 1000;
          const perDay = (r.visits / days).toFixed(1);
          return (
            <div className="panel" key={r.profile.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div>
                  <div style={{ fontFamily: "var(--display)", fontSize: 22 }}>{r.profile.full_name}</div>
                  <div className="mono" style={{ fontSize: 10, color: "var(--dim)", marginTop: 4 }}>
                    {(r.profile.title ?? []).join(" · ")}
                  </div>
                </div>
                <span className={`chip ${cold ? "stop" : "go"}`}>{ago(r.lastSeen)}</span>
              </div>

              <div style={{ display: "flex", gap: 20, margin: "20px 0 4px", flexWrap: "wrap" }}>
                <Stat n={r.visits} label="כניסות" strong />
                <Stat n={perDay} label="כניסות ליום" />
                <Stat n={dur(r.avgVisit)} label="ממוצע לכניסה" />
                <Stat n={dur(r.seconds)} label="סה״כ במערכת" />
              </div>

              <div style={{ display: "flex", gap: 20, marginBottom: 4, flexWrap: "wrap" }}>
                <Stat n={`${r.days}/${days}`} label="ימים פעילים" />
                <Stat n={r.events} label="סימונים" />
                <Stat n={r.completed} label="שלבים שסגר" />
                <Stat n={r.blocks} label="תקלות שדיווח" />
              </div>

              {/* work nobody handed him — the number worth looking at */}
              <div style={{
                display: "flex", gap: 20, flexWrap: "wrap", marginTop: 14, paddingTop: 14,
                borderTop: "1px solid var(--line-soft)",
              }}>
                <Stat n={r.extras} label="חוסרים שסגר" />
                <Stat n={r.extrasTaken} label="לקח ביוזמתו" highlight={r.extrasTaken > 0} />
              </div>

              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 70, marginTop: 18 }}>
                {r.perDay.map((day) => {
                  const h = Math.max(3, Math.round((day.visits / maxVisits) * 58));
                  const wd = new Date(day.iso + "T00:00:00").getDay();
                  return (
                    <div key={day.iso} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
                      title={`${day.iso} · ${day.visits} כניסות · ${dur(day.seconds)} · ${day.events} סימונים`}>
                      <div style={{
                        width: "100%", height: h, borderRadius: 4,
                        background: day.visits ? "var(--work)" : "var(--line)",
                        opacity: day.visits ? 0.85 : 1,
                      }} />
                      <span className="mono" style={{ fontSize: 9, color: day.events ? "var(--go)" : "var(--dim)" }}>
                        {day.events ? "•" : HE_SHORT[wd]}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mono" style={{ fontSize: 10, color: "var(--dim)", marginTop: 12, lineHeight: 1.8 }}>
                נראה לאחרונה: {ago(r.lastSeen)}<br />
                סימון אחרון: {ago(r.lastAction)}
              </div>

              <Link href={`/usage/${r.profile.id}?d=${days}`} className="btn"
                style={{ textDecoration: "none", display: "inline-block", marginTop: 14 }}>
                מה בדיוק הוא סימן ←
              </Link>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Stat({ n, label, strong, highlight }: {
  n: number | string; label: string; strong?: boolean; highlight?: boolean;
}) {
  return (
    <div>
      <div className="mono" style={{
        fontSize: strong ? 26 : 20,
        color: strong ? "var(--work)" : highlight ? "var(--go)" : "var(--bone)",
      }}>{n}</div>
      <div style={{ fontSize: 11, color: "var(--steel)", marginTop: 3 }}>{label}</div>
    </div>
  );
}
