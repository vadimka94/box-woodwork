import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { getProject } from "@/lib/queries";
import { getPlans } from "@/lib/plans";
import { PlanUpload, DeleteFile } from "@/components/PlanUpload";
import { t, type Lang } from "@/lib/i18n";

const KIND_LABEL: Record<string, string> = {
  image: "תמונה", pdf: "PDF", sketchup: "SKETCHUP", other: "קובץ",
};

/**
 * What the assembler looks at. Folders by view type, not one flat dump —
 * an overview render and an exploded view answer different questions.
 */
export default async function PlansPage({
  params, searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ folder?: string }>;
}) {
  const { code } = await params;
  const { folder } = await searchParams;
  const me = (await currentUser())!;
  const lang = (me.lang ?? "he") as Lang;

  const project = await getProject(decodeURIComponent(code));
  if (!project) notFound();

  const folders = await getPlans(project.id);
  const open = folders.find((f: any) => f.id === folder) ?? null;
  const canUpload = me.role === "admin" || me.role === "cnc";

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <div className="mono" style={{ fontSize: 14, color: "var(--bronze-lt)", letterSpacing: ".16em" }}>
            {project.code} · {project.client_name}
          </div>
          <h1 style={{ marginBottom: 10 }}>{project.name}</h1>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {project.current_rev ? (
              <span className="chip go" style={{ fontSize: 12, padding: "7px 14px" }}>
                ✓ מאושר ללקוח · {project.current_rev}
              </span>
            ) : (
              <span className="chip gold">טרם אושר — אין תוכניות מאושרות</span>
            )}
            <span className="chip">{project.items?.length ?? 0} פריטים</span>
          </div>
        </div>
        <Link href={`/projects/${project.code}`} className="btn" style={{ textDecoration: "none" }}>
          ← לכרטיס הפרויקט
        </Link>
      </div>

      <div className="mono" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "24px 0 16px" }}>
        <Link href={`/projects/${project.code}/plans`}
          style={{ color: open ? "var(--bronze-lt)" : "var(--bone)", textDecoration: "none" }}>
          {t("כל התיקיות", lang)}
        </Link>
        {open && <><span style={{ color: "var(--dim)" }}>›</span><span>{open.name}</span></>}
      </div>

      {!open ? (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))" }}>
          {folders.map((f: any) => (
            <Link key={f.id} href={`/projects/${project.code}/plans?folder=${f.id}`}
              className="panel" style={{ textDecoration: "none" }}>
              <div style={{ fontSize: 18, marginBottom: 10 }}>{t(f.name, lang)}</div>
              <div className="mono" style={{ fontSize: 12, color: f.files.length ? "var(--bronze-lt)" : "var(--dim)" }}>
                {f.files.length ? `${f.files.length} קבצים` : "ריקה"}
              </div>
            </Link>
          ))}
          {!folders.length && (
            <div className="panel" style={{ textAlign: "center", padding: 40, color: "var(--steel)", lineHeight: 1.8 }}>
              התיקיות נוצרות כשהפרויקט מאושר לייצור.
            </div>
          )}
        </div>
      ) : (
        <>
          {canUpload && (
            <PlanUpload projectId={project.id} folderId={open.id} folderName={open.name} />
          )}

          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", marginTop: 16 }}>
            {open.files.map((f: any) => (
              <div className="panel" key={f.id} style={{ padding: 0, overflow: "hidden" }}>
                <a href={f.url ?? "#"} target="_blank" rel="noreferrer"
                  style={{ display: "block", textDecoration: "none" }}>
                  {f.kind === "image" && f.url ? (
                    <img src={f.url} alt="" style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", display: "block" }} />
                  ) : (
                    <div style={{
                      aspectRatio: "4/3", display: "grid", placeItems: "center",
                      background: "linear-gradient(135deg,#F4F1EB,#E8E3DA)",
                    }}>
                      <span className="mono" style={{ fontSize: 12, letterSpacing: ".18em", color: "var(--bronze-lt)" }}>
                        {KIND_LABEL[f.kind]}
                      </span>
                    </div>
                  )}
                  <div style={{ padding: "14px 16px", fontSize: 14, lineHeight: 1.5 }}>{f.name}</div>
                </a>
                {me.role === "admin" && (
                  <div style={{ padding: "0 16px 14px" }}><DeleteFile fileId={f.id} name={f.name} /></div>
                )}
              </div>
            ))}

            {!open.files.length && (
              <div className="panel" style={{ textAlign: "center", padding: 40, color: "var(--steel)", lineHeight: 1.8 }}>
                התיקייה ריקה.
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
