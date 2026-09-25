/**
 * Shown the instant a link is clicked, instead of a frozen screen.
 * The page still takes as long as it takes — but the difference between
 * "nothing happened" and "it is working" is most of what slow feels like.
 */
export default function Loading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      <div style={{
        height: 34, width: 220, borderRadius: 10, marginBottom: 10,
        background: "linear-gradient(90deg,#1A1D22,#23262C,#1A1D22)",
        backgroundSize: "200% 100%", animation: "shimmer 1.2s infinite",
      }} />
      {[0, 1, 2].map((i) => (
        <div key={i} className="panel" style={{ height: 120, opacity: 0.5 }}>
          <div style={{
            height: 14, width: "40%", borderRadius: 6,
            background: "linear-gradient(90deg,#1A1D22,#23262C,#1A1D22)",
            backgroundSize: "200% 100%", animation: "shimmer 1.2s infinite",
          }} />
        </div>
      ))}
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
  );
}
