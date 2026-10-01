import { createClient } from "@/lib/supabase/server";

export type TeamRow = {
  profile: { id: string; full_name: string; role: string; title: string[] };
  stopped: any[]; working: any[]; waiting: any[]; done: number;
};

/** Where every person stands right now, and where work is stuck on them. */
export async function getTeamBoard(): Promise<TeamRow[]> {
  const supabase = await createClient();

  const [{ data: profiles }, { data: crew }, { data: stages }, { data: projects },
         { data: items }, { data: blocks }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, title").eq("active", true),
    supabase.from("stage_crew").select("stage_id, profile_id"),
    supabase.from("stages").select("*"),
    supabase.from("projects").select("id, code, name, client_name, due_date, status"),
    supabase.from("items").select("id, name"),
    supabase.from("blocks").select("*").is("resolved_at", null),
  ]);

  const active = new Set((projects ?? []).filter((p) => p.status === "active").map((p) => p.id));

  const enrich = (s: any) => ({
    ...s,
    project: projects?.find((p) => p.id === s.project_id),
    item: items?.find((i) => i.id === s.item_id) ?? null,
    block: (blocks ?? []).find((b: any) => b.stage_id === s.id) ?? null,
  });

  return (profiles ?? []).map((profile) => {
    const mine = (crew ?? [])
      .filter((c) => c.profile_id === profile.id)
      .map((c) => (stages ?? []).find((s: any) => s.id === c.stage_id))
      .filter((s: any) => s && active.has(s.project_id))
      .map(enrich);

    return {
      profile,
      stopped: mine.filter((s: any) => s.status === "stop"),
      working: mine.filter((s: any) => s.status === "work"),
      waiting: mine.filter((s: any) => s.status === "idle"),
      done: mine.filter((s: any) => s.status === "done").length,
    };
  }).sort((a, b) => b.stopped.length - a.stopped.length || b.working.length - a.working.length);
}

/* seq 0 is the two-phase prep stage — only a few jobs have it, but it needs a standing crew */
const P_STAGES = ["עבודת הכנה בשטח", "מדידה", "תכנון הדמיה", "אישור לקוח"];
const I_STAGES = ["תכנות CNC", "חיתוך CNC", "הדבקת קנט", "הרכבה", "בקרת איכות", "אריזה", "התקנה"];

/** The standing rules: who gets put on each stage when a project is created. */
export async function getDefaults() {
  const supabase = await createClient();
  const [{ data: profiles }, { data: defaults }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role").eq("active", true),
    supabase.from("stage_defaults").select("*"),
  ]);

  const rows = (scope: "project" | "item", names: string[], offset: number) =>
    names.map((name, i) => ({
      scope, seq: i + offset, name,
      crew: (defaults ?? []).filter((d) => d.scope === scope && d.seq === i + offset)
        .map((d) => d.profile_id),
    }));

  return {
    profiles: profiles ?? [],
    project: rows("project", P_STAGES, 0),
    item: rows("item", I_STAGES, 4),
  };
}
