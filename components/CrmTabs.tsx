import Link from "next/link";

/** Switch between the deal board and the customer list. */
export function CrmTabs({ active }: { active: "board" | "customers" }) {
  const tab = (on: boolean) => ({
    textDecoration: "none",
    borderColor: on ? "var(--bronze)" : undefined,
    color: on ? "var(--bronze-lt)" : undefined,
    background: on ? "rgba(201,146,79,.12)" : undefined,
  });
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
      <Link className="btn" href="/crm" style={tab(active === "board")}>לוח עסקאות</Link>
      <Link className="btn" href="/crm/customers" style={tab(active === "customers")}>לקוחות</Link>
    </div>
  );
}
