import { createClient } from "@/lib/supabase/server";

/** What the button says, and what it means. A contractor collects; a private
 *  client is handed the finished job at his home. */
export const deliverLabel = (kind: string | null | undefined) =>
  kind === "contractor" ? "נאסף" : "נמסר";

/**
 * Who may declare the job handed over: a manager, or the people who were
 * actually there for it — the installation crew, or the crew of the last
 * stage on the floor when a contractor picks up from the factory.
 */
export async function canDeliverProject(projectId: string, me: any) {
  if (!me) return false;
  if (me.role === "admin") return true;

  const supabase = await createClient();

  const { data: installs } = await supabase
    .from("installations").select("id").eq("project_id", projectId);
  if (installs?.length) {
    const { data: crew } = await supabase
      .from("installation_crew").select("profile_id")
      .in("installation_id", installs.map((i: any) => i.id))
      .eq("profile_id", me.id);
    if (crew?.length) return true;
  }

  const { data: stages } = await supabase
    .from("stages").select("id, seq")
    .eq("project_id", projectId).not("item_id", "is", null);
  if (!stages?.length) return false;

  const last = Math.max(...stages.map((s: any) => s.seq));
  const ids = stages.filter((s: any) => s.seq === last).map((s: any) => s.id);

  const { data: crew } = await supabase
    .from("stage_crew").select("profile_id")
    .in("stage_id", ids).eq("profile_id", me.id);
  return !!crew?.length;
}

/** What the shop still owes on this job — the reason a finished project can
 *  still not be archived. */
export async function openExtrasFor(projectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("extras").select("id, title, status")
    .eq("project_id", projectId).in("status", ["open", "work"]);
  if (error) console.error("openExtrasFor:", error.message);
  return data ?? [];
}

/** Who pressed the button, by name. */
export async function profileName(id: string | null | undefined) {
  if (!id) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles").select("full_name").eq("id", id).maybeSingle();
  return data?.full_name ?? null;
}
