import Link from "next/link";
import { currentUser } from "@/lib/supabase/server";
import { listProjects } from "@/lib/queries";
import { StageRail } from "@/components/StageRail";
import type { Lang } from "@/lib/i18n";

export default async function ProjectsPage({
  searchParams,
}: { searchParams: Promise<{ view?: string }> }) {
  const me = (await currentUser())!;
  const lang = (me.lang ?? "he") as Lang;
  const { view } = await searchParams;
  const archive = view === "archive";

  const all = await listProjects();
  const projects = (all as any[]).filter((p) =>
    archive ? p.status === "done" || p.status === "cancelled"
            : p.status !== "done" && p.status !== "cancelled");
  const archiveCount = (all as any[]).filter((p) => p.status === "done" || p.status === "cancelled").length;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ marginBottom: 0 }}>{archive ? "ארכיון פרויקטים" : "פרויקטים"}</h1>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href={archive ? "/projects" : "/projects?view=archive"} className="btn"
            style={{ textDecoration: "none" }}>
            {archive ? "← לפרויקטים פעילים" : `ארכיון${archiveCount ? ` · ${archiveCount}` : ""}`}
          </Link>
          {me.role === "admin" && !archive && (
            <Link href="/projects/new" className="btn btn-primary" style={{ textDecoration: "none" }}>
              + פרויקט חדש
            </Link>
          )}
        </div>
      </div>

      <div className="grid" style={{ marginTop: 24 }}>
        {projects.length === 0 && (
          <div className="panel" style={{ textAlign: "center", padding: 46, color: "var(--steel)", lineHeight: 1.8 }}>
            {archive ? "הארכיון ריק." : "עוד אין פרויקטים."}<br />
            {archive ? "פרויקט שתסגור יופיע כאן."
              : me.role === "admin" ? "לחץ על ״פרויקט חדש״ כדי לפתוח את הראשון."
              : "פרויקט חדש יופיע כאן ברגע שייפתח."}
          </div>
        )}

        {projects.map((p: any) => {
          const all = p.items?.flatMap((i: any) => i.stages ?? []) ?? [];
          const pct = all.length
            ? Math.round((all.filter((s: any) => s.status === "done").length / all.length) * 100) : 0;
          const blocked = all.some((s: any) => s.status === "stop");

          return (
            <Link key={p.id} href={`/projects/${p.code}`} className="panel" style={{ textDecoration: "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span className="mono" style={{ fontSize: 11, color: "var(--bronze)", letterSpacing: ".14em" }}>
                  {p.code}
                </span>
                {p.status === "done" ? <span className="chip go">הושלם</span>
                  : p.status === "cancelled" ? <span className="chip">בוטל</span>
                  : p.status === "draft" ? <span className="chip gold">טיוטה — לא אושר</span>
                  : blocked ? <span className="chip stop">תקוע</span>
                  : <span className="chip work">בעבודה</span>}
              </div>

              <h3 style={{ fontFamily: "var(--display)", fontWeight: 500, fontSize: 21, margin: "9px 0 3px" }}>
                {p.name}
              </h3>
              <div style={{ fontSize: 13, color: "var(--steel)" }}>
                {p.client_name} · {p.city ?? "—"} · {p.items?.length ?? 0} פריטים
              </div>

              <div className="mono" style={{
                display: "flex", justifyContent: "space-between", margin: "18px 0 12px",
                fontSize: 11, color: "var(--dim)",
              }}>
                <span style={{ color: "var(--bone)", fontSize: 14 }}>{p.status === "draft" ? "—" : `${pct}%`}</span>
                <span>יעד {p.due_date ?? "—"}</span>
              </div>

              {p.items?.map((i: any) => (
                <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
                  <span style={{
                    width: 100, fontSize: 12, color: "var(--steel)",
                    overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                  }}>{i.name}</span>
                  <div style={{ flex: 1 }}><StageRail stages={i.stages ?? []} lang={lang} /></div>
                </div>
              ))}
            </Link>
          );
        })}
      </div>
    </>
  );
}
