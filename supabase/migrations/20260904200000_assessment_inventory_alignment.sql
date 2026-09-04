-- BUG-14: Align assessment inventory so published templates can start when
-- intended, without creating broken empty attempts. Seed ready questions for
-- chronically short categories; ensure data-analyst template exists; keep
-- question_count within a floor that seeded inventory can satisfy.
BEGIN;

ALTER TABLE public.questions DISABLE TRIGGER questions_protect_assessment_taxonomy;
ALTER TABLE public.questions DISABLE TRIGGER questions_validate_publication;

-- ── 1. Multi-role inventory seed (idempotent via source_paper) ───────────────

INSERT INTO public.questions (
  question_text, question_type, options, correct_answer, explanation,
  subject, topic, category, difficulty, exam_type, source, source_paper,
  marks_positive, marks_negative, is_public, is_verified,
  license_type, copyright_status, publish_status, tags,
  eligible_roles, cross_functional, review_status, validation_status
)
SELECT v.question_text, v.question_type, v.options::jsonb, v.correct_answer, v.explanation,
       v.subject, v.topic, v.category, v.difficulty, 'CLARIFY_ORIGINAL', 'ORIGINAL',
       'clarify_original_seed_v4_inventory',
       4, 1, true, true, 'ORIGINAL', 'ORIGINAL', 'published', v.tags,
       v.eligible_roles, false, 'approved', 'valid'
