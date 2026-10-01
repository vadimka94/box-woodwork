export type Role = "admin" | "cnc" | "worker" | "display";
export type StageStatus = "idle" | "work" | "done" | "stop";
export type BlockReason =
  | "missing_hardware" | "missing_material" | "missing_details"
  | "machine_down" | "rework" | "waiting_customer";

export type Profile = {
  id: string; full_name: string; role: Role; title: string[];
  lang: "he" | "ru"; can_approve_plans: boolean; can_release: boolean; active: boolean;
};

export type Stage = {
  id: string; project_id: string; item_id: string | null;
  scope: "project" | "item"; seq: number; name: string; station: string | null;
  status: StageStatus; started_at: string | null; completed_at: string | null;
  crew?: Profile[]; block?: Block | null;
};

export type Item = {
  id: string; project_id: string; name: string; qty: number;
  note: string | null; note_tr: Record<string, string>;
  gate_release_ok: boolean; gate_release_by: string | null; gate_release_at: string | null;
  stages?: Stage[]; photos?: ItemPhoto[];
};

export type Project = {
  id: string; code: string; name: string; client_name: string; client_phone: string | null;
  city: string | null; due_date: string | null; status: "draft" | "active" | "done" | "cancelled";
  production_note: string | null; note_tr: Record<string, string>; current_rev: string | null;
  gate_plans_ok: boolean; gate_plans_by: string | null; gate_plans_at: string | null;
  kind?: "full" | "contractor"; has_carpentry?: boolean;
  /* two-phase job: on-site prep before measuring — see migrations/018_prep_phase.sql */
  prep_required?: boolean; prep_note?: string | null;
  /* set by lib/queries.ts where the stage rows themselves are not loaded */
  prep_pending?: boolean;
  material_ordered_at?: string | null; material_eta?: string | null;
  material_arrived_at?: string | null; material_note?: string | null;
  sketch_round?: number | null;
  /* the job left the building — see supabase/migrations/014_delivery.sql */
  delivered_at?: string | null; delivered_by?: string | null; delivery_note?: string | null;
  closed_at?: string | null; closed_by?: string | null;
  items?: Item[]; stages?: Stage[];
};

export type ItemPhoto = {
  id: string; item_id: string; storage_path: string;
  caption: string | null; taken_by: string | null; taken_at: string;
};

export type Block = {
  id: string; stage_id: string; project_id: string; item_id: string | null;
  reason_code: BlockReason; note: string; note_tr: Record<string, string>;
  reported_by: string | null; reported_at: string; resolved_at: string | null;
};

export const STATUS_COLOR: Record<StageStatus, string> = {
  idle: "var(--idle)", work: "var(--work)", done: "var(--go)", stop: "var(--stop)",
};

/** Stage rows come back from the database loosely typed. This keeps the colour
 *  lookup safe instead of failing the production build over an index type. */
export const colorOf = (status: string | null | undefined) =>
  STATUS_COLOR[(status ?? "idle") as StageStatus] ?? STATUS_COLOR.idle;

/** Contractor jobs have no plans gate: production opens once material is ordered. */
export const isContractorJob = (project: any) => project?.kind === "contractor";

/** First item stage that needs the release gate — contractors have no installation. */
export const releaseSeqOf = (project: any) => (isContractorJob(project) ? 11 : 9);

/** Handed over, but still waiting on something we owe. Off the lists, not archived. */
export const isAwaitingCompletion = (project: any) =>
  !!project?.delivered_at && project?.status === "active";

/** Production is open for this project (the same test the database uses). */
export const productionOpen = (project: any) =>
  isContractorJob(project) ? !!project?.material_ordered_at : !!project?.gate_plans_ok;

/** The preparatory site stage of a two-phase job: project scope, seq 0. */
export const prepStageOf = (project: any) =>
  (project?.stages ?? []).find((s: any) => !s.item_id && s.seq === 0) ?? null;

/**
 * A two-phase job whose site work is not finished yet. Nothing else in the
 * job may move — there is no point measuring a wall that is still standing.
 * Reads project.prep_pending when the stage rows were not loaded (see myStages).
 */
export function prepPending(project: any): boolean {
  if (!project?.prep_required) return false;
  if (typeof project.prep_pending === "boolean") return project.prep_pending;
  const prep = prepStageOf(project);
  return !!prep && prep.status !== "done";
}

/**
 * A stage is locked while a gate above it is unsigned. Mirrors guard_gates() in SQL:
 *   two-phase → everything from seq 1 up is locked until the site prep is done
 *   contractor → locked until material is ordered; release gate from stage 11
 *   private    → locked until Max signs the plans; release gate from stage 9
 */
export function stageLock(project: Project, item: Item | null, stage: Stage) {
  if (stage.seq > 0 && prepPending(project)) return "prep";
  if (!item) return null;
  if (isContractorJob(project)) {
    if (!(project as any).material_ordered_at) return "material";
  } else if (!project.gate_plans_ok) {
    return "gate_plans";
  }
  if (stage.seq >= releaseSeqOf(project) && !item.gate_release_ok) return "gate_release";
  return null;
}
