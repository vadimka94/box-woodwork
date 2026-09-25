"use client";

import { must } from "@/lib/action-result";
import { useState, useTransition } from "react";
import { updateProjectDetails } from "@/app/project-actions";

/**
 * Edit name, client and due date after the project exists.
 * Opens by itself on a draft that is missing something the approval needs.
 */
export function ProjectDetails({ project, isContractor }: { project: any; isContractor: boolean }) {
  const missing = !project.due_date || !project.client_name;
  const [open, setOpen] = useState(project.status === "draft" && missing);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}
        style={{ marginBottom: 16, marginInlineEnd: 10 }}>
        עריכת פרטי הפרויקט
      </button>
    );
  }

  return (
    <form className="panel" style={{ marginBottom: 16, borderColor: missing ? "rgba(201,146,79,.6)" : undefined }}
      action={(fd) => start(async () => {
        setErr(null); setSaved(false);
        try {
          await must(updateProjectDetails(project.id, fd));
          setSaved(true);
          if (fd.get("due_date") && fd.get("client_name")) setTimeout(() => setOpen(false), 900);
        } catch (e: any) { setErr(e?.message ?? "שגיאה"); }
      })}>
      <h4 className="mono">פרטי הפרויקט</h4>
      {missing && (
        <div className="lockbar" style={{ marginBottom: 14 }}>
          כדי לאשר את הפרויקט לייצור חסר {!project.due_date ? "תאריך יעד" : "שם לקוח"}. ממלאים כאן ושומרים.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
        <Field label="שם הפרויקט *" name="name" value={project.name} required />
        <Field label="תאריך יעד *" name="due_date" value={project.due_date} type="date" required />
        <Field label={isContractor ? "קבלן *" : "לקוח *"} name="client_name" value={project.client_name} required />
        <Field label="טלפון" name="client_phone" value={project.client_phone} type="tel" />
        <Field label={isContractor ? "אתר" : "עיר"} name="city" value={project.city} />
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
        <button className="btn btn-primary" disabled={pending}>{pending ? "שומר…" : "שמור"}</button>
        {!missing && <button type="button" className="btn" onClick={() => setOpen(false)}>סגור</button>}
        {saved && <span style={{ fontSize: 13, color: "var(--go)" }}>נשמר ✓</span>}
      </div>
      {err && <div style={{ color: "#B03B2C", fontSize: 13, marginTop: 10 }}>{err}</div>}
    </form>
  );
}

function Field({ label, name, value, type = "text", required }: {
  label: string; name: string; value: string | null; type?: string; required?: boolean;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", marginBottom: 7 }}>{label}</label>
      <input name={name} type={type} defaultValue={value ?? ""} required={required} />
    </div>
  );
}
