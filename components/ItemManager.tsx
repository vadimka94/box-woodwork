"use client";

import { must, orAlert } from "@/lib/action-result";
import { useRef, useState, useTransition } from "react";
import { addItem, deleteItem, addPhotos } from "@/app/project-actions";

/** Adding an item, with the field measurement photos attached on the spot. */
export function AddItem({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button className="btn btn-primary" onClick={() => setOpen(true)} style={{ marginTop: 14 }}>
        + הוסף פריט
      </button>
    );
  }

  return (
    <form ref={formRef} className="panel" style={{ marginTop: 14 }}
      action={(fd) => start(async () => {
        try {
          files.forEach((f) => fd.append("photos", f));
          await must(addItem(projectId, fd));
          formRef.current?.reset(); setFiles([]); setOpen(false);
        } catch (e: any) { setErr(e.message); }
      })}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input name="name" placeholder="ארונות תחתונים" required style={{ flex: 1, minWidth: 180 }} />
        <input name="qty" type="number" min={1} defaultValue={1} placeholder="כמות" style={{ maxWidth: 90 }} />
      </div>

      <textarea name="note" rows={2} placeholder="הערה לפריט — גוון, פרזול, אילוץ מיוחד"
        style={{ marginTop: 12 }} />

      <label className="btn" style={{
        display: "inline-flex", gap: 8, marginTop: 12, cursor: "pointer",
        borderStyle: "dashed", borderColor: "rgba(201,146,79,.5)", color: "var(--bronze-lt)",
      }}>
        📷 תמונת מידות מהשטח
        <input type="file" accept="image/*" capture="environment" multiple hidden
          onChange={(e) => setFiles([...(e.target.files ?? [])])} />
      </label>

      {files.length > 0 && (
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 12 }}>
          {files.map((f, i) => (
            <img key={i} src={URL.createObjectURL(f)} alt="" width={92} height={92}
              style={{ borderRadius: 12, objectFit: "cover", border: "1px solid var(--line)" }} />
          ))}
        </div>
      )}

      {err && <div style={{ color: "#F0897A", fontSize: 13, marginTop: 10 }}>{err}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button className="btn btn-primary" disabled={pending}>{pending ? "שומר…" : "שמור פריט"}</button>
        <button type="button" className="btn" onClick={() => { setOpen(false); setFiles([]); }}>ביטול</button>
      </div>
    </form>
  );
}

export function DeleteItem({ itemId, name }: { itemId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn" style={{ padding: "7px 12px", fontSize: 10 }} disabled={pending}
      onClick={() => {
        if (confirm(`למחוק את "${name}" וכל השלבים שלו?`)) start(() => orAlert(deleteItem(itemId)));
      }}>מחק</button>
  );
}

/** More photos, later — sometimes you go back to site. */
export function MorePhotos({ projectId, itemId }: { projectId: string; itemId: string }) {
  const [pending, start] = useTransition();
  return (
    <label className="btn" style={{
      display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
      borderStyle: "dashed", borderColor: "rgba(201,146,79,.5)", color: "var(--bronze-lt)",
      opacity: pending ? 0.5 : 1,
    }}>
      {pending ? "מעלה…" : "📷 הוסף תמונה"}
      <input type="file" accept="image/*" capture="environment" multiple hidden
        onChange={(e) => {
          const fd = new FormData();
          [...(e.target.files ?? [])].forEach((f) => fd.append("photos", f));
          start(() => orAlert(addPhotos(projectId, itemId, fd)));
        }} />
    </label>
  );
}
