-- Revoke client EXECUTE on server-only SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.add_credits(uuid, integer, public.credit_action, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_expired_session_data() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bulk_update_users(uuid[], jsonb) FROM PUBLIC, anon, authenticated;

-- Patch mark_notifications_read: ignore caller-supplied user_id, always use auth.uid()
CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  -- Ignore p_user_id; always scope to caller to prevent privilege escalation
  UPDATE public.notifications
     SET is_read = TRUE, read_at = NOW()
   WHERE user_id = v_uid AND is_read = FALSE;
END;
$function$;