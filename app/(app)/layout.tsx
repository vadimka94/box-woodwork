import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, currentUser } from "@/lib/supabase/server";
import { t, type Lang } from "@/lib/i18n";
import { Realtime } from "@/components/Realtime";
import { Presence } from "@/components/Presence";
import { BackToTv } from "@/components/BackToTv";

const NAV = [
  { href: "/",         label: "לוח בקרה",    roles: ["admin"] },
  { href: "/crm",      label: "לקוחות ומכירות", roles: ["admin"] },
  { href: "/tasks",    label: "המשימות שלי", roles: ["admin", "cnc", "worker"] },
  { href: "/projects", label: "פרויקטים",    roles: ["admin", "cnc", "worker"] },
  { href: "/schedule", label: "לוח התקנות",  roles: ["admin", "cnc", "worker"] },
  { href: "/extras",   label: "חוסרים ותוספות", roles: ["admin", "cnc", "worker"] },
  { href: "/team",     label: "עובדים",      roles: ["admin"] },
  { href: "/rules",    label: "הגדרות שיוך", roles: ["admin"] },
  { href: "/usage",    label: "מעקב שימוש",  roles: ["admin"] },
  { href: "/tv",       label: "מסך מפעל",    roles: ["admin"] },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await currentUser();
  if (!me) redirect("/login");
  
  const lang = (me.lang ?? "he") as Lang;

  /* The badge used to pull every block, project, item and stage on every
     single page load. A count query asks the database for one number. */
  let attention = 0;
  if (me.role === "admin") {
    const supabase = await createClient();
    const { count } = await supabase
      .from("blocks").select("*", { count: "exact", head: true }).is("resolved_at", null);
    attention = count ?? 0;
  }

  /* The factory screen: no menu and no exit button — a tap in the wrong place
     on the TV used to log it out. Pages opened from it get a big way back,
     and return by themselves after a while. */
  if (me.role === "display") {
    return (
      <div style={{ minHeight: "100dvh" }}>
        <BackToTv seconds={90} />
        <main>{children}</main>
        <Realtime />
      </div>
    );
  }

  return (
    <div className="shell">
      <main>{children}</main>

      <nav className="side">
        <div style={{ padding: "0 22px 22px", fontFamily: "var(--display)", fontWeight: 700, fontSize: 19 }}>
          BOX <span style={{ color: "var(--bronze)" }}>WOODWORK</span>
        </div>

        {NAV.filter((n) => n.roles.includes(me.role)).map((n) => (
          <Link key={n.href} href={n.href} className="nav-item" prefetch>
            {t(n.label, lang)}
            {n.href === "/" && attention > 0 && (
              <span style={{
                float: "inline-end", fontFamily: "var(--mono)", fontSize: 10,
                background: "var(--stop)", color: "#fff", borderRadius: 99, padding: "2px 8px",
              }}>{attention}</span>
            )}
          </Link>
        ))}

        <div style={{ flex: 1 }} />
        <div style={{ padding: "18px 22px 0", borderTop: "1px solid var(--line-soft)" }}>
          <div style={{ fontSize: 14 }}>{me.full_name}</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--dim)", marginTop: 4 }}>
            {me.title?.[0]}
          </div>
          <form action="/auth/signout" method="post">
            <button className="nav-item" style={{ marginTop: 10, padding: 0, background: "none" }}>
              {t("יציאה", lang)} →
            </button>
          </form>
        </div>
      </nav>

      <Realtime />
      <Presence profileId={me.id} />
    </div>
  );
}
