import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { getDefaults } from "@/lib/team";
import { RulesEditor } from "@/components/RulesEditor";

export default async function RulesPage() {
  const me = await currentUser();
  if (!me || me.role !== "admin") redirect("/tasks");
  const data = await getDefaults();

  return (
    <>
      <h1>הגדרות שיוך</h1>
      <div style={{ color: "var(--steel)", fontSize: 14, marginTop: -14, marginBottom: 24, lineHeight: 1.7, maxWidth: 620 }}>
        מי מקבל כל שלב כשנפתח פרויקט חדש. אפשר תמיד לשנות שלב בודד בתוך הפרויקט עצמו —
        זו רק נקודת ההתחלה.
      </div>
      <RulesEditor {...data} />
    </>
  );
}
