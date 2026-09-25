/**
 * Labels only — no database, no server imports. A client component that needs
 * a Hebrew label must be able to import it without dragging the whole server
 * client along, which is what broke the production build.
 */
export const SOURCE_LABEL: Record<string, string> = {
  missing: "חסר בשטח",
  customer_request: "בקשת לקוח",
  damaged: "נהרס / ניזוק",
  remake: "ייצור מחדש",
};

/** "general" = not decided yet: shows up for the saw crew and for CNC alike. */
export const ROUTE_LABEL: Record<string, string> = {
  general: "כללי — מסור או CNC",
  cnc: "קובץ CNC — ליאור",
  manual: "ידני במסור",
};

/** assigned_to = null means "כללי": the whole team sees it until someone takes it. */
export const GENERAL_ASSIGNEE_LABEL = "כללי — כל הצוות";

export const EXTRA_STATUS_LABEL: Record<string, string> = {
  open: "פתוח", work: "בעבודה", done: "בוצע", cancelled: "בוטל",
};

export const EXTRA_STATUS_COLOR: Record<string, string> = {
  open: "var(--stop)", work: "var(--work)", done: "var(--go)", cancelled: "var(--idle)",
};
