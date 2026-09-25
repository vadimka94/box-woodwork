import { translateNote } from "@/lib/translate";
import { RU_LABELS } from "@/lib/i18n";

/**
 * The factory screen is read by Russian-speaking carpenters, so pages opened
 * from it show every fixed label in both languages, and free text (project
 * name, installation note, item names) with a Russian line under it.
 */

/** "לקוח" → "לקוח · Клиент". Anything without a translation stays as is. */
export const both = (he: string) => (RU_LABELS[he] ? `${he} · ${RU_LABELS[he]}` : he);

/* translations of free text, kept for the life of the server instance */
const cache = new Map<string, string | null>();

/** Russian for a list of Hebrew texts. Never throws; missing ones come back null. */
export async function toRussian(texts: (string | null | undefined)[]) {
  return Promise.all(texts.map(async (t) => {
    const text = (t ?? "").trim();
    if (!text || !/[֐-׿]/.test(text)) return null;   /* nothing Hebrew to translate */
    if (cache.has(text)) return cache.get(text)!;
    const ru = await translateNote(text, "he").catch(() => null);
    cache.set(text, ru);
    return ru;
  }));
}
