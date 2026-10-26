-- Idempotent, non-destructive migration for CMS news metadata.
-- BACK UP PostgreSQL before applying on production. Run once before deploying
-- the new backend: psql -v ON_ERROR_STOP=1 -d <database> -f backend/Database/NewsPublicationMetadata.sql
-- Existing articles use their original creation date in Costa Rica, never today.
BEGIN;
ALTER TABLE public.cms_news ADD COLUMN IF NOT EXISTS author VARCHAR(100);
ALTER TABLE public.cms_news ADD COLUMN IF NOT EXISTS publication_date DATE;
UPDATE public.cms_news SET author = 'Grupo Castro Fallas' WHERE author IS NULL OR btrim(author) = '';
UPDATE public.cms_news
SET publication_date = (created_at AT TIME ZONE 'America/Costa_Rica')::date
WHERE publication_date IS NULL;
ALTER TABLE public.cms_news ALTER COLUMN author SET DEFAULT 'Grupo Castro Fallas';
ALTER TABLE public.cms_news ALTER COLUMN author SET NOT NULL;
ALTER TABLE public.cms_news ALTER COLUMN publication_date SET DEFAULT ((NOW() AT TIME ZONE 'America/Costa_Rica')::date);
ALTER TABLE public.cms_news ALTER COLUMN publication_date SET NOT NULL;
COMMIT;
