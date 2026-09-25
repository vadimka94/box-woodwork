"use client";

import { must, orAlert } from "@/lib/action-result";
import { useRef, useState, useTransition } from "react";
import { uploadPlanFiles, deletePlanFile } from "@/app/plans-actions";

export function PlanUpload({ projectId, folderId, folderName }: {
  projectId: string; folderId: string; folderName: string;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form ref={ref} className="panel"
      action={(fd) => start(async () => {
        try { await must(uploadPlanFiles(projectId, folderId, fd)); ref.current?.reset(); setNames([]); }
        catch (e: any) { setErr(e.message); }
      })}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label className="btn" style={{
          display: "inline-flex", gap: 8, cursor: "pointer",
          borderStyle: "dashed", borderColor: "rgba(201,146,79,.5)", color: "var(--bronze-lt)",
        }}>
          + בחר קבצים ל{folderName}
          <input name="files" type="file" multiple hidden
            accept="image/*,application/pdf,.skp,.dwg,.dxf"
            onChange={(e) => setNames([...(e.target.files ?? [])].map((f) => f.name))} />
        </label>

        {names.length > 0 && (
          <button className="btn btn-primary" disabled={pending}>
            {pending ? "מעלה…" : `העלה ${names.length} קבצים`}
          </button>
        )}
      </div>

      {names.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 13, color: "var(--steel)", lineHeight: 1.8 }}>
          {names.join(" · ")}
        </div>
      )}
      {err && <div style={{ color: "#F0897A", fontSize: 13, marginTop: 10 }}>{err}</div>}
    </form>
  );
}

export function DeleteFile({ fileId, name }: { fileId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn" style={{ padding: "7px 12px", fontSize: 10 }} disabled={pending}
      onClick={() => { if (confirm(`למחוק את "${name}"?`)) start(() => orAlert(deletePlanFile(fileId))); }}>
      מחק
    </button>
  );
}
