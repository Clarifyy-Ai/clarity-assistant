-- Paper assembler provenance: who generated this paper (Edge vs Python).
ALTER TABLE public.gov_generated_papers
  ADD COLUMN IF NOT EXISTS assembly_source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gov_generated_papers_assembly_source_check'
  ) THEN
    ALTER TABLE public.gov_generated_papers
      ADD CONSTRAINT gov_generated_papers_assembly_source_check
      CHECK (
        assembly_source IS NULL OR assembly_source IN (
          'edge_assembler',
          'python_paper_factory'
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.gov_generated_papers.assembly_source IS
  'Which service assembled the paper: edge_assembler or python_paper_factory.';

-- Best-effort backfill from provenance_json keys.
UPDATE public.gov_generated_papers
SET assembly_source = CASE
  WHEN coalesce(provenance_json->>'assembly_source', provenance_json->>'generator', '') = 'python_paper_factory'
    THEN 'python_paper_factory'
  WHEN coalesce(provenance_json->>'assembly_source', provenance_json->>'generator', '') = 'edge_assembler'
    THEN 'edge_assembler'
  WHEN provenance_json->>'assembly' IS NOT NULL
    THEN 'edge_assembler'
  ELSE assembly_source
END
WHERE assembly_source IS NULL;

CREATE INDEX IF NOT EXISTS gov_generated_papers_assembly_source_idx
  ON public.gov_generated_papers (assembly_source)
  WHERE assembly_source IS NOT NULL;
