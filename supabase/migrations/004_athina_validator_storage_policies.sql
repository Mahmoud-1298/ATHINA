-- ATHINA validator storage read/write policies
-- Purpose: allow backend runtime using anon/publishable keys to list/download
-- reference files and upload proposal copies in the athina-validator bucket.

-- Ensure bucket exists.
INSERT INTO storage.buckets (id, name, public)
SELECT 'athina-validator', 'athina-validator', false
WHERE NOT EXISTS (
  SELECT 1 FROM storage.buckets WHERE id = 'athina-validator'
);

-- Recreate policies idempotently.
DROP POLICY IF EXISTS "athina_validator_objects_read_anon" ON storage.objects;
DROP POLICY IF EXISTS "athina_validator_objects_read_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "athina_validator_objects_insert_anon_uploads" ON storage.objects;
DROP POLICY IF EXISTS "athina_validator_objects_insert_authenticated_uploads" ON storage.objects;

-- Read/list all files in athina-validator for anon/authenticated roles.
CREATE POLICY "athina_validator_objects_read_anon"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'athina-validator');

CREATE POLICY "athina_validator_objects_read_authenticated"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'athina-validator');

-- Allow writing only to uploads/* paths for anon/authenticated.
CREATE POLICY "athina_validator_objects_insert_anon_uploads"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'athina-validator'
  AND name LIKE 'uploads/%'
);

CREATE POLICY "athina_validator_objects_insert_authenticated_uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'athina-validator'
  AND name LIKE 'uploads/%'
);
