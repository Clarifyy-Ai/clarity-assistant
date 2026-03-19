# Database Schema

Clarity uses Supabase (PostgreSQL 15) with Row-Level Security enforced on
every table. All `user_id` columns reference `auth.users(id)` with
`ON DELETE CASCADE`.

---

## Core Tables

### `profiles`

Extends `auth.users` with app-specific user data.

```sql
CREATE TABLE profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT NOT NULL,
  full_name             TEXT,
  avatar_url            TEXT,

  -- Plan & credits
  plan_id               TEXT NOT NULL DEFAULT 'free',
  credits               INTEGER NOT NULL DEFAULT 20,
  subscription_status   TEXT,               -- active | trialing | canceled | past_due
  stripe_customer_id    TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,

  -- Onboarding
  onboarding_completed  BOOLEAN NOT NULL DEFAULT false,

  -- AI preferences
  preferred_model       TEXT NOT NULL DEFAULT 'gpt-4o',
  preferred_language    TEXT NOT NULL DEFAULT 'en-US',
  ui_preferences        JSONB NOT NULL DEFAULT '{}',
  overlay_settings      JSONB NOT NULL DEFAULT '{}',

  -- Access control
  is_admin              BOOLEAN NOT NULL DEFAULT false,

  -- Metadata (onboarding answers, extended profile)
  metadata              JSONB NOT NULL DEFAULT '{}',

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**RLS:**
```sql
-- Users can only read/write their own profile
CREATE POLICY "profiles_self" ON profiles
  USING (id = auth.uid());
```

---

### `sessions`

Interview practice sessions (mock, live rehearsal, live copilot).

```sql
CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,   -- mock | live | rehearsal | practice_room
  status        TEXT NOT NULL DEFAULT 'active',  -- active | completed | abandoned
  title         TEXT,
  target_role   TEXT,
  company       TEXT,
  interview_type TEXT,           -- behavioral | technical | mixed | hr

  -- Scoring (populated on debrief)
  overall_score INTEGER,         -- 0–100
  grade         TEXT,            -- A+ through F

  -- Timing
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ,
  duration_sec  INTEGER,

  -- Content
  metadata      JSONB NOT NULL DEFAULT '{}',

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

### `session_questions`

Questions asked during a session with user responses.

```sql
CREATE TABLE session_questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_text   TEXT NOT NULL,
  question_type   TEXT,          -- behavioral | technical | situational | hr
  answer_text     TEXT,
  answer_duration_sec INTEGER,
  score           INTEGER,       -- 0–100, populated by ai-feedback
  feedback        JSONB,         -- { strengths, improvements, rewritten }
  order_index     INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

### `answers` (Answer Bank)

User's saved and curated answers for reuse.

```sql
CREATE TABLE answers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  answer_type   TEXT,            -- star | general | technical
  tags          TEXT[] DEFAULT '{}',
  is_favourite  BOOLEAN DEFAULT false,

  -- STAR sections (nullable for non-STAR answers)
  situation     TEXT,
  task          TEXT,
  action        TEXT,
  result        TEXT,
  full_answer   TEXT NOT NULL,

  -- Source
  source_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  score         INTEGER,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

### `documents`

User-uploaded resumes and job descriptions.

```sql
CREATE TABLE documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,   -- resume | job_description
  name          TEXT NOT NULL,
  storage_path  TEXT NOT NULL,   -- Supabase Storage path
  parsed_text   TEXT,            -- extracted plain text
  metadata      JSONB DEFAULT '{}',
  is_primary    BOOLEAN DEFAULT false,  -- active resume / active JD
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

### `credit_transactions`

Immutable ledger of every credit change.

```sql
CREATE TABLE credit_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount        INTEGER NOT NULL,      -- positive = grant, negative = deduction
  balance_after INTEGER NOT NULL,
  type          TEXT NOT NULL,         -- grant | deduction | purchase | refund | bonus
  feature       TEXT,                  -- FeatureKey (deductions only)
  description   TEXT NOT NULL,
  stripe_payment_intent_id TEXT,       -- for purchase transactions
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**RLS:** Insert via service role only (edge functions). Users can SELECT their own.

---

### `interview_prep`

Scheduled interview events with prep checklists.

```sql
CREATE TABLE interview_prep (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company         TEXT NOT NULL,
  role            TEXT NOT NULL,
  interview_date  TIMESTAMPTZ NOT NULL,
  notes           TEXT,
  prep_questions  TEXT[] DEFAULT '{}',    -- AI-generated checklist
  status          TEXT DEFAULT 'pending', -- pending | completed | cancelled
  metadata        JSONB DEFAULT '{}',     -- round, durationMin, location, reminders
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

### `practice_rooms`

Collaborative peer practice rooms.

```sql
CREATE TABLE practice_rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  is_public     BOOLEAN DEFAULT true,
  max_members   INTEGER DEFAULT 4,
  status        TEXT DEFAULT 'waiting',   -- waiting | active | ended
  interview_type TEXT,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ
);

CREATE TABLE practice_room_members (
  room_id   UUID NOT NULL REFERENCES practice_rooms(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role      TEXT DEFAULT 'participant',   -- host | participant | observer
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
```

---

## RLS Policy Summary

```sql
-- Template applied to all user-owned tables
CREATE POLICY "<table>_owner" ON <table>
  FOR ALL USING (user_id = auth.uid());

-- Admins can read everything
CREATE POLICY "<table>_admin_read" ON <table>
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );
```

---

## Indexes

```sql
-- Sessions
CREATE INDEX idx_sessions_user_id   ON sessions(user_id);
CREATE INDEX idx_sessions_status    ON sessions(status);
CREATE INDEX idx_sessions_created   ON sessions(created_at DESC);

-- Answers
CREATE INDEX idx_answers_user_id    ON answers(user_id);
CREATE INDEX idx_answers_tags       ON answers USING GIN(tags);

-- Credit transactions
CREATE INDEX idx_credit_tx_user     ON credit_transactions(user_id);
CREATE INDEX idx_credit_tx_created  ON credit_transactions(created_at DESC);

-- Interview prep
CREATE INDEX idx_interview_prep_user_date
  ON interview_prep(user_id, interview_date ASC);
```

---

## Migrations

Migrations live in `supabase/migrations/`. Always generate via:

```bash
supabase migration new <descriptive_name>
# Edit the generated file, then:
supabase db push                    # apply to remote
supabase db reset                   # reset local dev DB
```

Never edit migration files after they have been applied to production.

---

## Useful Queries

```sql
-- Users by plan
SELECT plan_id, COUNT(*) FROM profiles GROUP BY plan_id;

-- MRR estimate
SELECT
  plan_id,
  COUNT(*) * CASE plan_id
    WHEN 'starter'    THEN 19
    WHEN 'pro'        THEN 39
    WHEN 'elite'      THEN 79
    WHEN 'enterprise' THEN 199
    ELSE 0
  END AS mrr_usd
FROM profiles
WHERE subscription_status = 'active'
GROUP BY plan_id;

-- Credits consumed this month per feature
SELECT feature, SUM(ABS(amount)) AS credits_used
FROM credit_transactions
WHERE type = 'deduction'
  AND created_at >= date_trunc('month', now())
GROUP BY feature
ORDER BY credits_used DESC;

-- Top users by session count
SELECT p.email, COUNT(s.id) AS sessions
FROM sessions s
JOIN profiles p ON p.id = s.user_id
GROUP BY p.email
ORDER BY sessions DESC
LIMIT 20;
```
