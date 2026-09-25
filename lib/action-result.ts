/**
 * Why this exists: in production, Next.js replaces the message of any error
 * thrown inside a server action with a generic English sentence ("An error
 * occurred in the Server Components render…"). The Hebrew reason we wrote
 * never reached the screen.
 *
 * So every server action returns its outcome instead of throwing it:
 *   { ok: true, data }  or  { ok: false, error: "הסיבה בעברית" }
 * and the client turns a failure back into an error with must().
 */

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

/** Server side: run the action body and capture its error message. */
export async function safe<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e: any) {
    /* redirect() and notFound() work by throwing — let those through */
    if (typeof e?.digest === "string" && e.digest.startsWith("NEXT_")) throw e;
    console.error("server action failed:", e?.message ?? e);
    return { ok: false, error: e?.message || "שגיאה לא ידועה" };
  }
}

/** Client side: await an action and throw its Hebrew message if it failed. */
export async function must<T>(p: Promise<ActionResult<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

/** For buttons with no error line on screen: show the reason in a popup. */
export async function orAlert<T>(p: Promise<ActionResult<T>>): Promise<void> {
  const r = await p;
  if (!r.ok) alert(r.error);
}
