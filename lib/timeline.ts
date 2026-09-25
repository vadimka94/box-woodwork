import { createClient } from "@/lib/supabase/server";

export type Flag = "no_start" | "too_fast" | "batch" | "off_hours";

export type TimelineEvent = {
  id: string;
  at: string;
  from: string | null;
  to: string;
  reason: string | null;
  note: string | null;
  stage: string;
  seq: number;
  item: string | null;
  project: string;
  code: string;
  workSeconds: number | null;   /* from "started" to "done", when both exist */
  flags: Flag[];
};

export const FLAG_LABEL: Record<Flag, string> = {
  no_start: "נסגר בלי שסומן שהתחיל",
  too_fast: "נסגר פחות מ-3 דקות אחרי ההתחלה",
  batch: "סומן יחד עם עוד שלבים באותה דקה",
  off_hours: "סומן מחוץ לשעות העבודה",
};

export const FLAG_NOTE =
  "הסימונים האלה הם סימני שאלה, לא הוכחה. אפשר לסגור שלב בלי לפתוח אותו כי מישהו אחר " +
  "כבר עשה את העבודה, ואפשר לסמן חמישה שלבים ברצף כי באמת סיימת חמישה. הם נועדו לתת לך " +
  "לאן להסתכל, לא מה להסיק.";

const WORK_START = 6, WORK_END = 20;

/** Everything one person marked, in order, with the context to judge it. */
export async function getTimeline(profileId: string, days = 14) {
  const supabase = await createClient();

  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);

  const { data: events, error } = await supabase
    .from("stage_events")
    .select("*")
    .eq("actor", profileId)
    .gte("created_at", from.toISOString())
    .order("created_at", { ascending: false });
  if (error) console.error("getTimeline:", error.message);
  if (!events?.length) return [];

  const stageIds = [...new Set(events.map((e: any) => e.stage_id))];

  const [{ data: stages }, { data: projects }, { data: items }, { data: allEvents }] = await Promise.all([
    supabase.from("stages").select("id, name, seq, project_id, item_id").in("id", stageIds),
    supabase.from("projects").select("id, code, name"),
    supabase.from("items").select("id, name"),
    /* every event on those stages, by anyone — needed to know if a "done"
       ever had a matching "started", including one made by someone else */
    supabase.from("stage_events").select("stage_id, to_status, created_at, actor").in("stage_id", stageIds),
  ]);

  const byMinute = new Map<string, number>();
  events.forEach((e: any) => {
    if (e.to_status !== "done") return;
    const key = e.created_at.slice(0, 16);
    byMinute.set(key, (byMinute.get(key) ?? 0) + 1);
  });

  return events.map((e: any): TimelineEvent => {
    const stage = stages?.find((s) => s.id === e.stage_id);
    const project = projects?.find((p) => p.id === e.project_id);
    const item = items?.find((i) => i.id === e.item_id);

    const history = (allEvents ?? [])
      .filter((x: any) => x.stage_id === e.stage_id && +new Date(x.created_at) < +new Date(e.created_at))
      .sort((a: any, b: any) => +new Date(b.created_at) - +new Date(a.created_at));

    const lastStart = history.find((x: any) => x.to_status === "work");
    const flags: Flag[] = [];
    let workSeconds: number | null = null;

    if (e.to_status === "done") {
      if (!lastStart) {
        flags.push("no_start");
      } else {
        workSeconds = Math.round((+new Date(e.created_at) - +new Date(lastStart.created_at)) / 1000);
        if (workSeconds < 180) flags.push("too_fast");
      }
      if ((byMinute.get(e.created_at.slice(0, 16)) ?? 0) >= 3) flags.push("batch");
    }

    const hour = new Date(e.created_at).getHours();
    if (hour < WORK_START || hour >= WORK_END) flags.push("off_hours");

    return {
      id: e.id,
      at: e.created_at,
      from: e.from_status,
      to: e.to_status,
      reason: e.reason_code,
      note: e.note,
      stage: stage?.name ?? "—",
      seq: stage?.seq ?? 0,
      item: item?.name ?? null,
      project: project?.name ?? "—",
      code: project?.code ?? "—",
      workSeconds,
      flags,
    };
  });
}
