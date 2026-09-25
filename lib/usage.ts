import { createClient } from "@/lib/supabase/server";

export type UsageRow = {
  profile: { id: string; full_name: string; role: string; title: string[] };
  seconds: number;
  visits: number;
  avgVisit: number;
  days: number;
  events: number;
  completed: number;
  blocks: number;
  extras: number;        /* extras finished */
  extrasTaken: number;   /* unassigned "כללי" items picked up */
  lastSeen: string | null;
  lastAction: string | null;
  perDay: { iso: string; seconds: number; visits: number; events: number }[];
};

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const MIN_VISIT = 5;

export async function getUsage(days = 14): Promise<UsageRow[]> {
  const supabase = await createClient();

  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);

  const [{ data: profiles }, { data: sessions }, { data: events },
         { data: doneExtras }, { data: taken }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, title").eq("active", true),
    supabase.from("app_sessions").select("profile_id, started_at, ended_at")
      .gte("started_at", from.toISOString()),
    supabase.from("stage_events").select("actor, to_status, created_at")
      .gte("created_at", from.toISOString()),
    supabase.from("extras").select("assigned_to, done_at")
      .eq("status", "done").gte("done_at", from.toISOString()),
    /* picking up work nobody assigned is worth counting on its own */
    supabase.from("activity_log").select("actor, created_at")
      .eq("action", "לקח על עצמו חוסר כללי").gte("created_at", from.toISOString()),
  ]);

  const window = Array.from({ length: days }, (_, i) => {
    const d = new Date(from); d.setDate(from.getDate() + i); return iso(d);
  });

  const len = (s: any) =>
    Math.max(0, Math.round((+new Date(s.ended_at) - +new Date(s.started_at)) / 1000));

  return (profiles ?? []).map((profile) => {
    const mine = (sessions ?? [])
      .filter((s) => s.profile_id === profile.id)
      .filter((s) => len(s) >= MIN_VISIT);
    const myEvents = (events ?? []).filter((e) => e.actor === profile.id);

    const seconds = mine.reduce((sum, s) => sum + len(s), 0);
    const activeDays = new Set(mine.map((s) => iso(new Date(s.started_at))));

    const perDay = window.map((day) => {
      const dayS = mine.filter((s) => iso(new Date(s.started_at)) === day);
      return {
        iso: day,
        seconds: dayS.reduce((sum, s) => sum + len(s), 0),
        visits: dayS.length,
        events: myEvents.filter((e) => iso(new Date(e.created_at)) === day).length,
      };
    });

    const lastSession = mine.sort((a, b) => +new Date(b.ended_at) - +new Date(a.ended_at))[0];
    const lastEvent = myEvents.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0];

    return {
      profile,
      seconds,
      visits: mine.length,
      avgVisit: mine.length ? Math.round(seconds / mine.length) : 0,
      days: activeDays.size,
      events: myEvents.length,
      completed: myEvents.filter((e) => e.to_status === "done").length,
      blocks: myEvents.filter((e) => e.to_status === "stop").length,
      extras: (doneExtras ?? []).filter((x: any) => x.assigned_to === profile.id).length,
      extrasTaken: (taken ?? []).filter((x: any) => x.actor === profile.id).length,
      lastSeen: lastSession?.ended_at ?? null,
      lastAction: lastEvent?.created_at ?? null,
      perDay,
    };
  }).sort((a, b) => b.visits - a.visits);
}