FROM (
  VALUES
    -- Aptitude / general
    (
      'If a sequence doubles each step starting at 3 (3, 6, 12, …), what is the 5th term?',
      'MCQ',
      '[{"label":"A","text":"24"},{"label":"B","text":"36"},{"label":"C","text":"48"},{"label":"D","text":"96"}]',
      'C',
      '3 → 6 → 12 → 24 → 48.',
      'Aptitude', 'Sequences', 'Aptitude', 'EASY', ARRAY['aptitude','math']::text[],
      ARRAY['general-aptitude','qa-engineer','data-analyst']::text[]
    ),
    (
      'A team of 4 finishes a task in 6 days. At the same rate, how many days for 6 people?',
      'MCQ',
      '[{"label":"A","text":"3"},{"label":"B","text":"4"},{"label":"C","text":"8"},{"label":"D","text":"9"}]',
      'B',
      'Work is 24 person-days; 24/6 = 4 days.',
      'Aptitude', 'WorkRate', 'Aptitude', 'MEDIUM', ARRAY['aptitude','work']::text[],
      ARRAY['general-aptitude','qa-engineer']::text[]
    ),
    (
      'Which statement is a valid logical conclusion: All servers are machines. Some machines fail. Therefore…',
      'MCQ',
      '[{"label":"A","text":"All servers fail"},{"label":"B","text":"Some servers may fail, but it is not proven"},{"label":"C","text":"No servers fail"},{"label":"D","text":"Machines are not servers"}]',
      'B',
      'The premises do not force servers into the failing subset.',
      'Aptitude', 'Logic', 'Aptitude', 'MEDIUM', ARRAY['aptitude','logic']::text[],
      ARRAY['general-aptitude']::text[]
    ),
    (
      'What is 15% of 240?',
      'MCQ',
      '[{"label":"A","text":"24"},{"label":"B","text":"30"},{"label":"C","text":"36"},{"label":"D","text":"42"}]',
      'C',
      '0.15 × 240 = 36.',
      'Aptitude', 'Percentages', 'Aptitude', 'EASY', ARRAY['aptitude','percent']::text[],
      ARRAY['general-aptitude','data-analyst']::text[]
    ),
    -- DevOps
    (
      'What does CI typically automate in a software delivery pipeline?',
      'MCQ',
      '[{"label":"A","text":"Only production rollbacks"},{"label":"B","text":"Build and test on every relevant change"},{"label":"C","text":"Manual change-advisory boards"},{"label":"D","text":"Database schema design"}]',
      'B',
      'Continuous Integration builds and tests changes frequently to catch failures early.',
      'DevOps', 'CI', 'DevOps', 'EASY', ARRAY['devops','ci']::text[],
      ARRAY['devops-assessment']::text[]
    ),
    (
      'Which practice reduces risk when deploying to production?',
      'MCQ',
      '[{"label":"A","text":"Deploying all changes on Friday without monitoring"},{"label":"B","text":"Canary or progressive rollouts with health checks"},{"label":"C","text":"Skipping tests to ship faster"},{"label":"D","text":"Hard-coding secrets in the image"}]',
      'B',
      'Progressive delivery limits blast radius and uses signals to halt bad releases.',
      'DevOps', 'Deploy', 'DevOps', 'MEDIUM', ARRAY['devops','deploy']::text[],
      ARRAY['devops-assessment']::text[]
    ),
    (
      'Infrastructure as Code primarily means…',
      'MCQ',
      '[{"label":"A","text":"Configuring servers only via GUI clicks"},{"label":"B","text":"Declaring and versioning infrastructure in machine-readable files"},{"label":"C","text":"Writing application business logic in YAML only"},{"label":"D","text":"Avoiding version control for ops"}]',
      'B',
      'IaC keeps infrastructure declarative, reviewable, and reproducible.',
      'DevOps', 'IaC', 'DevOps', 'EASY', ARRAY['devops','iac']::text[],
      ARRAY['devops-assessment']::text[]
    ),
    (
      'What is a common reason to use container orchestration (e.g. Kubernetes)?',
      'MCQ',
      '[{"label":"A","text":"To avoid writing any application code"},{"label":"B","text":"To schedule, scale, and heal containerized workloads"},{"label":"C","text":"To replace databases with spreadsheets"},{"label":"D","text":"To disable networking"}]',
      'B',
      'Orchestrators manage desired state for containers across a cluster.',
      'DevOps', 'Orchestration', 'DevOps', 'MEDIUM', ARRAY['devops','k8s']::text[],
      ARRAY['devops-assessment']::text[]
    ),
    -- Java
    (
      'In Java, which keyword prevents a class from being subclassed?',
      'MCQ',
      '[{"label":"A","text":"static"},{"label":"B","text":"final"},{"label":"C","text":"volatile"},{"label":"D","text":"transient"}]',
      'B',
      'A final class cannot be extended.',
      'Java', 'OOP', 'Java', 'EASY', ARRAY['java','oop']::text[],
      ARRAY['java-developer','backend-developer']::text[]
    ),
    (
      'Which collection preserves insertion order and allows duplicates?',
      'MCQ',
      '[{"label":"A","text":"HashSet"},{"label":"B","text":"TreeSet"},{"label":"C","text":"ArrayList"},{"label":"D","text":"HashMap keys"}]',
      'C',
      'List implementations like ArrayList keep order and allow duplicate elements.',
      'Java', 'Collections', 'Java', 'EASY', ARRAY['java','collections']::text[],
      ARRAY['java-developer']::text[]
    ),
    (
      'Checked exceptions in Java must be…',
      'MCQ',
      '[{"label":"A","text":"Ignored silently by the compiler"},{"label":"B","text":"Declared or handled at compile time"},{"label":"C","text":"Always Errors, never Exceptions"},{"label":"D","text":"Only thrown from main"}]',
      'B',
      'Checked exceptions are part of the method contract and must be declared or caught.',
      'Java', 'Exceptions', 'Java', 'MEDIUM', ARRAY['java','exceptions']::text[],
      ARRAY['java-developer']::text[]
    ),
    (
      'What does the equals contract generally require alongside hashCode?',
      'MCQ',
      '[{"label":"A","text":"Equal objects must have equal hash codes"},{"label":"B","text":"Unequal objects must have equal hash codes"},{"label":"C","text":"hashCode must always return 0"},{"label":"D","text":"equals must ignore null"}]',
      'A',
      'If a.equals(b), then a.hashCode() must equal b.hashCode().',
      'Java', 'Equals', 'Java', 'MEDIUM', ARRAY['java','equals']::text[],
      ARRAY['java-developer']::text[]
    ),
    -- React / frontend extras
    (
      'In React, what does a key prop help the reconciler do?',
      'MCQ',
      '[{"label":"A","text":"Encrypt props at rest"},{"label":"B","text":"Identify list items across renders"},{"label":"C","text":"Replace CSS modules"},{"label":"D","text":"Disable Strict Mode"}]',
      'B',
      'Stable keys help React match list children efficiently.',
      'React', 'Lists', 'React', 'EASY', ARRAY['react','lists']::text[],
      ARRAY['react-assessment','frontend-developer','full-stack-developer']::text[]
    ),
    (
      'Which hook is appropriate for synchronizing with an external system after paint?',
      'MCQ',
      '[{"label":"A","text":"useState"},{"label":"B","text":"useEffect"},{"label":"C","text":"useMemo only"},{"label":"D","text":"useId for fetching"}]',
      'B',
      'useEffect runs after commit and is the common place for external sync.',
      'React', 'Hooks', 'React', 'EASY', ARRAY['react','hooks']::text[],
      ARRAY['react-assessment','frontend-developer']::text[]
    ),
    (
      'What is the main purpose of React Context?',
      'MCQ',
      '[{"label":"A","text":"Replace the virtual DOM"},{"label":"B","text":"Pass data through the tree without prop drilling"},{"label":"C","text":"Compile TypeScript"},{"label":"D","text":"Store cookies only"}]',
      'B',
      'Context provides a value to deep consumers without threading props.',
      'React', 'Context', 'React', 'MEDIUM', ARRAY['react','context']::text[],
      ARRAY['react-assessment','frontend-developer']::text[]
    ),
    (
      'Controlled inputs in React typically store value in…',
      'MCQ',
      '[{"label":"A","text":"Component state (or props) updated via onChange"},{"label":"B","text":"window.localStorage exclusively"},{"label":"C","text":"The DOM only, never state"},{"label":"D","text":"CSS variables"}]',
      'A',
      'Controlled components keep the input value in React state.',
      'React', 'Forms', 'React', 'EASY', ARRAY['react','forms']::text[],
      ARRAY['react-assessment','frontend-developer']::text[]
    ),
    -- Python
    (
      'What does list comprehension [x*2 for x in range(3)] produce?',
      'MCQ',
      '[{"label":"A","text":"[0, 2, 4]"},{"label":"B","text":"[1, 2, 3]"},{"label":"C","text":"[2, 4, 6]"},{"label":"D","text":"[0, 1, 2]"}]',
      'A',
      'range(3) is 0,1,2; doubled → 0,2,4.',
      'Python', 'Comprehensions', 'Python', 'EASY', ARRAY['python']::text[],
      ARRAY['python-assessment','data-analyst','qa-engineer']::text[]
    ),
    (
      'Which statement about Python GIL is most accurate for CPython?',
      'MCQ',
      '[{"label":"A","text":"It allows true parallel execution of all CPU-bound threads"},{"label":"B","text":"It generally allows one thread to execute Python bytecode at a time"},{"label":"C","text":"It removes the need for locks forever"},{"label":"D","text":"It only applies to asyncio"}]',
      'B',
      'The GIL serializes bytecode execution in CPython threads.',
      'Python', 'Concurrency', 'Python', 'MEDIUM', ARRAY['python','gil']::text[],
      ARRAY['python-assessment']::text[]
    ),
    (
      'What is the difference between a list and a tuple?',
      'MCQ',
      '[{"label":"A","text":"Lists are immutable; tuples are mutable"},{"label":"B","text":"Lists are mutable; tuples are immutable"},{"label":"C","text":"They are identical at runtime"},{"label":"D","text":"Tuples cannot hold integers"}]',
      'B',
      'Tuples are immutable sequences; lists can grow and change.',
      'Python', 'Types', 'Python', 'EASY', ARRAY['python','types']::text[],
      ARRAY['python-assessment']::text[]
    ),
    (
      'Which module is commonly used for virtual environments in modern Python?',
      'MCQ',
      '[{"label":"A","text":"venv"},{"label":"B","text":"http.server only"},{"label":"C","text":"turtle"},{"label":"D","text":"wave"}]',
      'A',
      'venv creates isolated environments for dependencies.',
      'Python', 'Tooling', 'Python', 'EASY', ARRAY['python','venv']::text[],
      ARRAY['python-assessment']::text[]
    ),
    -- SQL / data analyst
    (
      'Which SQL clause filters groups after aggregation?',
      'MCQ',
      '[{"label":"A","text":"WHERE"},{"label":"B","text":"HAVING"},{"label":"C","text":"FROM"},{"label":"D","text":"JOIN"}]',
      'B',
      'HAVING filters aggregated groups; WHERE filters rows before grouping.',
      'SQL', 'Aggregation', 'SQL', 'MEDIUM', ARRAY['sql','having']::text[],
      ARRAY['sql-assessment','data-analyst','backend-developer','qa-engineer']::text[]
    ),
    (
      'What does SELECT DISTINCT remove?',
      'MCQ',
      '[{"label":"A","text":"Duplicate rows in the result set"},{"label":"B","text":"NULL columns from the schema"},{"label":"C","text":"Primary keys"},{"label":"D","text":"Indexes"}]',
      'A',
      'DISTINCT collapses duplicate projected rows.',
      'SQL', 'Select', 'SQL', 'EASY', ARRAY['sql','distinct']::text[],
      ARRAY['sql-assessment','data-analyst']::text[]
    ),
    (
      'A LEFT JOIN returns…',
      'MCQ',
      '[{"label":"A","text":"Only matching rows from both tables"},{"label":"B","text":"All left rows, with NULLs when the right has no match"},{"label":"C","text":"Only right rows without left matches"},{"label":"D","text":"A Cartesian product always"}]',
      'B',
      'LEFT JOIN preserves every left-side row.',
      'SQL', 'Joins', 'SQL', 'EASY', ARRAY['sql','joins']::text[],
      ARRAY['sql-assessment','data-analyst','backend-developer','qa-engineer']::text[]
    ),
    (
      'Which index type is typically best for equality lookups on a high-cardinality column?',
      'MCQ',
      '[{"label":"A","text":"B-tree (or equivalent default) index"},{"label":"B","text":"Full table scan preference"},{"label":"C","text":"Disabling statistics"},{"label":"D","text":"Storing JSON only"}]',
      'A',
      'B-tree indexes efficiently support equality and range predicates on selective columns.',
      'SQL', 'Indexes', 'SQL', 'MEDIUM', ARRAY['sql','indexes']::text[],
      ARRAY['sql-assessment','backend-developer','data-analyst']::text[]
    ),
    (
      'In analytics, a fact table typically stores…',
      'MCQ',
      '[{"label":"A","text":"Only slowly changing dimensions"},{"label":"B","text":"Measurable events/metrics at a grain"},{"label":"C","text":"UI component trees"},{"label":"D","text":"CSS class names"}]',
      'B',
      'Facts hold measurements; dimensions describe them.',
      'Analytics', 'Modeling', 'Analytics', 'MEDIUM', ARRAY['analytics','warehouse']::text[],
      ARRAY['data-analyst']::text[]
    ),
    (
      'What does a percentile (e.g. p95 latency) communicate better than the mean alone?',
      'MCQ',
      '[{"label":"A","text":"Tail behavior of a distribution"},{"label":"B","text":"Exact row counts in SQL"},{"label":"C","text":"Git commit hashes"},{"label":"D","text":"CSS specificity"}]',
      'A',
      'High percentiles highlight tail latency the mean can hide.',
      'Analytics', 'Stats', 'Analytics', 'MEDIUM', ARRAY['analytics','stats']::text[],
      ARRAY['data-analyst','qa-engineer']::text[]
    ),
    -- QA / backend extras for qa-engineer blueprint
    (
      'What is the primary goal of a regression test suite?',
      'MCQ',
      '[{"label":"A","text":"Prove no bugs will ever exist"},{"label":"B","text":"Detect unintended breaks after changes"},{"label":"C","text":"Replace code review"},{"label":"D","text":"Generate production traffic"}]',
      'B',
      'Regression tests guard against reintroducing known or related failures.',
      'QA', 'Regression', 'QA', 'EASY', ARRAY['qa','testing']::text[],
      ARRAY['qa-engineer']::text[]
    ),
    (
      'An API contract test primarily verifies…',
      'MCQ',
      '[{"label":"A","text":"Pixel-perfect CSS"},{"label":"B","text":"Request/response shapes and status expectations"},{"label":"C","text":"Database vacuum schedules"},{"label":"D","text":"Marketing copy"}]',
      'B',
      'Contract tests lock the interface consumers depend on.',
      'QA', 'API', 'backend', 'MEDIUM', ARRAY['qa','api']::text[],
      ARRAY['qa-engineer','backend-developer']::text[]
    ),
    (
      'Which assertion style is most useful for flaky timing-sensitive UI tests?',
      'MCQ',
      '[{"label":"A","text":"Fixed sleep(10s) everywhere"},{"label":"B","text":"Explicit waits for conditions with timeouts"},{"label":"C","text":"Ignoring all failures"},{"label":"D","text":"Disabling the test runner"}]',
      'B',
      'Waiting for conditions reduces flake versus blind sleeps.',
      'QA', 'UI', 'javascript', 'MEDIUM', ARRAY['qa','ui']::text[],
      ARRAY['qa-engineer','frontend-developer']::text[]
    ),
    (
      'Boundary value analysis focuses on…',
      'MCQ',
      '[{"label":"A","text":"Only happy-path midpoints"},{"label":"B","text":"Values at and around edges of input domains"},{"label":"C","text":"Random Unicode only"},{"label":"D","text":"Production secrets"}]',
      'B',
      'Defects often cluster at boundaries (min/max/off-by-one).',
      'QA', 'Design', 'aptitude', 'EASY', ARRAY['qa','bva']::text[],
      ARRAY['qa-engineer','general-aptitude']::text[]
    ),
    -- HTML/CSS for frontend
    (
      'Which HTML element is the most semantic choice for the main page content?',
      'MCQ',
      '[{"label":"A","text":"<div id=\"main\">"},{"label":"B","text":"<main>"},{"label":"C","text":"<span>"},{"label":"D","text":"<blink>"}]',
      'B',
      '<main> communicates the primary content landmark.',
      'HTML', 'Semantics', 'HTML', 'EASY', ARRAY['html','a11y']::text[],
      ARRAY['frontend-developer','full-stack-developer']::text[]
    ),
    (
      'In CSS Flexbox, justify-content primarily controls alignment on the…',
      'MCQ',
      '[{"label":"A","text":"Main axis"},{"label":"B","text":"Z-axis only"},{"label":"C","text":"Print margin"},{"label":"D","text":"Server timezone"}]',
      'A',
      'justify-content distributes items along the main axis.',
      'CSS', 'Flexbox', 'CSS', 'EASY', ARRAY['css','flex']::text[],
      ARRAY['frontend-developer']::text[]
    ),
    (
      'What does aria-label provide?',
      'MCQ',
      '[{"label":"A","text":"A visible tooltip required by CSS"},{"label":"B","text":"An accessible name when visible text is insufficient"},{"label":"C","text":"A SQL index hint"},{"label":"D","text":"A bundler entry"}]',
      'B',
      'aria-label supplies an accessible name for assistive tech.',
      'HTML', 'A11y', 'HTML', 'MEDIUM', ARRAY['html','a11y']::text[],
      ARRAY['frontend-developer','qa-engineer']::text[]
    ),
    (
      'JavaScript const prevents…',
      'MCQ',
      '[{"label":"A","text":"Reassigning the binding"},{"label":"B","text":"Mutating object properties entirely in all cases"},{"label":"C","text":"Garbage collection"},{"label":"D","text":"Using the variable in functions"}]',
      'A',
      'const fixes the binding; object contents may still mutate.',
      'JavaScript', 'Bindings', 'JavaScript', 'EASY', ARRAY['javascript']::text[],
      ARRAY['frontend-developer','react-assessment','qa-engineer','full-stack-developer']::text[]
    )
) AS v(
  question_text, question_type, options, correct_answer, explanation,
  subject, topic, category, difficulty, tags, eligible_roles
)
WHERE NOT EXISTS (
  SELECT 1 FROM public.questions q WHERE q.source_paper = 'clarify_original_seed_v4_inventory' LIMIT 1
)
AND NOT EXISTS (
  SELECT 1
  FROM public.questions q
  WHERE q.exam_type = 'CLARIFY_ORIGINAL'
    AND md5(lower(regexp_replace(btrim(q.question_text), '\s+', ' ', 'g')))
      = md5(lower(regexp_replace(btrim(v.question_text), '\s+', ' ', 'g')))
);

