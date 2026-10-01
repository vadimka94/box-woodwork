import Link from "next/link";
import { currentUser } from "@/lib/supabase/server";
import { myStages } from "@/lib/queries";
import { getInstallations, isoDay, isPrepJob } from "@/lib/schedule";
import { getExtras } from "@/lib/extras";
import { ROUTE_LABEL } from "@/lib/extra-labels";
import { ExtraActions } from "@/components/ExtraForm";
import { StageActions } from "@/components/StageActions";
import { STATUS_LABEL, t, type Lang } from "@/lib/i18n";
import { colorOf, stageLock } from "@/lib/types";

/** What Dimitri and Sasha see on the phone. Big buttons, no dashboard. */
export default async function TasksPage() {
  const me = (await currentUser())!;
  const lang = (me.lang ?? "he") as Lang;
  const stages = await myStages(me.id);

  const from = new Date(); const to = new Date(); to.setDate(to.getDate() + 30);
  const [installs, extras] = await Promise.all([
    getInstallations(isoDay(from), isoDay(to), me.id),
    getExtras({ forProfile: me.id, openOnly: true, includeGeneral: true }),
  ]);

  const greet = () => {
    const h = new Date().getHours();
    if (lang === "ru") return h < 12 ? "Доброе утро" : h < 17 ? "Добрый день" : "Добрый вечер";
    return h < 12 ? "בוקר טוב" : h < 17 ? "צהריים טובים" : "ערב טוב";
  };

  return (
    <>
      <div className="panel" style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: "var(--display)", fontSize: 27 }}>{greet()}, {me.full_name}</div>
        <div style={{ marginTop: 9, fontSize: 14, color: "var(--steel)" }}>
          {stages.length
            ? `${stages.length} ${lang === "ru" ? "этапов на вас" : "שלבים על השם שלך"}`
            : t("אין שלבים משויכים אליך כרגע", lang)}
        </div>
      </div>

      {installs.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div className="mono" style={{ fontSize: 13, color: "#93540F", letterSpacing: ".12em", marginBottom: 10 }}>
            {lang === "ru" ? "БЛИЖАЙШИЕ МОНТАЖИ" : "התקנות קרובות"}
          </div>
          {installs.map((i: any) => (
            <Link href={`/schedule/${i.id}`} className="panel" key={i.id}
              style={{ display: "block", marginBottom: 10, borderColor: "rgba(224,138,60,.55)", textDecoration: "none" }}>
              <div className="mono" style={{ fontSize: 14, color: "#93540F" }}>
                {i.scheduled_date}{i.start_time ? ` · ${i.start_time.slice(0, 5)}` : ""}
              </div>
              {isPrepJob(i) && (
                <span className="chip gold" style={{ marginTop: 8, display: "inline-block" }}>
                  {t("עבודת הכנה בשטח", lang)}
                </span>
              )}
              <div style={{ fontSize: 20, margin: "10px 0 6px" }}>{i.project?.name}</div>
              <div style={{ fontSize: 14, color: "var(--steel)" }}>
                {i.project?.client_name} · {i.address ?? i.project?.city}
              </div>
              {i.crew?.length > 1 && (
                <div className="mono" style={{ fontSize: 11, color: "var(--dim)", marginTop: 8 }}>
                  {lang === "ru" ? "Бригада" : "צוות"}: {i.crew.map((c: any) => c.full_name).join(" · ")}
                </div>
              )}
              {i.note && (
                <div style={{
                  marginTop: 12, padding: "12px 14px", borderRadius: 12, fontSize: 13, lineHeight: 1.7,
                  background: "rgba(224,138,60,.1)", borderInlineStart: "3px solid var(--work)",
                }}>{i.note}</div>
              )}
              <div className="mono" style={{ fontSize: 11, color: "var(--bronze-lt)", marginTop: 12 }}>
                {lang === "ru" ? "Открыть детали →" : "פרטי ההתקנה, טלפון וניווט ←"}
              </div>
            </Link>
          ))}
        </div>
      )}

      {extras.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div className="mono" style={{ fontSize: 13, color: "var(--stop)", letterSpacing: ".12em", marginBottom: 10 }}>
            {lang === "ru" ? "НЕДОСТАЧИ И ДОПОЛНЕНИЯ" : "חוסרים ותוספות"}
          </div>
          {extras.map((e: any) => (
            <div className="panel" key={e.id} style={{ marginBottom: 10 }}>
              {!e.assigned_to && (
                <span className="chip" style={{ borderColor: "var(--work)", color: "var(--work)", marginBottom: 8, display: "inline-block" }}>
                  {t("כללי — מחכה שמישהו ייקח", lang)}
                </span>
              )}
              <div style={{ fontSize: 18 }}>{e.title}</div>
              <div style={{ fontSize: 13, color: "var(--steel)", marginTop: 6 }}>
                {e.project?.name ?? t("כללי — ללא פרויקט", lang)} · {t(ROUTE_LABEL[e.route], lang)}
              </div>
              {e.description && (
                <div style={{
                  marginTop: 10, padding: "12px 14px", borderRadius: 12, fontSize: 13, lineHeight: 1.7,
                  background: "rgba(0,0,0,.035)", borderInlineStart: "3px solid var(--stop)",
                }}>
                  {e.description}
                  {e.description_tr?.[lang] && (
                    <div style={{ marginTop: 8, color: "#2F5D8C" }}>{e.description_tr[lang]}</div>
                  )}
                </div>
              )}
              <div style={{ marginTop: 12 }}>
                <ExtraActions extraId={e.id} status={e.status} lang={lang}
                  general={!e.assigned_to} canCancel={false} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
        {stages.map((s: any) => {
          const lock = stageLock(s.project, s.item, s);
          const note = s.item?.note ?? s.project?.production_note;
          const noteTr = (s.item?.note_tr ?? s.project?.note_tr ?? {})[lang];
          return (
            <div className="panel" key={s.id} style={{ borderColor: colorOf(s.status) }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <span className="mono" style={{ fontSize: 11, color: "var(--bronze)", letterSpacing: ".14em" }}>
                  {s.project.code} · {s.project.client_name}
                </span>
                <span className={`chip ${s.status === "stop" ? "stop" : s.status === "work" ? "work" : ""}`}>
                  {t(STATUS_LABEL[s.status], lang)}
                </span>
              </div>

              <div className="chip gold" style={{ marginTop: 14 }}>{t(s.name, lang)}</div>
              <div style={{ fontSize: 22, margin: "12px 0 6px" }}>{s.item?.name ?? s.project.name}</div>
              <div style={{ fontSize: 14, color: "var(--steel)" }}>
                {s.project.name} · {s.project.city} · {t("יעד", lang)} {s.project.due_date ?? "—"}
              </div>

              {note && (
                <div style={{
                  marginTop: 15, padding: "13px 15px", borderRadius: 12, fontSize: 13, lineHeight: 1.75,
                  background: "rgba(0,0,0,.035)", borderInlineStart: "3px solid var(--bronze)",
                }}>
                  {note}
                  {noteTr && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line-soft)", color: "#2F5D8C" }}>
                      {noteTr}
                    </div>
                  )}
                </div>
              )}

              {!!s.item?.photos?.length && (
                <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 14 }}>
                  <span className="mono" style={{ width: "100%", fontSize: 10, color: "var(--dim)" }}>
                    {t("מידות מהשטח", lang)}
                  </span>
                  {s.item.photos.map((p: any) => p.url && (
                    <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                      <img alt="" width={92} height={92} src={p.url}
                        style={{ borderRadius: 12, objectFit: "cover", border: "1px solid var(--line)" }} />
                    </a>
                  ))}
                </div>
              )}

              <Link href={`/projects/${s.project.code}/plans`} className="btn"
                style={{ textDecoration: "none", display: "inline-block", marginTop: 18 }}>
                {t("תוכניות מאושרות", lang)}
              </Link>

              <div style={{ marginTop: 12 }}>
                <StageActions stageId={s.id} status={s.status} lang={lang} locked={lock} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
