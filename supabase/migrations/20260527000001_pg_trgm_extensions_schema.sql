-- Move pg_trgm to the extensions schema (Supabase linter recommendation).
-- Having extensions in public causes search_path confusion and is flagged by
-- the Supabase advisor. This is safe to re-run (IF NOT EXISTS).
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;
