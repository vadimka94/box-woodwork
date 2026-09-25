import Link from "next/link";
import { currentUser, createClient } from "@/lib/supabase/server";
import { getExtras } from "@/lib/extras";
import { SOURCE_LABEL, ROUTE_LABEL, EXTRA_STATUS_LABEL, EXTRA_STATUS_COLOR, GENERAL_ASSIGNEE_LABEL } from "@/lib/extra-labels";
import { t as tr, type Lang } from "@/lib/i18n";
import { both, toRussian } from "@/lib/tv-text";
import { ExtraForm, ExtraActions, RoutePicker } from "@/components/ExtraForm";
import { Bilingual } from "@/components/Bilingual";

/** Everything the shop still owes on jobs that already left the building. */
export default async function ExtrasPage() {
  const me = (await currentUser())!;
  const lang = (me.lang ?? "he") as Lang;
  const supabase = await createClient();

  const [{ data: projects }, { data: profiles }] = await Promise.all([
    supabase.from("projects").select("id, code, name, client_name").neq("status", "draft").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, role").eq("active", true),
  ]);

  /* The factory screen: read-only, every open item, Hebrew and Russian side by side. */
  if (me.role === "display") return <TvExtras />;

  const t = tr;
  /* Workers see their own items plus every "כללי" item nobody has taken yet. */
  const extras = await getExtras(me.role === "admin" ? {} : { forProfile: me.id, includeGeneral: true });
  const open = extras.filter((e: any) => e.status === "open" || e.status === "work");
  const closed = extras.filter((e: any) =>
    (e.status === "done" || e.status === "cancelled") && (me.role === "admin" || e.assigned_to === me.id));

  return (
    <>
      <h1>{t("חוסרים ותוספות", lang)}</h1>
      <div style={{ color: "var(--steel)", fontSize: 14, marginTop: -14, marginBottom: 22, lineHeight: 1.7, maxWidth: 640 }}>
        {lang === "ru"
          ? "То, что обнаружилось на объекте: сломанная деталь, просьба клиента, недостача. Каждое сообщение уходит в маршрут изготовления — файл ЧПУ у Лиора или вручную на пиле."
          : "מה שהתגלה בשטח — חלק שנשבר, מדף שהלקוח ביקש, משהו שלא הגיע. כל דיווח נשלח למסלול ייצור: קובץ CNC אצל ליאור, או ידני במסור."}
      </div>

      <ExtraForm projects={projects ?? []} profiles={profiles ?? []} lang={lang} />

      <div className="mono" style={{ margin: "26px 0 12px", fontSize: 13, color: "var(--steel)", letterSpacing: ".12em" }}>
        {t("פתוחים", lang)} · {open.length}
      </div>

      {open.length === 0 && (
        <div className="panel" style={{ textAlign: "center", padding: 34, color: "var(--steel)" }}>
          {t("אין חוסרים פתוחים.", lang)}
        </div>
      )}

      {open.map((e: any) => <Card key={e.id} e={e} me={me} lang={lang} profiles={profiles ?? []} />)}

      {closed.length > 0 && (
        <>
          <div className="mono" style={{ margin: "30px 0 12px", fontSize: 13, color: "var(--dim)", letterSpacing: ".12em" }}>
            {t("סגורים", lang)} · {closed.length}
          </div>
          {closed.map((e: any) => <Card key={e.id} e={e} me={me} lang={lang} profiles={profiles ?? []} closed />)}
        </>
      )}
    </>
  );
}

