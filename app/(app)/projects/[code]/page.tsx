import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { getProject } from "@/lib/queries";
import { leadForProject } from "@/lib/crm";
import { StageRail } from "@/components/StageRail";
import { StageActions } from "@/components/StageActions";
import { GateCard } from "@/components/GateCard";
import { ApprovePanel } from "@/components/ApprovePanel";
import { AddItem, DeleteItem, MorePhotos } from "@/components/ItemManager";
import { ProjectAdmin } from "@/components/ProjectAdmin";
import { ProjectDetails } from "@/components/ProjectDetails";
import { MaterialPanel } from "@/components/MaterialPanel";
import { DeliverPanel } from "@/components/DeliverPanel";
import { Bilingual } from "@/components/Bilingual";
import { STATUS_LABEL, t, type Lang } from "@/lib/i18n";
import { colorOf, stageLock } from "@/lib/types";
import { canDeliverProject, openExtrasFor, profileName } from "@/lib/delivery";

export default async function ProjectPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const me = (await currentUser())!;
  const lang = (me.lang ?? "he") as Lang;
  const project = await getProject(decodeURIComponent(code));
  if (!project) notFound();

  const isDraft = project.status === "draft";
  /* the sales card this project came from — admins only */
  const lead = me.role === "admin" ? await leadForProject(project.id).catch(() => null) : null;
  const isContractor = project.kind === "contractor";
  const projectStages = (project.stages ?? []).sort((a, b) => a.seq - b.seq);
  const plansReady = projectStages.length > 0 && projectStages.every((s) => s.status === "done");
  /* a contractor job has no installation, so the release gate sits one stage later */
  const releaseSeq = isContractor ? 11 : 9;

  /* the last button on the job: "נמסר" for a private client, "נאסף" for a contractor */
  const allStages = [...projectStages, ...(project.items ?? []).flatMap((i) => i.stages ?? [])];
  const stagesLeft = allStages.filter((s) => s.status !== "done").length;
  /* an archived job already says so in the header — the panel is for live ones */
  const showDeliver = !isDraft && project.status === "active";
  let owed: { id: string; title: string; status: string }[] = [];
  let canDeliver = false;
  let deliveredBy: string | null = null;
  if (showDeliver) {
    [owed, canDeliver, deliveredBy] = await Promise.all([
      openExtrasFor(project.id),
      canDeliverProject(project.id, me),
      profileName(project.delivered_by),
    ]);
  }

  return (
    <>
      <div className="mono" style={{ fontSize: 12, letterSpacing: ".16em", color: "var(--bronze)" }}>
        {project.code}
        {isContractor && <span className="chip" style={{ marginInlineStart: 10 }}>קבלן</span>}
      </div>
      <h1 style={{ marginBottom: 8 }}>{project.name}</h1>
      <div style={{ color: "var(--steel)", fontSize: 14, marginBottom: 22 }}>
        {project.client_name} · {project.city ?? "—"} · {project.client_phone ?? ""} ·{" "}
        {t("יעד", lang)} {project.due_date ?? "—"}
        {project.current_rev && (
          <span className="chip go" style={{ marginInlineStart: 10 }}>✓ מאושר {project.current_rev}</span>
        )}
        {project.status === "done" && (
          <span className="chip go" style={{ marginInlineStart: 10 }}>הושלם — בארכיון</span>
        )}
      </div>

      {me.role === "admin" && <ProjectDetails project={project} isContractor={isContractor} />}

      {lead && (
        <Link href={`/crm/${lead.id}`} className="btn"
          style={{ textDecoration: "none", display: "inline-block", marginBottom: 16, marginInlineEnd: 10 }}>
          כרטיס לקוח ומכירה
        </Link>
      )}

      {!isDraft && (
        <Link href={`/projects/${project.code}/plans`} className="btn btn-primary"
          style={{ textDecoration: "none", display: "inline-block", marginBottom: 16 }}>
          תוכניות מאושרות {project.current_rev ? `· ${project.current_rev}` : ""}
        </Link>
      )}

      {isDraft && (
        <ApprovePanel
          projectId={project.id}
          canApprove={me.role === "admin"}
          checks={[
            { ok: !!project.client_name, label: isContractor ? "שם קבלן" : "שם לקוח" },
            { ok: !!project.due_date, label: "תאריך יעד" },
            { ok: (project.items?.length ?? 0) > 0, label: "פריט אחד לפחות" },
          ]}
        />
      )}

      {!isDraft && (
        <>
          <div className="panel">
            <h4 className="mono" style={{ fontSize: 10, letterSpacing: ".22em", color: "var(--dim)", margin: "0 0 16px" }}>
              שלבי הפרויקט
            </h4>
            {projectStages.map((s) => (
              <StageLine key={s.id} stage={s} project={project} item={null} lang={lang} me={me} />
            ))}
          </div>

          {/* a contractor approves his own sketch — Max's plans gate is for
              private clients, where nobody else is checking the drawing */}
          {!isContractor && (
            <GateCard kind="plans" ready={plansReady} signed={project.gate_plans_ok}
              signedBy={project.gate_plans_by} signedAt={project.gate_plans_at}
              targetId={project.id} canSign={!!me.can_approve_plans} />
          )}
        </>
      )}

      {/* material gates the whole production run, so it sits above the items */}
      {isContractor && !isDraft && me.role === "admin" && (
        <MaterialPanel
          projectId={project.id}
          orderedAt={project.material_ordered_at}
          eta={project.material_eta}
          arrivedAt={project.material_arrived_at}
          note={project.material_note}
          sketchRound={project.sketch_round ?? 1} />
      )}

      <div className="mono" style={{ fontSize: 10, letterSpacing: ".26em", color: "var(--dim)", margin: "26px 0 11px" }}>
        פריטים {isDraft ? "" : "בייצור"}
      </div>

      {(project.items ?? []).length === 0 && (
        <div className="panel" style={{ textAlign: "center", padding: 34, color: "var(--steel)", lineHeight: 1.8 }}>
          אין עדיין פריטים.<br />הוסף את הפריטים של הפרויקט — לכל אחד יהיו שלבי הייצור שלו.
        </div>
      )}

      {(project.items ?? []).map((item) => {
        const stages = (item.stages ?? []).sort((a, b) => a.seq - b.seq);
        const releaseReady = stages.length > 0
          && stages.filter((s) => s.seq < releaseSeq).every((s) => s.status === "done");
        const pct = stages.length
          ? Math.round((stages.filter((s) => s.status === "done").length / stages.length) * 100) : 0;

        return (
          <div className="panel" key={item.id} style={{ marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
              <h5 style={{ margin: 0, fontFamily: "var(--display)", fontSize: 19, fontWeight: 500, flex: 1 }}>
                {item.name}
              </h5>
              {item.qty > 1 && <span className="mono" style={{ fontSize: 10, color: "var(--dim)" }}>{item.qty} יח׳</span>}
              {!!item.photos?.length && <span className="chip gold">📷 {item.photos.length}</span>}
              {!isDraft && <span className="chip">{pct}%</span>}
              {me.role === "admin" && <DeleteItem itemId={item.id} name={item.name} />}
            </div>

            <Bilingual text={item.note} tr={item.note_tr}
                       lang={lang} role={me.role} tone="var(--bronze)" />

            {!isDraft && <div style={{ marginTop: 14 }}><StageRail stages={stages} lang={lang} /></div>}

            <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 16, alignItems: "center" }}>
              <span className="mono" style={{ width: "100%", fontSize: 10, color: "var(--dim)" }}>
                {t("מידות מהשטח", lang)}
              </span>
              {item.photos?.map((p: any) => p.url && (
                <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                  <img alt="" width={104} height={104} src={p.url}
                    style={{ borderRadius: 12, objectFit: "cover", border: "1px solid var(--line)" }} />
                </a>
              ))}
              {(me.role === "admin" || me.role === "cnc") && (
                <MorePhotos projectId={project.id} itemId={item.id} />
              )}
            </div>

            {!isDraft && (
              <div style={{ marginTop: 18 }}>
                {stages.map((s) => (
                  <div key={s.id}>
                    {s.seq === releaseSeq && (
                      <GateCard kind="release" ready={releaseReady} signed={item.gate_release_ok}
                        signedBy={item.gate_release_by} signedAt={item.gate_release_at}
                        targetId={item.id} canSign={!!me.can_release} />
                    )}
                    <StageLine stage={s} project={project} item={item} lang={lang} me={me} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {me.role === "admin" && <AddItem projectId={project.id} />}

      {showDeliver && (canDeliver || !!project.delivered_at) && (
        <DeliverPanel
          projectId={project.id}
          code={project.code}
          kind={project.kind ?? null}
          deliveredAt={project.delivered_at ?? null}
          deliveredBy={deliveredBy}
          deliveryNote={project.delivery_note ?? null}
          stagesLeft={stagesLeft}
          owed={owed}
          canDeliver={canDeliver}
          isAdmin={me.role === "admin"} />
      )}

      {me.role === "admin" && (
        <ProjectAdmin projectId={project.id} code={project.code} status={project.status} />
      )}

      {project.production_note && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h4 className="mono" style={{ fontSize: 10, letterSpacing: ".22em", color: "var(--dim)", margin: "0 0 12px" }}>
            הערות ייצור
          </h4>
          <Bilingual text={project.production_note} tr={project.note_tr}
                     lang={lang} role={me.role} tone="var(--bronze)" />
        </div>
      )}
    </>
  );
}

function StageLine({ stage, project, item, lang, me }: any) {
  const lock = stageLock(project, item, stage);
  const canAct = me.role === "admin"
    || (stage.crew ?? []).some((c: any) => (c.profile?.id ?? c.profile_id) === me.id);
  if (!canAct) return null;
  const block = stage.block?.find?.((b: any) => !b.resolved_at);

  return (
    <div style={{ padding: "13px 0", borderBottom: "1px solid var(--line-soft)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span className="mono" style={{ fontSize: 10, color: "var(--dim)", width: 22 }}>
          {String(stage.seq).padStart(2, "0")}
        </span>
        <span className={stage.status === "stop" ? "blink" : ""}
          style={{ width: 11, height: 11, borderRadius: 99, background: colorOf(stage.status) }} />
        <span style={{
          flex: 1, minWidth: 120, fontSize: 14,
          color: stage.status !== "idle" ? colorOf(stage.status) : undefined,
        }}>{t(stage.name, lang)}</span>
        <span className="mono" style={{ fontSize: 10, color: "var(--dim)" }}>
          {(stage.crew ?? []).map((c: any) => c.profile?.full_name).join(" · ") || "—"}
        </span>
        <span className="chip">{t(STATUS_LABEL[stage.status], lang)}</span>
      </div>

      {block && (
        <Bilingual text={`◆ ${block.note}`} tr={block.note_tr}
                   lang={lang} role={me.role} tone="var(--stop)" />
      )}

      {canAct && (
        <div style={{ marginTop: 12 }}>
          <StageActions stageId={stage.id} status={stage.status} lang={lang} locked={lock} />
        </div>
      )}
    </div>
  );
}
