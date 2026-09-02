-- Prep Lab / Answer Bank persistence: flat folders, projects, coding history.

-- ─── Answer Bank folders (flat) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.answer_bank_folders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT answer_bank_folders_name_nonempty CHECK (char_length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS answer_bank_folders_user_sort_idx
  ON public.answer_bank_folders (user_id, sort_order ASC, created_at ASC);

CREATE UNIQUE INDEX IF NOT EXISTS answer_bank_folders_user_name_uidx
  ON public.answer_bank_folders (user_id, lower(trim(name)));

ALTER TABLE public.answer_bank_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS answer_bank_folders_owner_all ON public.answer_bank_folders;
CREATE POLICY answer_bank_folders_owner_all
  ON public.answer_bank_folders FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.answer_bank_folders TO authenticated;
GRANT ALL ON public.answer_bank_folders TO service_role;

ALTER TABLE public.answer_bank
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.answer_bank_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS answer_bank_user_folder_idx
  ON public.answer_bank (user_id, folder_id)
  WHERE deleted_at IS NULL;

-- ─── Prep Project Builder ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.prep_projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_name  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT '',
  tech_stack    JSONB NOT NULL DEFAULT '[]'::jsonb,
  description   TEXT NOT NULL DEFAULT '',
  impact        TEXT NOT NULL DEFAULT '',
  github_url    TEXT NOT NULL DEFAULT '',
  showcase      TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT prep_projects_name_nonempty CHECK (char_length(trim(project_name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS prep_projects_user_name_uidx
  ON public.prep_projects (user_id, lower(trim(project_name)));

CREATE INDEX IF NOT EXISTS prep_projects_user_updated_idx
  ON public.prep_projects (user_id, updated_at DESC);

ALTER TABLE public.prep_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prep_projects_owner_all ON public.prep_projects;
CREATE POLICY prep_projects_owner_all
  ON public.prep_projects FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prep_projects TO authenticated;
GRANT ALL ON public.prep_projects TO service_role;

-- ─── Coding Hints AI history ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.prep_coding_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  problem_slug  TEXT NOT NULL,
  depth         TEXT,
  hint_text     TEXT NOT NULL DEFAULT '',
  solution_text TEXT NOT NULL DEFAULT '',
  provider      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS prep_coding_history_user_slug_uidx
  ON public.prep_coding_history (user_id, problem_slug);

CREATE INDEX IF NOT EXISTS prep_coding_history_user_updated_idx
  ON public.prep_coding_history (user_id, updated_at DESC);

ALTER TABLE public.prep_coding_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prep_coding_history_owner_all ON public.prep_coding_history;
CREATE POLICY prep_coding_history_owner_all
  ON public.prep_coding_history FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prep_coding_history TO authenticated;
GRANT ALL ON public.prep_coding_history TO service_role;