async function TvExtras() {
  const extras = (await getExtras({ openOnly: true }));
  const ru = await toRussian(extras.map((e: any) => e.title));
  const t = (s: string) => both(s);

  return (
    <>
      <h1>{t("חוסרים ותוספות")}</h1>
      {extras.length === 0 && (
        <div className="panel" style={{ textAlign: "center", padding: 34, color: "var(--steel)" }}>
          {t("אין חוסרים פתוחים.")}
        </div>
      )}
      {extras.map((e: any, n: number) => {
        const color = EXTRA_STATUS_COLOR[e.status];
        return (
          <div key={e.id} id={e.id} className="panel" style={{ marginBottom: 12, borderColor: color }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span className="chip" style={{ borderColor: color, color }}>{t(EXTRA_STATUS_LABEL[e.status])}</span>
              <span className="chip">{t(SOURCE_LABEL[e.source])}</span>
              <span className="chip gold">{t(ROUTE_LABEL[e.route])}</span>
              {e.qty > 1 && <span className="mono" style={{ fontSize: 13 }}>{e.qty} {t("יח׳")}</span>}
            </div>
            <div style={{ fontSize: 24, margin: "12px 0 2px" }}>{e.title}</div>
            {ru[n] && <div dir="ltr" style={{ fontSize: 20, color: "#2F5D8C", textAlign: "end" }}>{ru[n]}</div>}
            <div style={{ fontSize: 15, color: "var(--steel)", marginTop: 6 }}>
              {e.project ? `${e.project.code} · ${e.project.name}` : t("כללי — ללא פרויקט")}
              {" · "}{e.assignee?.full_name ?? t(GENERAL_ASSIGNEE_LABEL)}
            </div>
            {e.description && (
              <div style={{
                marginTop: 12, padding: "13px 15px", borderRadius: 12, fontSize: 16, lineHeight: 1.75,
                background: "rgba(0,0,0,.04)", borderInlineStart: `3px solid ${color}`,
              }}>
                <div>{e.description}</div>
                {(e.description_tr?.ru || e.description_tr?.he) && (
                  <div style={{ marginTop: 9, paddingTop: 9, borderTop: "1px solid var(--line-soft)", color: "#2F5D8C" }}>
                    {e.description_lang === "ru" ? e.description_tr?.he : e.description_tr?.ru}
                  </div>
                )}
              </div>
            )}
            {!!e.photos?.length && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                {e.photos.map((p: any) => p.url && (
                  <img key={p.id} src={p.url} alt="" width={140} height={140}
                    style={{ borderRadius: 10, objectFit: "cover", border: "1px solid var(--line)" }} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function Card({ e, me, lang, profiles, closed }: any) {
  const t = tr;
  const color = EXTRA_STATUS_COLOR[e.status];
  const mine = e.assigned_to === me.id;
  const general = !e.assigned_to;

  return (
    <div id={e.id} className="panel" style={{ marginBottom: 12, borderColor: closed ? "var(--line)" : color, opacity: closed ? 0.6 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span className="chip" style={{ borderColor: color, color }}>{t(EXTRA_STATUS_LABEL[e.status], lang)}</span>
            <span className="chip">{t(SOURCE_LABEL[e.source], lang)}</span>
            <span className="chip gold">{t(ROUTE_LABEL[e.route], lang)}</span>
            {general && !closed && (
              <span className="chip" style={{ borderColor: "var(--work)", color: "var(--work)" }}>
                {t("כללי — מחכה שמישהו ייקח", lang)}
              </span>
            )}
            {e.qty > 1 && <span className="mono" style={{ fontSize: 11, color: "var(--dim)" }}>{e.qty} יח׳</span>}
          </div>

          <div style={{ fontSize: 19, margin: "12px 0 6px" }}>{e.title}</div>
          <div style={{ fontSize: 13, color: "var(--steel)" }}>
            {e.project
              ? <>{e.project.code} · {e.project.name}{e.item ? ` · ${e.item.name}` : ""}</>
              : <span className="chip">{t("כללי — ללא פרויקט", lang)}</span>}
          </div>

          <Bilingual text={e.description} tr={e.description_tr}
                     lang={lang} role={me.role} tone={color} />

          {!!e.photos?.length && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              {e.photos.map((p: any) => p.url && (
                <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                  <img src={p.url} alt="" width={88} height={88}
                    style={{ borderRadius: 10, objectFit: "cover", border: "1px solid var(--line)" }} />
                </a>
              ))}
            </div>
          )}

          <div className="mono" style={{ fontSize: 10, color: "var(--dim)", marginTop: 12 }}>
            {e.reporter?.full_name ?? "—"} · {e.assignee?.full_name ?? t(GENERAL_ASSIGNEE_LABEL, lang)}
          </div>
        </div>

        {e.project && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
            <Link className="btn" href={`/projects/${e.project.code}`} style={{ textDecoration: "none" }}>
              {t("לפרויקט", lang)}
            </Link>
          </div>
        )}
      </div>

      {!closed && (me.role === "admin" || mine || general) && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {me.role === "admin" && (
            <RoutePicker extraId={e.id} route={e.route} assignedTo={e.assigned_to} profiles={profiles} lang={lang} />
          )}
          <ExtraActions extraId={e.id} status={e.status} lang={lang}
            general={general} canCancel={me.role === "admin" || mine} />
        </div>
      )}
    </div>
  );
}
