-- DOC-004: resumes bucket rejected text/plain, so TXT uploads failed while DOCX worked.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
]::text[]
WHERE id = 'resumes';