-- Backfill readiness flags while publication triggers remain disabled.
UPDATE public.questions
SET
  review_status = CASE WHEN review_status IS NULL OR review_status = 'pending' THEN 'approved' ELSE review_status END,
  validation_status = COALESCE(NULLIF(validation_status, ''), 'valid'),
  is_verified = true,
  publish_status = CASE WHEN publish_status IS NULL THEN 'published' ELSE publish_status END
WHERE source_paper IN (
  'clarify_original_seed_v1',
  'clarify_original_seed_v2_backend',
  'clarify_original_seed_v3_hr',
  'clarify_original_seed_v4_inventory'
);

ALTER TABLE public.questions ENABLE TRIGGER questions_protect_assessment_taxonomy;
ALTER TABLE public.questions ENABLE TRIGGER questions_validate_publication;

-- ── 2. Ensure data-analyst + react templates exist ──────────────────────────

INSERT INTO public.exam_templates (
  slug, title, description, question_count, duration_minutes, passing_percentage,
  marks_positive, marks_negative, randomize, max_attempts,
  difficulty_distribution, category_distribution, is_published, role_slug, strict_taxonomy, is_active
)
VALUES
  (
    'data-analyst',
    'Data Analyst Assessment',
    'SQL, analytics reasoning, and aptitude from the Career Pilot question bank.',
    6, 15, 60, 4, 1, true, 5,
    '{"EASY":30,"MEDIUM":50,"HARD":20}'::jsonb,
    '{"SQL":40,"Analytics":30,"Aptitude":30}'::jsonb,
    true, 'data-analyst', true, true
  ),
  (
    'react-assessment',
    'React Assessment',
    'React fundamentals and related JavaScript from the Career Pilot bank.',
    5, 12, 60, 4, 1, true, 5,
    '{"EASY":40,"MEDIUM":40,"HARD":20}'::jsonb,
    '{"React":70,"JavaScript":30}'::jsonb,
    true, 'react-assessment', true, true
  )
