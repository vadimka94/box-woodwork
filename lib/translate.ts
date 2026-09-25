import Anthropic from "@anthropic-ai/sdk";

/**
 * Translates the free text people actually write — a block note, an item
 * note, a shortage description — between Hebrew and Russian, using the
 * shop's own vocabulary. A generic translator turns "צירי Blum בפתיחה רכה"
 * into nonsense; the glossary is what makes this usable next to a saw.
 *
 * Called server-side when the text is saved, and stored alongside the
 * original so it costs nothing to display and survives an API outage.
 */
const GLOSSARY = `
קנט = кромка | פורניר = шпон | צירים = петли | מסילות = направляющие
פתיחה רכה = доводчик | חזית = фасад | גוף = корпус | מדף = полка
דיקט = фанера | MDF = МДФ | כיוון סיב = направление волокна
אי מרכזי = остров | מזנון = комод | דלפק = стойка | ויטרינה = витрина
ארון = шкаф | מגירה = ящик | ידית = ручка | תפס = защёлка
`;

export async function translateNote(text: string, from: "he" | "ru") {
  const to = from === "he" ? "ru" : "he";
  if (!text?.trim()) return null;
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("translateNote: ANTHROPIC_API_KEY missing — storing original only");
    return null;
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system:
        `You translate short production notes in a custom woodworking factory ` +
        `from ${from === "he" ? "Hebrew" : "Russian"} to ${to === "ru" ? "Russian" : "Hebrew"}. ` +
        `Rules: keep numbers, dimensions, colour codes, brand names (Blum, Gola, Caesarstone) ` +
        `and file names exactly as written. Use the shop glossary. Keep it short and plain — ` +
        `a carpenter reads it next to a saw. Reply with the translation only, no preamble.\n` +
        `Glossary:\n${GLOSSARY}`,
      messages: [{ role: "user", content: text }],
    });

    const out = msg.content.find((c) => c.type === "text");
    return out && out.type === "text" ? out.text.trim() : null;
  } catch (e: any) {
    console.error("translateNote failed:", e?.message ?? e);
    return null;   /* never block a save because a translation failed */
  }
}
