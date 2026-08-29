import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseJsonbObject, type EligibilityRpc } from "./sessionStartEligibility.ts";

export async function rpcJson(
  db: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<{ data: EligibilityRpc; error: string | null }> {
  const { data, error } = await db.rpc(name, args);
  if (error) {
    return { data: {}, error: error.message };
  }
  return { data: parseJsonbObject(data), error: null };
}
