import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { NewProjectForm } from "@/components/NewProjectForm";

export default async function NewProjectPage() {
  const me = await currentUser();
  if (!me || me.role !== "admin") redirect("/tasks");

  return (
    <>
      <h1>פרויקט חדש</h1>
      <NewProjectForm />
    </>
  );
}
