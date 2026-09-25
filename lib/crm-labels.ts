/**
 * CRM vocabulary. Labels only — safe to import from client components.
 *
 * The private-client path follows how Vadim actually sells: a WhatsApp message,
 * a request for measurements, a rough price, then the home visit where the deal
 * is almost always closed. The visit is the turning point, so everything before
 * it is where follow-up matters most.
 */

export type LeadKind = "private" | "contractor";
export type LeadStage =
  | "new" | "waiting_info" | "estimate_sent" | "meeting_set"
  | "meeting_done" | "awaiting_payment" | "won" | "lost";

export const STAGES: Record<LeadKind, LeadStage[]> = {
  private: ["new", "waiting_info", "estimate_sent", "meeting_set", "meeting_done", "awaiting_payment", "won"],
  /* contractors skip the home visit */
  contractor: ["new", "estimate_sent", "awaiting_payment", "won"],
};

const PRIVATE_LABEL: Record<LeadStage, string> = {
  new: "פנייה חדשה",
  waiting_info: "ממתין למידות ופרטים",
  estimate_sent: "הערכת מחיר נשלחה",
  meeting_set: "פגישה נקבעה",
  meeting_done: "פגישה בוצעה — מחיר סופי",
  awaiting_payment: "חוזה נחתם — ממתין להעברה",
  won: "מקדמה התקבלה",
  lost: "לא נסגר",
};

const CONTRACTOR_LABEL: Record<LeadStage, string> = {
  ...PRIVATE_LABEL,
  estimate_sent: "הצעת מחיר נשלחה",
  awaiting_payment: "מחיר אושר — ממתין להעברה",
};

export const stageLabel = (kind: string, stage: string) =>
  (kind === "contractor" ? CONTRACTOR_LABEL : PRIVATE_LABEL)[stage as LeadStage] ?? stage;

export const STAGE_COLOR: Record<string, string> = {
  new: "var(--stop)",
  waiting_info: "var(--work)",
  estimate_sent: "var(--work)",
  meeting_set: "var(--bronze)",
  meeting_done: "var(--bronze)",
  awaiting_payment: "var(--bronze)",
  won: "var(--go)",
  lost: "var(--dim)",
};

/** Before the home visit, a deal that sits still is a deal that goes cold. */
export const EARLY_STAGES: LeadStage[] = ["new", "waiting_info", "estimate_sent"];
export const STALE_DAYS = 3;

export const KIND_LABEL: Record<LeadKind, string> = {
  private: "לקוח פרטי",
  contractor: "קבלן",
};

export const STYLE_LABEL: Record<string, string> = {
  cladding: "חיפויים",
  carpentry: "נגרות",
  combined: "משולב — חיפויים ונגרות",
};

export const SOURCE_OPTIONS = [
  "לא ידוע", "אינסטגרם", "פייסבוק", "המלצה של לקוח", "גוגל", "קבלן", "לקוח חוזר", "אחר",
];

export const LOST_REASONS: Record<string, string> = {
  price: "מחיר",
  no_reply: "הפסיק לענות",
  timing: "זמן אספקה",
  competitor: "בחר מישהו אחר",
  postponed: "דחה את העבודה",
  other: "אחר",
};

export const FILE_KIND_LABEL: Record<string, string> = {
  measure: "מידות ותמונות מהפגישה",
  transfer: "אישור העברה",
  contract: "חוזה",
  other: "אחר",
};

export const EVENT_LABEL: Record<string, string> = {
  created: "פנייה נפתחה",
  stage: "מעבר שלב",
  note: "הערה",
  call: "שיחה",
  whatsapp: "וואטסאפ",
  meeting: "פגישה",
  file: "קובץ",
  won: "נסגר — פרויקט נפתח",
  lost: "סומן כלא נסגר",
  reopen: "נפתח מחדש",
};

/* ---------- small helpers ---------- */

/** 052-1234567 → 972521234567, for wa.me links. */
export function waNumber(phone: string | null | undefined) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("972")) return digits;
  return `972${digits.replace(/^0/, "")}`;
}

export const waLink = (phone: string | null | undefined) => {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}` : null;
};

export const wazeLink = (address: string | null | undefined) =>
  address ? `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes` : null;

export const money = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === "" ? "—" : `₪${Number(n).toLocaleString("he-IL")}`;

const TZ = "Asia/Jerusalem";

export const fmtDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("he-IL", {
        timeZone: TZ, weekday: "short", day: "numeric", month: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "—";

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("he-IL", { timeZone: TZ, day: "numeric", month: "numeric", year: "2-digit" }) : "—";

/** Today's date in Israel as yyyy-mm-dd — the server runs in UTC. */
export const todayIL = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: TZ });

export const daysSince = (iso: string | null | undefined) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : 0;

/** A value for <input type="datetime-local"> in Israel time. */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Standard delivery is 26 business days from the deposit. Israel works Sunday to Thursday. */
export function addBusinessDays(days: number, from = new Date()) {
  const d = new Date(`${from.toLocaleDateString("en-CA", { timeZone: TZ })}T12:00:00Z`);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 5 && wd !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}
