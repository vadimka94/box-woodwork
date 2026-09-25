import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { getCustomers, KIND_LABEL, money, fmtDate } from "@/lib/crm";
import { Realtime } from "@/components/Realtime";
import { CrmTabs } from "@/components/CrmTabs";

/** Everyone who ever contacted the shop, newest activity first. */
export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string }> }) {
  const me = await currentUser();
  if (!me || me.role !== "admin") redirect("/tasks");
  const { q = "", kind = "" } = await searchParams;

  const all = await getCustomers(q);
  const list = kind ? all.filter((c: any) => c.kind === kind) : all;

  return (
    <>
      <Realtime tables={["leads"]} />
      <CrmTabs active="customers" />
      <h1>לקוחות</h1>

      <form method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18, maxWidth: 720 }}>
        <input name="q" defaultValue={q} placeholder="חיפוש לפי שם, טלפון, עיר או הערה" style={{ flex: 1, minWidth: 220 }} />
        <select name="kind" defaultValue={kind} style={{ width: "auto", minWidth: 130 }}>
          <option value="">כולם</option>
          <option value="private">{KIND_LABEL.private}</option>
          <option value="contractor">{KIND_LABEL.contractor}</option>
        </select>
        <button className="btn btn-primary">חפש</button>
        {(q || kind) && <Link className="btn" href="/crm/customers" style={{ textDecoration: "none" }}>נקה</Link>}
      </form>

      <div className="mono" style={{ fontSize: 13, color: "var(--steel)", marginBottom: 10 }}>
        {list.length} לקוחות
      </div>

      {list.length === 0 && (
        <div className="panel" style={{ textAlign: "center", color: "var(--steel)", padding: 30 }}>
          {q ? "לא נמצא לקוח שמתאים לחיפוש." : "עוד אין לקוחות. כל פנייה חדשה פותחת כרטיס לקוח."}
        </div>
      )}

      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        {list.map((c: any) => (
          <Link key={c.id} href={`/crm/customers/${c.id}`} style={{
            display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap",
            padding: "14px 18px", borderBottom: "1px solid var(--line-soft)", textDecoration: "none",
          }}>
            <div style={{ flex: "2 1 200px", minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>
                {c.name}
                {c.kind === "contractor" && <span className="chip" style={{ marginInlineStart: 8 }}>{KIND_LABEL.contractor}</span>}
              </div>
              <div style={{ fontSize: 13, color: "var(--steel)", marginTop: 3 }}>
                {[c.phone, c.city].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
            <div style={{ flex: "1 1 140px", fontSize: 13, color: "var(--steel)" }}>
              {c.dealCount} עסקאות · {c.wonCount} נסגרו
              {c.openCount > 0 && <span style={{ color: "var(--work)" }}> · {c.openCount} פתוחות</span>}
            </div>
            <div className="mono" style={{ flex: "0 0 110px", fontSize: 14, color: c.total ? "var(--go)" : "var(--dim)" }}>
              {c.total ? money(c.total) : "—"}
            </div>
            <div className="mono" style={{ flex: "0 0 80px", fontSize: 11, color: "var(--dim)" }}>
              {fmtDate(c.lastAt)}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