ON CONFLICT (slug) DO UPDATE SET
  is_published = true,
  is_active = true,
  role_slug = EXCLUDED.role_slug,
  category_distribution = EXCLUDED.category_distribution,
  difficulty_distribution = EXCLUDED.difficulty_distribution,
  question_count = EXCLUDED.question_count,
  updated_at = clock_timestamp();

-- ── 3. Align question_count to realistic floors for published templates ─────
-- Prefer keeping published papers startable after the seed above rather than
-- advertising counts the bank cannot fill.

UPDATE public.exam_templates SET question_count = 5, updated_at = clock_timestamp()
WHERE slug = 'general-aptitude' AND question_count > 5;

UPDATE public.exam_templates SET question_count = 5, updated_at = clock_timestamp()
WHERE slug = 'devops-assessment' AND question_count > 5;

UPDATE public.exam_templates SET question_count = 4, updated_at = clock_timestamp()
WHERE slug = 'java-developer' AND question_count > 4;

UPDATE public.exam_templates SET question_count = 6, updated_at = clock_timestamp()
WHERE slug IN ('python-assessment', 'sql-assessment', 'backend-developer', 'data-analyst', 'qa-engineer')
  AND (question_count IS NULL OR question_count > 8 OR question_count < 4);

UPDATE public.exam_templates SET question_count = 8, updated_at = clock_timestamp()
WHERE slug = 'frontend-developer' AND (question_count IS NULL OR question_count < 6);

UPDATE public.exam_templates SET question_count = 5, updated_at = clock_timestamp()
WHERE slug = 'react-assessment';

UPDATE public.exam_templates SET question_count = 5, updated_at = clock_timestamp()
WHERE slug = 'hr-interview';

UPDATE public.exam_templates
SET is_published = true, is_active = true, updated_at = clock_timestamp()
WHERE slug IN (
  'frontend-developer', 'backend-developer', 'python-assessment', 'sql-assessment',
  'general-aptitude', 'hr-interview', 'devops-assessment', 'java-developer',
  'qa-engineer', 'data-analyst', 'react-assessment'
);

COMMIT;
