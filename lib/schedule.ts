import { createClient } from "@/lib/supabase/server";

export type Install = {
  id: string; project_id: string; scheduled_date: string; start_time: string | null;
  address: string | null; note: string | null; status: "planned" | "done" | "cancelled";
  project?: any; crew?: { id: string; full_name: string }[];
};

/** Installations in a window, with their crews. Used by the calendar, the
 *  floor screen and the carpenter's phone. */
export async function getInstallations(fromISO: string, toISO: string, forProfile?: string) {
  const supabase = await createClient();

  const { data: installs, error } = await supabase
    .from("installations").select("*")
    .gte("scheduled_date", fromISO).lte("scheduled_date", toISO)
    .neq("status", "cancelled")
    .order("scheduled_date").order("start_time");
  if (error) console.error("getInstallations:", error.message);
  if (!installs?.length) return [];

  const [{ data: crew }, { data: projects }, { data: profiles }] = await Promise.all([
    supabase.from("installation_crew").select("installation_id, profile_id"),
    supabase.from("projects").select("id, code, name, client_name, city, due_date"),
    supabase.from("profiles").select("id, full_name"),
  ]);

  const rows = installs.map((i: any) => ({
    ...i,
    project: projects?.find((p) => p.id === i.project_id),
    crew: (crew ?? [])
      .filter((c) => c.installation_id === i.id)
      .map((c) => profiles?.find((p) => p.id === c.profile_id))
      .filter(Boolean) as { id: string; full_name: string }[],
  }));

  return forProfile
    ? rows.filter((r) => r.crew.some((c) => c.id === forProfile))
    : rows;
}

/** One installation with everything the crew needs before driving out. */
export async function getInstallation(id: string) {
  const supabase = await createClient();

  const { data: install, error } = await supabase
    .from("installations").select("*").eq("id", id).maybeSingle();
  if (error) console.error("getInstallation:", error.message);
  if (!install) return null;

  const [{ data: project }, { data: crew }, { data: profiles }, { data: items }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", install.project_id).maybeSingle(),
    supabase.from("installation_crew").select("profile_id").eq("installation_id", id),
    supabase.from("profiles").select("id, full_name, title"),
    supabase.from("items").select("id, name, qty, gate_release_ok").eq("project_id", install.project_id),
  ]);

  return {
    ...install,
    project,
    items: items ?? [],
    crew: (crew ?? [])
      .map((c) => profiles?.find((p) => p.id === c.profile_id))
      .filter(Boolean) as { id: string; full_name: string; title: string[] }[],
    allProfiles: profiles ?? [],
  };
}

export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Builds a month grid, Sunday first — the Israeli working week. */
export function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export const HE_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני",
                          "יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
export const HE_DAYS = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
export const RU_MONTHS = ["январь","февраль","март","апрель","май","июнь",
                          "июль","август","сентябрь","октябрь","ноябрь","декабрь"];
export const RU_DAYS = ["вс","пн","вт","ср","чт","пт","сб"];
export const months = (lang: string) => (lang === "ru" ? RU_MONTHS : HE_MONTHS);
export const days   = (lang: string) => (lang === "ru" ? RU_DAYS : HE_DAYS);
