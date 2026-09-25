import { createClient } from "@/lib/supabase/server";

/**
 * The measurement bucket is private, so a /object/public/ URL returns
 * "Bucket not found". Files have to be handed out as signed links with
 * an expiry — this keeps customer drawings off the open internet.
 */
export async function signPhotos<T extends { storage_path: string }>(
  photos: T[] | null | undefined,
  seconds = 60 * 60
): Promise<(T & { url: string | null })[]> {
  const list = photos ?? [];
  if (!list.length) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("measurements")
    .createSignedUrls(list.map((p) => p.storage_path), seconds);

  if (error) {
    console.error("signPhotos:", error.message);
    return list.map((p) => ({ ...p, url: null }));
  }

  return list.map((p, i) => ({ ...p, url: data?.[i]?.signedUrl ?? null }));
}
