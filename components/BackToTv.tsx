"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * A detail page opened from the wall screen must not stay there all day.
 * Big bilingual button back, plus a countdown that returns on its own;
 * any touch restarts the countdown.
 */
export function BackToTv({ seconds = 90 }: { seconds?: number }) {
  const router = useRouter();
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    const reset = () => setLeft(seconds);
    const tick = setInterval(() => setLeft((s) => s - 1), 1000);
    window.addEventListener("pointerdown", reset);
    window.addEventListener("keydown", reset);
    return () => {
      clearInterval(tick);
      window.removeEventListener("pointerdown", reset);
      window.removeEventListener("keydown", reset);
    };
  }, [seconds]);

  useEffect(() => {
    if (left <= 0) router.push("/tv");
  }, [left, router]);

  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 40, display: "flex", alignItems: "center", gap: 18,
      justifyContent: "space-between", padding: "14px clamp(16px,3vw,40px)",
      background: "#0E1013", color: "#F4F2EE", borderBottom: "1px solid #2B2F36",
    }}>
      <button onClick={() => router.push("/tv")} style={{
        fontSize: 22, padding: "14px 26px", borderRadius: 14, cursor: "pointer",
        background: "linear-gradient(180deg,#E9C68F,#C9924F)", color: "#141007",
        border: "1px solid #96632F", fontWeight: 700,
      }}>
        → חזרה למסך המפעל · Назад к экрану цеха
      </button>
      <span style={{ fontFamily: "var(--mono)", fontSize: 16, color: "#AFB6C0" }}>
        חוזר בעוד {Math.max(0, left)} שנ׳ · возврат через {Math.max(0, left)} сек
      </span>
    </div>
  );
}
