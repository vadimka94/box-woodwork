import { redirect } from "next/navigation";
import { createClient, currentUser } from "@/lib/supabase/server";
import { CrmTabs } from "@/components/CrmTabs";
import { SiteLeads } from "@/components/SiteLeads";
import { Realtime } from "@/components/Realtime";
import { fmtDateTime } from "@/lib/crm";

/**
 * פניות שהגיעו מהטופס באתר וממתינות להכרעה.
 *
 * הן לא נכנסות ללוח העסקאות מעצמן: טופס פתוח באינטרנט מקבל גם בוטים,
 * וצינור מכירות שמתמלא זבל מפסיק להיות כלי עבודה.
 */
export default async function SiteLeadsInbox() {
  const me = await currentUser();
  if (!me || me.role !== "admin") redirect("/tasks");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_leads")
    .select("id, name, phone, city, style, request, landed_on, created_at, status, handled_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return (
      <>
        <CrmTabs active="inbox" />
        <h1>פניות מהאתר</h1>
        <div className="panel lockbar">
          הטבלה <span className="mono">site_leads</span> עוד לא קיימת בדאטהבייס.
          צריך להריץ פעם אחת את <span className="mono">017_site_leads.sql</span> ב-SQL Editor של סופאבייס.
        </div>
      </>
    );
  }

  const rows = data ?? [];
  const waiting = rows.filter((r) => r.status === "new");
  const handled = rows.filter((r) => r.status !== "new").slice(0, 20);

  return (
    <>
      <Realtime tables={["site_leads"]} />
      <CrmTabs active="inbox" />
      <h1>פניות מהאתר</h1>

      {waiting.length === 0 && (
        <div className="panel" style={{ textAlign: "center", color: "var(--steel)", padding: 30, lineHeight: 1.8 }}>
          אין פניות שממתינות.<br />
          כשמישהו ימלא את הטופס באתר, הוא יופיע כאן — וגם תקבל התראה בטלגרם.
        </div>
      )}

      {waiting.length > 0 && (
        <>
          <div className="mono" style={{ fontSize: 10, letterSpacing: ".26em", color: "var(--dim)", margin: "22px 0 11px" }}>
            ממתינות להכרעה · {waiting.length}
          </div>
          <SiteLeads leads={waiting} />
        </>
      )}

      {handled.length > 0 && (
        <>
          <div className="mono" style={{ fontSize: 10, letterSpacing: ".26em", color: "var(--dim)", margin: "30px 0 11px" }}>
            טופלו לאחרונה
          </div>
          <div className="panel">
            {handled.map((r) => (
              <div key={r.id} style={{
                display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap",
                padding: "9px 0", borderBottom: "1px solid var(--line-soft)",
              }}>
                <span className="chip">{r.status === "approved" ? "נפתח ליד" : "ספאם"}</span>
                <span style={{ flex: 1, minWidth: 140, fontSize: 14 }}>
                  {r.name}{r.city ? ` · ${r.city}` : ""}
                </span>
                <span className="mono" style={{ fontSize: 10, color: "var(--dim)" }}>
                  {fmtDateTime(r.handled_at ?? r.created_at)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
