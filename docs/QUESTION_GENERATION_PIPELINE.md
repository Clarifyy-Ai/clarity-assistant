# Question Generation Pipeline

## Current production path (pilot)

1. Resolve approved exam + stage + pattern + syllabus versions  
2. Build blueprint (`gov_paper_v1`) with server-owned marks / negative marking / duration  
3. Select from **approved public** `questions` bank using seeded shuffle  
4. Score each candidate with independent `qualityScore` (structure + uniqueness + stem heuristics)  
5. Deduplicate via fingerprint + token/n-gram Jaccard (`validators/similarity`)  
6. Multi-agent scaffolding (solver/critic/similarity/language); **LLM generator flag OFF**  
7. Enforce hard counts for `generated_mock` / `official_previous`  
8. For `custom_mock` / `adaptive`, allow smaller **Custom Practice Set** if bank is short (never silent quality drop on full simulation)  
9. Persist `gov_generated_papers` (+ `quality_score`) + link rows + `mock_tests`  
10. Refund credits on failure  

Admin: `reconcile-paper-quality` re-scores an existing paper without LLM fill.

## Previous-year PDF / OCR ingest (admin)

1. Admin uploads PDF (base64), storage path (`bucket/object`), or pasted text on **PDF Ingest** (`/app/admin/gov/ingest`)  
2. Edge `extract-question-paper` (admin JWT) creates `gov_official_sources` + `source_ingestion_jobs` (`extracting` → `normalizing` → validate → insert → link paper)  
3. Reuses shared Gemini PDF extract prompt with `parse-question-pdf`  
4. Questions land with `is_public=false`, `metadata.needs_review=true`, raw vs normalized OCR in `metadata.ocr`  
5. Optional link to `previous_year_papers` when exam/year/stage provided (`review_status=in_review`)  
6. Human approval in **Q Review** before public — OCR never auto-publishes; respect `license_class`  

## Future multi-agent path (not yet certified for paid packs)

Generator → Solver → Critic → Source verifier → Pattern validator → Similarity → Language reviewer

Publish only after configured confidence + deterministic validators. Generator remains behind `ENABLE_LLM_GENERATOR` (default **false**).
