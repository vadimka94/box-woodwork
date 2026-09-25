"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function signIn() {
    setBusy(true); setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { setError("המשתמש או הסיסמה לא נכונים"); return; }
    router.replace("/"); router.refresh();
  }

  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 34 }}>
          <div style={{
            fontFamily: "var(--display)", fontWeight: 900, fontSize: 40, lineHeight: 1,
            background: "linear-gradient(180deg,#F6E6C9,#C9924F 52%,#6E4620)",
            WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
          }}>BOX WOODWORK</div>
          <div style={{ marginTop: 14, fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".42em", color: "var(--steel)" }}>
            ניהול מפעל
          </div>
        </div>

        <div className="panel">
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: "var(--steel)" }}>אימייל</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)}
              type="email" autoComplete="username" style={{ marginTop: 7 }} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, color: "var(--steel)" }}>סיסמה</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && signIn()}
              type="password" autoComplete="current-password" style={{ marginTop: 7 }} />
          </div>
          {error && <div style={{ color: "#F0897A", fontSize: 13, marginBottom: 14 }}>{error}</div>}
          <button className="btn btn-primary btn-big" onClick={signIn} disabled={busy}>
            {busy ? "רגע…" : "כניסה"}
          </button>
        </div>
      </div>
    </main>
  );
}
