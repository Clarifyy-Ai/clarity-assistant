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
  description: string,
): Promise<boolean> {
  // Check current balance
  const { data: profile } = await db
    .from("profiles")
    .select("credits")
    .eq("id", userId)
    .single();

  if (!profile || (profile.credits ?? 0) < amount) return false;

  const newBalance = (profile.credits ?? 0) - amount;

  // Deduct
  const { error } = await db
    .from("profiles")
    .update({ credits: newBalance, credits_used_this_month: profile.credits_used_this_month + amount })
    .eq("id", userId);

  if (error) return false;

  // Log transaction with correct column names
  await db.from("credit_transactions").insert({
    user_id: userId,
    amount: -amount,
    balance_after: newBalance,
    action: "usage",
    description,
  });

  return true;
}
