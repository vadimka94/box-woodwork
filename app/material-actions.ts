"use server";

import { revalidatePath } from "next/cache";
import { safe } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";

/** The board can only cut what has arrived, so ordering is an explicit act. */
async function orderMaterialImpl(projectId: string, eta: string, note: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("order_material", {
    pid: projectId, eta: eta || null, note: note || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

async function materialArrivedImpl(projectId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("material_arrived", { pid: projectId });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/** The contractor wants a change. Round two, on the record. */
async function newSketchRoundImpl(projectId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("new_sketch_round", { pid: projectId });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/* ---------- public actions: return the Hebrew error instead of throwing (see lib/action-result.ts) ---------- */

export async function orderMaterial(projectId: string, eta: string, note: string) {
  return safe(() => orderMaterialImpl(projectId, eta, note));
}

export async function materialArrived(projectId: string) {
  return safe(() => materialArrivedImpl(projectId));
}

export async function newSketchRound(projectId: string) {
  return safe(() => newSketchRoundImpl(projectId));
}
