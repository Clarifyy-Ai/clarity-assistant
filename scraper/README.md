# Clarity.AI – Gov Exam Scraper

A standalone FastAPI service that scrapes past government-exam question papers
(UPSC, SSC, GATE, IBPS, RBI, State PSC, …), extracts questions / answers /
images and ingests them into the Clarity.AI Supabase backend
(`exam_papers`, `questions`, `exam_images`).

It is intentionally **separate** from the React/Next.js app and **does not**
touch the frontend bundle, Supabase migrations, or the overlay aesthetic.

## Quickstart (local)

```bash
cp .env.example .env
# fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
docker compose up --build
```

The service listens on `http://localhost:8000`.

## Endpoints

| Method | Path                    | Auth        |
|--------|-------------------------|-------------|
| POST   | `/scrape/start`         | Admin JWT   |
| GET    | `/scrape/{job_id}`      | Admin JWT   |
| POST   | `/scrape/{job_id}/pause` | Admin JWT  |
| POST   | `/scrape/{job_id}/resume`| Admin JWT  |
| POST   | `/scrape/{job_id}/cancel`| Admin JWT  |
| GET    | `/health`               | none        |
| GET    | `/metrics`              | none        |

### Start a scrape

```bash
curl -X POST http://localhost:8000/scrape/start \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"exam_type":"UPSC","year_from":2018,"year_to":2024}'
```

## Adding a new source parser

1. Create `app/scraper/sources/<exam>.py` exporting a class that extends
   `BaseScraper`.
2. Implement `discover(year_from, year_to)` → iterable of `PaperCandidate`
   (paper_url, paper_metadata).
3. Implement `parse(paper)` → `ParsedPaper` (questions, answers, images).
4. Register it in `app/scraper/sources/__init__.py` under its `exam_type` id.

## Required DB schema (already present in Clarity.AI)

The pipeline writes to existing tables. If you are running against a fresh
Supabase project, apply this DDL first:

```sql
-- exam_papers, questions already exist. Add:
CREATE TABLE IF NOT EXISTS public.exam_images (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id     uuid REFERENCES public.exam_papers(id) ON DELETE CASCADE,
  question_id  uuid REFERENCES public.questions(id)   ON DELETE CASCADE,
  storage_path text NOT NULL,
  public_url   text NOT NULL,
  alt_text     text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.exam_images TO anon, authenticated;
GRANT ALL ON public.exam_images TO service_role;
ALTER TABLE public.exam_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exam_images public read"
  ON public.exam_images FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.scrape_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_type     text NOT NULL,
  year_from     int,
  year_to       int,
  status        text NOT NULL DEFAULT 'queued',
  progress      jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.scrape_jobs TO service_role;
ALTER TABLE public.scrape_jobs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.scrape_failures (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid REFERENCES public.scrape_jobs(id) ON DELETE CASCADE,
  source_url  text NOT NULL,
  status_code int,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.scrape_failures TO service_role;
ALTER TABLE public.scrape_failures ENABLE ROW LEVEL SECURITY;

-- Idempotency: prevent duplicate ingestion
CREATE UNIQUE INDEX IF NOT EXISTS questions_source_hash_uidx
  ON public.questions ((md5(coalesce(question_text,'') || coalesce(exam_type,'') || coalesce(source_year::text,''))));
```

## Environment variables

See `.env.example`. All values are required except where defaults are noted.

## Observability

- Structured JSON logs on stdout (parsed by Loki / Cloud Logging).
- Prometheus metrics at `/metrics`:
  - `scrape_papers_total`, `scrape_questions_total`, `scrape_images_total`
  - `scrape_errors_total`, `scrape_retries_total`

## Security notes

- Admin JWTs are verified against Supabase JWKS; the user's id is then
  cross-checked against `public.user_roles` via the service-role client.
- Never logs Authorization headers, JWTs, or PDF/image bytes.
- All filenames are sanitized to `[A-Za-z0-9._-]` before being used as
  storage paths.
