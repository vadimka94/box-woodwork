import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser, createClient } from "@/lib/supabase/server";
import { myStages } from "@/lib/queries";
import { getInstallations, isoDay } from "@/lib/schedule";
import { getExtras } from "@/lib/extras";
import { StageActions } from "@/components/StageActions";
import { STATUS_LABEL, t, type Lang } from "@/lib/i18n";
import { colorOf, stageLock } from "@/lib/types";

/**
 * "View as" — an admin sees exactly the screen a worker sees, and can act on
 * it. This is not a login as that person: every action is still recorded under
 * the admin's own name, which is the honest way to do it. Nobody should be
 * able to make it look like Dimitri marked something he never touched.
 */
export default async function ViewAsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await currentUser();
  if (!me || me.role !== "admin") redirect("/tasks");

  const supabase = await createClient();
  const { data: worker } = await supabase
    .from("profiles").select("*").eq("id", id).maybeSingle();
  if (!worker) notFound();

  const lang = (me.lang ?? "he") as Lang;
  const stages = await myStages(worker.id);

  const from = new Date(); const to = new Date(); to.setDate(to.getDate() + 30);
  const [installs, extras] = await Promise.all([
    getInstallations(isoDay(from), isoDay(to), worker.id),
    getExtras({ forProfile: worker.id, openOnly: true }),
  ]);

  return (
    <>
      <div style={{
        display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap",
        alignItems: "center", padding: "14px 18px", borderRadius: 12, marginBottom: 20,
        background: "rgba(201,146,79,.12)", border: "1px dashed rgba(201,146,79,.45)",
      }}>
        <div style={{ fontSize: 14, color: "var(--bronze-lt)", lineHeight: 1.6 }}>
          אתה צופה במסך של <b style={{ fontWeight: 500 }}>{worker.full_name}</b>.
          כל פעולה שתעשה כאן תירשם על שמך, לא על שמו.
        </div>
        <Link className="btn" href="/team" style={{ textDecoration: "none" }}>← לעובדים</Link>
      </div>

      <h1 style={{ marginBottom: 8 }}>{worker.full_name}</h1>
      <div style={{ color: "var(--steel)", fontSize: 14, marginBottom: 24 }}>
        {(worker.title ?? []).join(" · ")} · {stages.length} שלבים פתוחים
      </div>

      {installs.length > 0 && (
        <>
          <div className="mono" style={{ fontSize: 13, color: "var(--steel)", margin: "0 0 12px", letterSpacing: ".12em" }}>
            התקנות קרובות
          </div>
          {installs.map((i: any) => (
            <div className="panel" key={i.id} style={{ marginBottom: 12, borderColor: "rgba(224,138,60,.5)" }}>
              <div className="mono" style={{ fontSize: 12, color: "#93540F" }}>
                {i.scheduled_date} {i.start_time ? `· ${i.start_time.slice(0, 5)}` : ""}
              </div>
              <div style={{ fontFamily: "var(--display)", fontSize: 19, margin: "8px 0 4px" }}>{i.project?.name}</div>
              <div style={{ fontSize: 13, color: "var(--steel)" }}>{i.address ?? i.project?.city}</div>
            </div>
          ))}
        </>
      )}

      {extras.length > 0 && (
        <>
          <div className="mono" style={{ fontSize: 13, color: "var(--steel)", margin: "22px 0 12px", letterSpacing: ".12em" }}>
            חוסרים ותוספות על שמו
          </div>
          {extras.map((e: any) => (
            <div className="panel" key={e.id} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 17 }}>{e.title}</div>
              <div style={{ fontSize: 13, color: "var(--steel)", marginTop: 6 }}>
                {e.project?.code} · {e.project?.name}
              </div>
            </div>
          ))}
        </>
      )}

      <div className="mono" style={{ fontSize: 13, color: "var(--steel)", margin: "22px 0 12px", letterSpacing: ".12em" }}>
        השלבים שלו
      </div>

      {stages.length === 0 && (
        <div className="panel" style={{ textAlign: "center", padding: 34, color: "var(--steel)" }}>
          אין שלבים פתוחים.
        </div>
      )}

      {stages.map((s: any) => {
        const lock = stageLock(s.project, s.item, s);
        return (
          <div className="panel" key={s.id} style={{ marginBottom: 15, borderColor: colorOf(s.status) }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <span className="mono" style={{ fontSize: 11, color: "var(--bronze)", letterSpacing: ".14em" }}>
                {s.project.code} · {s.project.client_name}
              </span>
              <span className="chip">{t(STATUS_LABEL[s.status], lang)}</span>
            </div>
            <div className="chip gold" style={{ marginTop: 14 }}>{t(s.name, lang)}</div>
            <div style={{ fontSize: 20, margin: "12px 0 6px" }}>{s.item?.name ?? s.project.name}</div>
            <div style={{ marginTop: 16 }}>
              <StageActions stageId={s.id} status={s.status} lang={lang} locked={lock} />
            </div>
          </div>
        );
      })}
    </>
  );
}
