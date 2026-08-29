/**
 * Central Admin audit writer for portal mutations outside gov-exam adminOps.
 */
import { supabase } from "@/lib/supabase/client";

export type AdminAuditPayload = {
  action: string;
  targetType: string;
  targetId: string;
  oldValue?: unknown;
  newValue?: unknown;
};

export async function writeAdminAudit(payload: AdminAuditPayload): Promise<{
  ok: boolean;
  error?: string;
}> {
  const { data: auth } = await supabase.auth.getUser();
  const adminId = auth.user?.id;
  if (!adminId) return { ok: false, error: "Not authenticated" };

  let actorRole = "user";
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin) actorRole = "admin";
  else {
    const { data: isModerator } = await supabase.rpc("is_moderator");
    if (isModerator) actorRole = "moderator";
  }

  const newValue =
    payload.newValue && typeof payload.newValue === "object" && !Array.isArray(payload.newValue)
      ? { ...(payload.newValue as Record<string, unknown>), actorRole }
      : { value: payload.newValue ?? null, actorRole };

  const { error } = await supabase.from("admin_audit_log").insert({
    admin_id: adminId,
    action: payload.action,
    target_type: payload.targetType,
    target_id: payload.targetId,
    old_value: (payload.oldValue ?? null) as never,
    new_value: newValue as never,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
