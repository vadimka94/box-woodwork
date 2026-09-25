import { createClient } from "@/lib/supabase/server";

/** Both buckets are private, so every file is handed out as a signed link. */
export async function signFiles<T extends { storage_path: string }>(
  bucket: "plans" | "measurements",
  files: T[] | null | undefined,
  seconds = 60 * 60
): Promise<(T & { url: string | null })[]> {
  const list = files ?? [];
  if (!list.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(list.map((f) => f.storage_path), seconds);
  if (error) {
    console.error("signFiles:", error.message);
    return list.map((f) => ({ ...f, url: null }));
  }
  return list.map((f, i) => ({ ...f, url: data?.[i]?.signedUrl ?? null }));
}

/**
 * The reference library a carpenter builds from: five folders, created when
 * the project is approved. Everything here belongs to the approved revision —
 * a worker should never be looking at a superseded drawing.
 */
export async function getPlans(projectId: string) {
  const supabase = await createClient();

  const [{ data: folders }, { data: files }] = await Promise.all([
    supabase.from("media_folders").select("*").eq("project_id", projectId).order("sort"),
    supabase.from("media_files").select("*").eq("project_id", projectId)
      .order("created_at", { ascending: false }),
  ]);

  const signed = await signFiles("plans", files ?? []);

  return (folders ?? []).map((f: any) => ({
    ...f,
    files: signed.filter((x: any) => x.folder_id === f.id),
  }));
}

export function kindOf(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "webp", "gif", "heic"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (["skp", "layout", "dwg", "dxf"].includes(ext)) return "sketchup";
  return "other";
}
