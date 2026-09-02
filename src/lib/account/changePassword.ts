import { changePasswordSchema } from "@/lib/validators/authSchemas";
import { supabase } from "@/lib/supabase/client";

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; message: string };

function publicPasswordError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "Failed to update password.";
  // Never echo credentials if a provider includes them in an error string.
  return raw.replace(/password[^\s]*/gi, "password").slice(0, 180);
}

/**
 * Change the signed-in user's password via TLS POST bodies (GoTrue).
 * Secrets stay in the JSON body only — never query strings, storage, or logs.
 */
export async function changeAccountPassword(input: {
  email: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<ChangePasswordResult> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: input.currentPassword,
    newPassword: input.newPassword,
    confirmPassword: input.confirmPassword,
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Password does not meet requirements.",
    };
  }

  const email = input.email.trim();
  if (!email) {
    return { ok: false, message: "Your session has expired. Please sign in again." };
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.currentPassword,
  });
  if (verifyError) {
    return { ok: false, message: "Current password is incorrect." };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });
  if (error) {
    return { ok: false, message: publicPasswordError(error) };
  }

  return { ok: true };
}
