import { isContractorJob, productionOpen, releaseSeqOf } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";
import { signPhotos } from "@/lib/photos";
import type { Item, Project, Stage } from "@/lib/types";

/**
 * Flat queries on purpose. A single nested select fails as a whole if any one
 * embedded relationship misbehaves, and returns nothing without saying why —
 * which is exactly how a project ends up looking like it has no stages.
 * Five small queries are slower on paper and far easier to trust.
 */
export async function getProject(code: string) {
  const supabase = await createClient();

  const { data: project, error: pe } = await supabase
    .from("projects").select("*").eq("code", code).maybeSingle();
  if (pe) console.error("getProject/project:", pe.message);
  if (!project) return null;

  const [stagesRes, itemsRes, crewRes, blocksRes, photosRes] = await Promise.all([
    supabase.from("stages").select("*").eq("project_id", project.id).order("seq"),
    supabase.from("items").select("*").eq("project_id", project.id).order("sort"),
    supabase.from("stage_crew").select("stage_id, profile_id"),
    supabase.from("blocks").select("*").eq("project_id", project.id).is("resolved_at", null),
    supabase.from("item_photos").select("*").eq("project_id", project.id),
  ]);

  if (stagesRes.error) console.error("getProject/stages:", stagesRes.error.message);
  if (itemsRes.error)  console.error("getProject/items:",  itemsRes.error.message);
  if (crewRes.error)   console.error("getProject/crew:",   crewRes.error.message);
  if (blocksRes.error) console.error("getProject/blocks:", blocksRes.error.message);
  if (photosRes.error) console.error("getProject/photos:", photosRes.error.message);

  const { data: profiles } = await supabase.from("profiles").select("id, full_name, role");
  const nameOf = (id: string) => profiles?.find((p) => p.id === id);

  const crewFor = (stageId: string) =>
    (crewRes.data ?? [])
      .filter((c) => c.stage_id === stageId)
      .map((c) => ({ profile: nameOf(c.profile_id) }))
      .filter((c) => c.profile);

  const stages = (stagesRes.data ?? []).map((s: any) => ({
    ...s,
    crew: crewFor(s.id),
    block: (blocksRes.data ?? []).filter((b: any) => b.stage_id === s.id),
  })) as Stage[];

  const items = await Promise.all(
    (itemsRes.data ?? []).map(async (i: any) => ({
      ...i,
      photos: await signPhotos((photosRes.data ?? []).filter((p: any) => p.item_id === i.id)),
      stages: stages.filter((s) => s.item_id === i.id),
    }))
  );

  return {
    ...project,
    stages: stages.filter((s) => !s.item_id),
    items: items as Item[],
  } as Project;
}

export async function listProjects() {
  const supabase = await createClient();
  const [{ data: projects, error }, { data: items }, { data: stages }] = await Promise.all([
    supabase.from("projects").select("*").order("created_at", { ascending: false }),
    supabase.from("items").select("id, project_id, name, qty, gate_release_ok").order("sort"),
    supabase.from("stages").select("id, project_id, item_id, seq, status").order("seq"),
  ]);
  if (error) console.error("listProjects:", error.message);

  return (projects ?? []).map((p: any) => ({
    ...p,
    items: (items ?? []).filter((i: any) => i.project_id === p.id).map((i: any) => ({
      ...i, stages: (stages ?? []).filter((s: any) => s.item_id === i.id),
    })),
  })) as Project[];
}

export async function floorBoard() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_floor").select("*");
  if (error) console.error("floorBoard:", error.message);
  return data ?? [];
}

export async function openBlocks() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blocks").select("*").is("resolved_at", null).order("reported_at");
  if (error) console.error("openBlocks:", error.message);
  if (!data?.length) return [];

  const [{ data: projects }, { data: items }, { data: stages }, { data: profiles }] = await Promise.all([
    supabase.from("projects").select("id, code, name, client_name, due_date, status"),
    supabase.from("items").select("id, name"),
    supabase.from("stages").select("id, name, seq"),
    supabase.from("profiles").select("id, full_name"),
  ]);

  return data.map((b: any) => ({
    ...b,
    project: projects?.find((p) => p.id === b.project_id),
    item: items?.find((i) => i.id === b.item_id),
    stage: stages?.find((s) => s.id === b.stage_id),
    reporter: profiles?.find((p) => p.id === b.reported_by),
  })).filter((b: any) => b.project?.status === "active");   /* closed work stops shouting */
}

