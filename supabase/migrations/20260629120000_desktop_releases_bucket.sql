-- Public bucket for Clarify AI desktop installers (.exe / .dmg / AppImage).
-- Upload via: npm run publish:desktop-installer

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'desktop-releases',
  'desktop-releases',
  true,
  524288000,
  ARRAY['application/octet-stream', 'application/x-msdownload', 'application/vnd.microsoft.portable-executable']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Anyone can download installers (public bucket).
DROP POLICY IF EXISTS desktop_releases_public_read ON storage.objects;
CREATE POLICY desktop_releases_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'desktop-releases');

-- Only service role / dashboard uploads (no client write policy).
