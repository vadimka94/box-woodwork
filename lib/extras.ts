import { createClient } from "@/lib/supabase/server";
import { signFiles } from "@/lib/plans";

export { SOURCE_LABEL, ROUTE_LABEL, EXTRA_STATUS_LABEL, EXTRA_STATUS_COLOR } from "@/lib/extra-labels";

/** Everything the shop still owes on jobs that are already out in the field. */
export async function getExtras(opts: {
  projectId?: string; forProfile?: string; openOnly?: boolean;
  /** Together with forProfile: also bring the "כללי" items nobody has taken yet. */
  includeGeneral?: boolean;
} = {}) {
  const supabase = await createClient();

  let q = supabase.from("extras").select("*").order("created_at", { ascending: false });
  if (opts.projectId) q = q.eq("project_id", opts.projectId);
  if (opts.forProfile && opts.includeGeneral) {
    q = q.or(`assigned_to.eq.${opts.forProfile},assigned_to.is.null`);
  } else if (opts.forProfile) {
    q = q.eq("assigned_to", opts.forProfile);
  }
  if (opts.openOnly) q = q.in("status", ["open", "work"]);

  const { data, error } = await q;
  if (error) console.error("getExtras:", error.message);
  if (!data?.length) return [];

  const [{ data: projects }, { data: items }, { data: profiles }, { data: photos }] = await Promise.all([
    supabase.from("projects").select("id, code, name, client_name, city"),
    supabase.from("items").select("id, name"),
    supabase.from("profiles").select("id, full_name"),
    supabase.from("extra_photos").select("*"),
  ]);

  return Promise.all(data.map(async (e: any) => ({
    ...e,
    project: projects?.find((p) => p.id === e.project_id),
    item: items?.find((i) => i.id === e.item_id) ?? null,
    assignee: profiles?.find((p) => p.id === e.assigned_to) ?? null,
    reporter: profiles?.find((p) => p.id === e.reported_by) ?? null,
    photos: await signFiles("measurements", (photos ?? []).filter((p: any) => p.extra_id === e.id)),
  })));
}