export async function pendingGates() {
  const supabase = await createClient();
  const [{ data: projects }, { data: items }, { data: stages }] = await Promise.all([
    supabase.from("projects").select("*").eq("status", "active"),
    supabase.from("items").select("*"),
    supabase.from("stages").select("id, project_id, item_id, seq, status"),
  ]);

  /* contractors approve their own sketch — Max's plans gate is not theirs */
  const planGates = (projects ?? [])
    .filter((p: any) => !isContractorJob(p) && !p.gate_plans_ok)
    .filter((p: any) => {
      const own = (stages ?? []).filter((s: any) => s.project_id === p.id && !s.item_id);
      return own.length > 0 && own.every((s: any) => s.status === "done");
    });

  const open = new Map((projects ?? []).filter(productionOpen).map((p: any) => [p.id, p]));
  const releaseGates = (items ?? [])
    .filter((i: any) => !i.gate_release_ok && open.has(i.project_id))
    .filter((i: any) => {
      /* everything before the release gate is built */
      const upTo = releaseSeqOf(open.get(i.project_id));
      const made = (stages ?? []).filter((s: any) => s.item_id === i.id && s.seq < upTo);
      return made.length > 0 && made.every((s: any) => s.status === "done");
    })
    .map((i: any) => ({ ...i, project: (projects ?? []).find((p: any) => p.id === i.project_id) }));

  return { planGates, releaseGates };
}

export async function myStages(profileId: string) {
  const supabase = await createClient();

  const { data: crew, error } = await supabase
    .from("stage_crew").select("stage_id").eq("profile_id", profileId);
  if (error) console.error("myStages/crew:", error.message);
  const ids = (crew ?? []).map((c) => c.stage_id);
  if (!ids.length) return [];

  const { data: stages } = await supabase
    .from("stages").select("*").in("id", ids).neq("status", "done").order("seq");
  if (!stages?.length) return [];

  const [{ data: projects }, { data: items }, { data: blocks }, { data: photos }] = await Promise.all([
    supabase.from("projects").select("*").eq("status", "active"),
    supabase.from("items").select("*"),
    supabase.from("blocks").select("*").is("resolved_at", null),
    supabase.from("item_photos").select("*"),
  ]);

  const out = stages
    .map((s: any) => ({
      ...s,
      project: projects?.find((p: any) => p.id === s.project_id),
      item: items?.find((i: any) => i.id === s.item_id) ?? null,
      block: (blocks ?? []).filter((b: any) => b.stage_id === s.id),
    }))
    .filter((s: any) => s.project);

  return Promise.all(out.map(async (s: any) => ({
    ...s,
    item: s.item
      ? { ...s.item, photos: await signPhotos((photos ?? []).filter((p: any) => p.item_id === s.item.id)) }
      : null,
  })));
}

/**
 * Handed over, but the shop still owes something. These are off the working
 * lists and off the floor screen — they only need a quiet line on the
 * dashboard so nobody forgets the trim that was promised.
 */
export async function deliveredWaiting() {
  const supabase = await createClient();

  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, code, name, client_name, kind, delivered_at")
    .eq("status", "active").not("delivered_at", "is", null)
    .order("delivered_at");
  if (error) console.error("deliveredWaiting:", error.message);
  if (!projects?.length) return [];

  const { data: extras } = await supabase
    .from("extras").select("project_id, title")
    .in("project_id", projects.map((p: any) => p.id))
    .in("status", ["open", "work"]);

  return projects.map((p: any) => ({
    ...p,
    owed: (extras ?? []).filter((e: any) => e.project_id === p.id),
  }));
}
