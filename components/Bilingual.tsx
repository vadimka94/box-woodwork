import type { Lang } from "@/lib/i18n";

/**
 * Free text with its translation.
 *
 * A worker sees one language — his own — because a second one is noise next
 * to a saw. A manager sees both, always: he needs to know what Dimitri
 * actually reads, and when a report arrives in Russian he needs it in Hebrew
 * without going to look for it.
 */
export function Bilingual({ text, tr, lang, role, tone = "var(--bronze)" }: {
  text?: string | null;
  tr?: Record<string, string> | null;
  lang: Lang;
  role: string;
  tone?: string;
}) {
  if (!text?.trim()) return null;

  const other: Lang = lang === "he" ? "ru" : "he";
  const isManager = role === "admin";
  /* the manager gets whichever half he is missing; a worker gets only his own */
  const second = isManager ? (tr?.[other] ?? tr?.ru ?? tr?.he ?? null) : (tr?.[lang] ?? null);

  return (
    <div style={{
      marginTop: 12, padding: "13px 15px", borderRadius: 12,
      background: "rgba(0,0,0,.04)", borderInlineStart: `3px solid ${tone}`,
      fontSize: 14, lineHeight: 1.75,
    }}>
      <div>{text}</div>
      {second && (
        <div style={{
          marginTop: 9, paddingTop: 9, borderTop: "1px solid var(--line-soft)",
          color: "#2F5D8C",
        }}>{second}</div>
      )}
      {isManager && !second && (
        <div className="mono" style={{ marginTop: 8, fontSize: 10, color: "var(--dim)" }}>
          — אין תרגום שמור —
        </div>
      )}
    </div>
  );
}
