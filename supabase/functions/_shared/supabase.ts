import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export function createServiceClient() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function deductCredits(
  db: ReturnType<typeof createClient>,
  userId: string,
  amount: number,
  reason: string,
): Promise<boolean> {
  // Check current balance
  const { data: profile } = await db
    .from("profiles")
    .select("credits")
    .eq("id", userId)
    .single();

  if (!profile || (profile.credits ?? 0) < amount) return false;

  // Deduct
  const { error } = await db
    .from("profiles")
    .update({ credits: (profile.credits ?? 0) - amount })
    .eq("id", userId);

  if (error) return false;

  // Log transaction
  await db.from("credit_transactions").insert({
    user_id: userId,
    amount: -amount,
    reason,
  });

  return true;
}
