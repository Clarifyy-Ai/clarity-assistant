-- 1. Pin search_path on remaining public functions
ALTER FUNCTION public.set_updated_at_topic_mastery() SET search_path = public;
ALTER FUNCTION public.set_updated_at_exam_readiness() SET search_path = public;
ALTER FUNCTION public.set_updated_at_preparation_plans() SET search_path = public;
ALTER FUNCTION public.compute_gov_bank_readiness_status(bigint, integer) SET search_path = public;

-- 2. Remove anonymous EXECUTE on non-public SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.profiles_own_update_allowed(public.profiles) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.profiles_own_update_allowed(public.profiles) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_gov_exam_bank_readiness(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gov_exam_bank_readiness(uuid) TO authenticated, service_role;

-- 3. Prevent participants from escalating their own role
DROP POLICY IF EXISTS rp_update ON public.room_participants;
CREATE POLICY rp_update ON public.room_participants
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.prevent_room_participant_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Changing participant role is not allowed';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Changing participant user is not allowed';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_room_participant_role_escalation() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_room_participants_no_role_escalation ON public.room_participants;
CREATE TRIGGER trg_room_participants_no_role_escalation
  BEFORE UPDATE ON public.room_participants
  FOR EACH ROW EXECUTE FUNCTION public.prevent_room_participant_role_escalation();