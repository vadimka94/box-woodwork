"use client";

import { must } from "@/lib/action-result";
import { useState, useTransition } from "react";
import { resolveBlock } from "@/app/actions";

/** Closing a problem. The stage goes back to orange and the log keeps who fixed it. */
export function ResolveBlock({ blockId }: { blockId: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      <button className="btn btn-go" disabled={pending}
        onClick={() => start(async () => {
          try { await must(resolveBlock(blockId)); } catch (e: any) { setErr(e.message); }
        })}>
        {pending ? "מסמן…" : "סמן שטופל"}
      </button>
      {err && <div style={{ color: "#F0897A", fontSize: 12, marginTop: 6 }}>{err}</div>}
    </>
  );
}
