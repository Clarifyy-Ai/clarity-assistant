-- Privacy-safe cleanup of legacy BYOK columns on profiles (if present).
-- Does not drop columns (may be pinned by prior migrations); nulls values only.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'byok_openai'
  ) THEN
    EXECUTE 'UPDATE public.profiles SET byok_openai = NULL WHERE byok_openai IS NOT NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'byok_anthropic'
  ) THEN
    EXECUTE 'UPDATE public.profiles SET byok_anthropic = NULL WHERE byok_anthropic IS NOT NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'byok_gemini'
  ) THEN
    EXECUTE 'UPDATE public.profiles SET byok_gemini = NULL WHERE byok_gemini IS NOT NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'byok_key_encrypted'
  ) THEN
    EXECUTE 'UPDATE public.profiles SET byok_key_encrypted = NULL WHERE byok_key_encrypted IS NOT NULL';
  END IF;
END $$;

COMMIT;
