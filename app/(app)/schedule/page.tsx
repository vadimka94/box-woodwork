import Link from "next/link";
import { currentUser, createClient } from "@/lib/supabase/server";
import { getInstallations, monthGrid, isoDay, months, days, isOtherJob, jobTitle, jobWhere } from "@/lib/schedule";
import { t, type Lang } from "@/lib/i18n";
import { NewInstallation, InstallCrew } from "@/components/InstallForm";

export default async function SchedulePage({
  searchParams,
}: { searchParams: Promise<{ m?: string; y?: string }> }) {
  const me = (await currentUser())!;
  const lang = (me.lang ?? "he") as Lang;
  const sp = await searchParams;
  const today = new Date();
  const year = Number(sp.y ?? today.getFullYear());
  const month = Number(sp.m ?? today.getMonth());

  const grid = monthGrid(year, month);
  const installs = await getInstallations(
    isoDay(grid[0]), isoDay(grid[grid.length - 1]),
    me.role === "admin" ? undefined : me.id
  );

  const supabase = await createClient();
  const [{ data: projects }, { data: profiles }] = await Promise.all([
    supabase.from("projects").select("id, code, name, client_name, city")
      .eq("status", "active").order("due_date"),
    supabase.from("profiles").select("id, full_name, role").eq("active", true),
  ]);

  const prev = month === 0 ? { m: 11, y: year - 1 } : { m: month - 1, y: year };
  const next = month === 11 ? { m: 0, y: year + 1 } : { m: month + 1, y: year };
  const byDay = (iso: string) => installs.filter((i) => i.scheduled_date === iso);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ marginBottom: 0 }}>{t("לוח התקנות", lang)}</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link className="btn" href={`/schedule?m=${prev.m}&y=${prev.y}`}>→</Link>
          <span className="mono" style={{ minWidth: 130, textAlign: "center", fontSize: 14 }}>
            {months(lang)[month]} {year}
          </span>
          <Link className="btn" href={`/schedule?m=${next.m}&y=${next.y}`}>←</Link>
        </div>
      </div>

      {me.role === "admin" && (
        <div style={{ marginTop: 20 }}>
          <NewInstallation projects={projects ?? []} profiles={profiles ?? []} />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, marginTop: 24 }}>
        {days(lang).map((d) => (
          <div key={d} className="mono" style={{ fontSize: 11, color: "var(--steel)", textAlign: "center", padding: "6px 0" }}>
            {d}
          </div>
        ))}

        {grid.map((d) => {
          const iso = isoDay(d);
          const dayInstalls = byDay(iso);
          const inMonth = d.getMonth() === month;
          const isToday = iso === isoDay(today);
          const busy = dayInstalls.length > 0;

          return (
            <div key={iso} style={{
              minHeight: 96, borderRadius: 12, padding: 8,
              border: `1px solid ${busy ? "rgba(224,138,60,.6)" : isToday ? "var(--bronze)" : "var(--line)"}`,
              background: busy
                ? "linear-gradient(180deg,rgba(224,138,60,.16),rgba(255,255,255,.6))"
                : "#FFFFFF",
              opacity: inMonth ? 1 : 0.35,
            }}>
              <div className="mono" style={{
                fontSize: 12, marginBottom: 6,
                color: busy ? "#93540F" : isToday ? "var(--bronze-lt)" : "var(--dim)",
              }}>
                {d.getDate()}
              </div>

              {dayInstalls.map((i) => (
                <Link key={i.id} href={`/schedule/${i.id}`}
                  style={{ display: "block", textDecoration: "none", marginBottom: 5 }}>
                  <div style={{
                    fontSize: 12, lineHeight: 1.4, padding: "6px 8px", borderRadius: 8,
                    background: "rgba(224,138,60,.18)", border: "1px solid rgba(224,138,60,.35)",
                  }}>
                    <div style={{ color: "#93540F" }}>
                      {i.start_time ? i.start_time.slice(0, 5) + " · " : ""}{jobTitle(i)}
                    </div>
                    <div className="mono" style={{ fontSize: 10, color: "var(--steel)", marginTop: 3 }}>
                      {isOtherJob(i) ? "אחר · " : ""}{jobWhere(i)}
                      {" · "}{i.crew?.map((c) => c.full_name).join(", ") || t("טרם שויך צוות", lang)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          );
        })}
      </div>

      <div className="mono" style={{ margin: "26px 0 12px", fontSize: 13, color: "var(--steel)", letterSpacing: ".12em" }}>
        {t(me.role === "admin" ? "כל ההתקנות בחודש" : "ההתקנות שלך", lang)}
      </div>

      {installs.length === 0 && (
        <div className="panel" style={{ textAlign: "center", padding: 34, color: "var(--steel)" }}>
          {t("אין התקנות מתוכננות בחודש הזה.", lang)}
        </div>
      )}

      {installs.map((i) => (
        <div className="panel" key={i.id} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div className="mono" style={{ fontSize: 12, color: "var(--bronze-lt)" }}>
                {i.scheduled_date} {i.start_time ? `· ${i.start_time.slice(0, 5)}` : ""}
              </div>
              <div style={{ fontFamily: "var(--display)", fontSize: 20, margin: "8px 0 4px" }}>
                {jobTitle(i)}
                {isOtherJob(i) && <span className="chip" style={{ marginInlineStart: 10 }}>אחר</span>}
              </div>
              <div style={{ fontSize: 13, color: "var(--steel)" }}>
                {[i.project?.client_name, jobWhere(i)].filter(Boolean).join(" · ") || "—"}
              </div>
              {i.note && <div style={{ fontSize: 13, marginTop: 10, color: "#3A3E45" }}>{i.note}</div>}
            </div>
            <Link className="btn btn-primary" href={`/schedule/${i.id}`} style={{ textDecoration: "none" }}>
              {t("פרטי ההתקנה ←", lang)}
            </Link>
          </div>

          <div style={{ marginTop: 14 }}>
            {me.role === "admin"
              ? <InstallCrew installationId={i.id} profiles={profiles ?? []} current={i.crew?.map((c) => c.id) ?? []} />
              : <div className="mono" style={{ fontSize: 12, color: "var(--steel)" }}>
                  {t("מי יוצא", lang)}: {i.crew?.map((c) => c.full_name).join(" · ") || "—"}
                </div>}
          </div>
        </div>
      ))}
    </>
  );
}
