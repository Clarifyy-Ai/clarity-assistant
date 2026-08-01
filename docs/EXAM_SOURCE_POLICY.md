# Exam Source Policy

## Authority order

1. Official current notification  
2. Official current syllabus  
3. Official corrigendum / addendum  
4. Official exam pattern  
5. Official previous-year paper  
6. Official final answer key  
7. Official provisional answer key (labeled)  
8. Licensed publisher content  
9. Institution-approved expert content  
10. User-uploaded content with provenance  
11. AI-generated original practice content  

Unofficial sources must never silently override official ones. Conflicts are preserved and marked.

## Allowed acquisition

- Official public links registered in `gov_official_sources`  
- Licensed imports  
- Admin uploads with license review  
- User uploads for personal practice (not republished as official)
- Admin `ingest-source-document`: allowlisted official hosts only; pilot accepts metadata + optional `storage_path` / `textPayload` / structured JSON — **does not download** when robots/terms are unknown
- Admin `extract-question-paper`: admin-authorized PDF base64 / storage path / pasted OCR text only — creates `source_ingestion_jobs` with extract/normalize stages; inserts `is_public=false` + `metadata.needs_review=true`; **never auto-publishes OCR**; respect `license_class`

## Prohibited

- Scraping sites that forbid automated access  
- Remote fetch of exam PDFs when robots/terms are unknown (use admin upload instead)  
- Government logos without permission  
- Presenting generated items as leaked / official / guaranteed selection  
- Copying protected coaching banks  
- Using the live coaching overlay during a controlled government exam
- Publishing OCR / PDF extracts without human reviewer approval
