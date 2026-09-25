import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { getTeamBoard } from "@/lib/team";
import { ResolveBlock } from "@/components/ResolveBlock";
import { REASON_LABEL, t, type Lang } from "@/lib/i18n";
import { colorOf } from "@/lib/types";

const since = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m} דק׳` : m < 1440 ? `${Math.floor(m / 60)} שע׳` : `${Math.floor(m / 1440)} ימים`;
};

/** Who is holding what, and where the work is stuck. */
export default async function TeamPage() {
  const me = await currentUser();
  if (!me || me.role !== "admin") redirect("/tasks");
  const lang = (me.lang ?? "he") as Lang;
  const rows = await getTeamBoard();

  return (
    <>
      <h1>עובדים</h1>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))" }}>
        {rows.map((r) => {
          const tone = r.stopped.length ? "var(--stop)"
            : r.working.length ? "var(--work)"
              : r.waiting.length ? "var(--bronze)" : "var(--go)";

          return (
            <div className="panel" key={r.profile.id} style={{ borderColor: tone }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontFamily: "var(--display)", fontSize: 22 }}>{r.profile.full_name}</div>
                  <div className="mono" style={{ fontSize: 10, color: "var(--dim)", marginTop: 4 }}>
                    {(r.profile.title ?? []).join(" · ")}
                  </div>
                  <Link href={`/team/${r.profile.id}`} className="btn"
                    style={{ textDecoration: "none", display: "inline-block", marginTop: 10, padding: "8px 13px", fontSize: 11 }}>
                    היכנס למסך שלו ←
                  </Link>
                </div>
                {r.stopped.length ? <span className="chip stop">תקוע · {r.stopped.length}</span>
                  : r.working.length ? <span className="chip work">בעבודה · {r.working.length}</span>
                    : <span className="chip go">פנוי</span>}
              </div>

              <div className="mono" style={{ display: "flex", gap: 18, margin: "18px 0 6px", fontSize: 11, color: "var(--steel)", flexWrap: "wrap" }}>
                <Count n={r.working.length} label="בעבודה" color="var(--work)" />
                <Count n={r.stopped.length} label="תקוע" color="var(--stop)" />
                <Count n={r.done} label="בוצע" color="var(--go)" />
                <Count n={r.waiting.length} label="בהמתנה" color="var(--steel)" />
              </div>

              <div style={{ marginTop: 6 }}>
                {[...r.stopped, ...r.working, ...r.waiting].map((s: any) => (
                  <div key={s.id} style={{ padding: "11px 0", borderBottom: "1px solid var(--line-soft)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span className={s.status === "stop" ? "blink" : ""}
                        style={{ width: 10, height: 10, borderRadius: 99, background: colorOf(s.status) }} />
                      <span style={{ fontSize: 14, color: colorOf(s.status), minWidth: 80 }}>
                        {t(s.name, lang)}
                      </span>
                      <Link href={`/projects/${s.project?.code}`} className="mono"
                        style={{ flex: 1, minWidth: 0, fontSize: 11, color: "var(--steel)", textDecoration: "none",
                                 overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                        {s.project?.code} · {s.item?.name ?? s.project?.name}
                      </Link>
                    </div>

                    {s.block && (
                      <div style={{
                        marginTop: 8, padding: "12px 14px", borderRadius: 12, fontSize: 13, lineHeight: 1.7,
                        background: "rgba(216,80,63,.1)", border: "1px solid rgba(216,80,63,.28)", color: "#8E2E20",
                      }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginBottom: 8 }}>
                          <span className="chip stop">{REASON_LABEL[s.block.reason_code]}</span>
                          <span className="mono" style={{ fontSize: 10 }}>{since(s.block.reported_at)}</span>
                        </div>
                        ◆ {s.block.note}
                        <div style={{ marginTop: 10 }}>
                          <ResolveBlock blockId={s.block.id} />
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {![...r.stopped, ...r.working, ...r.waiting].length && (
                  <div style={{ fontSize: 13, color: "var(--steel)", padding: "12px 0" }}>
                    אין שלבים משויכים.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Count({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <span>
      <b style={{ fontSize: 19, color, fontWeight: 400 }}>{n}</b> {label}
    </span>
  );
}
