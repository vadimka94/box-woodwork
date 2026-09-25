import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { getInstallation, days } from "@/lib/schedule";
import { t as tr, type Lang } from "@/lib/i18n";
import { both, toRussian } from "@/lib/tv-text";
import { InstallCrew, InstallStatus } from "@/components/InstallForm";

/** Everything the crew needs before they get in the van. */
export default async function InstallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = (await currentUser())!;
  const lang = (me.lang ?? "he") as Lang;
  const install = await getInstallation(id);
  if (!install) notFound();

  const p = install.project;
  const d = new Date(install.scheduled_date + "T00:00:00");
  const address = install.address || [p?.city].filter(Boolean).join(" ");
  const maps = address ? `https://waze.com/ul?q=${encodeURIComponent(address)}` : null;
  const released = install.items.filter((i: any) => i.gate_release_ok).length;

  /* the factory screen shows every label in Hebrew and Russian, and free text with a Russian line */
  const tv = me.role === "display";
  const t = (s: string, l: Lang) => (tv ? both(s) : tr(s, l));
  const [ruName, ruNote, ...ruItems] = tv
    ? await toRussian([p?.name, install.note, ...install.items.map((i: any) => i.name)])
    : [];
  const Ru = ({ text, size = 15 }: { text?: string | null; size?: number }) =>
    tv && text ? <div style={{ color: "#2F5D8C", fontSize: size, marginTop: 4 }} dir="ltr">{text}</div> : null;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <div className="mono" style={{ fontSize: 14, color: "var(--bronze-lt)", letterSpacing: ".14em" }}>
            {days(lang)[d.getDay()]}{tv ? ` · ${days("ru" as Lang)[d.getDay()]}` : ""} · {install.scheduled_date}
            {install.start_time ? ` · ${t("יציאה", lang)} ${install.start_time.slice(0, 5)}` : ""}
          </div>
          <h1 style={{ marginBottom: 8 }}>{p?.name}</h1>
          <Ru text={ruName} size={22} />
          <div style={{ fontSize: 15, color: "var(--steel)" }}>{p?.code} · {t("התקנה אצל הלקוח", lang)}</div>
        </div>
        {!tv && <Link className="btn" href="/schedule" style={{ textDecoration: "none" }}>← {t("ללוח ההתקנות", lang)}</Link>}
      </div>

      {/* contact block — the two things you actually need on the road */}
      <div className="panel" style={{ marginTop: 22 }}>
        <h4 className="mono">{t("איש קשר ומיקום", lang)}</h4>

        <Row label={t("לקוח", lang)} value={p?.client_name} />

        {p?.client_phone && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderBottom: "1px solid var(--line-soft)", flexWrap: "wrap" }}>
            <span style={{ minWidth: 90, fontSize: 13, color: "var(--steel)" }}>{t("טלפון", lang)}</span>
            <span style={{ flex: 1, fontSize: 16 }}>{p.client_phone}</span>
            <a className="btn" href={`tel:${p.client_phone}`} style={{ textDecoration: "none" }}>{t("חייג", lang)}</a>
            <a className="btn" href={`https://wa.me/972${String(p.client_phone).replace(/\D/g, "").replace(/^0/, "")}`}
               target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>{t("וואטסאפ", lang)}</a>
          </div>
        )}

        {address && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", flexWrap: "wrap" }}>
            <span style={{ minWidth: 90, fontSize: 13, color: "var(--steel)" }}>{t("כתובת", lang)}</span>
            <span style={{ flex: 1, fontSize: 16 }}>{address}</span>
            {maps && (
              <a className="btn btn-primary" href={maps} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                {t("נווט ב-Waze", lang)}
              </a>
            )}
          </div>
        )}
      </div>

      {install.note && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h4 className="mono">{t("הערות לצוות", lang)}</h4>
          <div style={{ fontSize: 15, lineHeight: 1.85 }}>{install.note}</div>
          <Ru text={ruNote} />
        </div>
      )}

      <div className="panel" style={{ marginTop: 16 }}>
        <h4 className="mono">{t("מה מתקינים", lang)}</h4>
        {install.items.length === 0 && (
          <div style={{ fontSize: 14, color: "var(--steel)" }}>{t("אין פריטים בפרויקט.", lang)}</div>
        )}
        {install.items.map((i: any, n: number) => (
          <div key={i.id} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "12px 0",
            borderBottom: "1px solid var(--line-soft)", flexWrap: "wrap",
          }}>
            <span style={{ flex: 1, minWidth: 140, fontSize: 15 }}>
              {i.name}
              <Ru text={ruItems[n]} size={14} />
            </span>
            {i.qty > 1 && <span className="mono" style={{ fontSize: 11, color: "var(--dim)" }}>{i.qty} {t("יח׳", lang)}</span>}
            {i.gate_release_ok
              ? <span className="chip go">{t("שוחרר ליציאה", lang)}</span>
              : <span className="chip gold">🔒 {t("טרם שוחרר", lang)}</span>}
          </div>
        ))}

        {install.items.length > 0 && released < install.items.length && (
          <div className="lockbar" style={{ marginTop: 14 }}>
            {install.items.length - released} {t("פריטים עוד לא עברו את הבקרה לפני אריזה.", lang)}
          </div>
        )}

        {p?.code && (
          <Link className="btn" href={`/projects/${p.code}/plans`}
            style={{ textDecoration: "none", display: "inline-block", marginTop: 14 }}>
            {t("תוכניות מאושרות", lang)} {p.current_rev ? `· ${p.current_rev}` : ""}
          </Link>
        )}
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h4 className="mono">{t("מי יוצא", lang)}</h4>
        {me.role === "admin"
          ? <InstallCrew installationId={install.id} profiles={install.allProfiles as any}
                         current={install.crew.map((c) => c.id)} />
          : <div style={{ fontSize: 15 }}>{install.crew.map((c) => c.full_name).join(" · ") || t("טרם שויך צוות", lang)}</div>}
      </div>

      {me.role === "admin" && (
        <div style={{ marginTop: 16 }}>
          <InstallStatus installationId={install.id} status={install.status} />
        </div>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderBottom: "1px solid var(--line-soft)" }}>
      <span style={{ minWidth: 90, fontSize: 13, color: "var(--steel)" }}>{label}</span>
      <span style={{ flex: 1, fontSize: 16 }}>{value}</span>
    </div>
  );
}
