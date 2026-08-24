-- A user has one authoritative practice plan.  This closes the race where
-- two tabs both load before either tab creates the plan/items.
DO $$
DECLARE
  duplicate RECORD;
BEGIN
  FOR duplicate IN
    SELECT user_id, array_agg(id ORDER BY created_at DESC, id DESC) AS ids
    FROM public.interview_practice_plans
    GROUP BY user_id
    HAVING count(*) > 1
  LOOP
    UPDATE public.interview_practice_plan_items
    SET plan_id = duplicate.ids[1]
    WHERE plan_id = ANY(duplicate.ids[2:]);

    DELETE FROM public.interview_practice_plans
    WHERE user_id = duplicate.user_id
      AND id <> duplicate.ids[1];
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS interview_practice_plans_one_per_user
  ON public.interview_practice_plans (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS interview_practice_plan_items_title_per_plan
  ON public.interview_practice_plan_items (plan_id, title);
