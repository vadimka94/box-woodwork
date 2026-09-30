import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

/**
 * Switch between the deal board, the customer list and the website inbox.
 *
 * The tab counts the undecided website enquiries itself rather than taking a
 * number as a prop, so every page that already renders the tabs shows the
 * badge without knowing anything about it.
 */
export async function CrmTabs({ active }: { active: "board" | "customers" | "inbox" }) {
  let waiting = 0;
  try {
    const supabase = await createClient();
    const { count } = await supabase
      .from("site_leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "new");
    waiting = count ?? 0;
  } catch {
    /* the table may not exist yet — the tab still works, just without a count */
  }

  const tab = (on: boolean) => ({
    textDecoration: "none",
    borderColor: on ? "var(--bronze)" : undefined,
    color: on ? "var(--bronze-lt)" : undefined,
    background: on ? "rgba(201,146,79,.12)" : undefined,
  });

  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
      <Link className="btn" href="/crm" style={tab(active === "board")}>לוח עסקאות</Link>
      <Link className="btn" href="/crm/customers" style={tab(active === "customers")}>לקוחות</Link>
      <Link className="btn" href="/crm/inbox" style={tab(active === "inbox")}>
        פניות מהאתר
        {waiting > 0 && (
          <span className="chip gold" style={{ marginInlineStart: 8 }}>{waiting}</span>
        )}
      </Link>
    </div>
  );
}
