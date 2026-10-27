-- CMS News metadata migration for existing Pangolin PostgreSQL databases.
-- Run ONLY against the verified Pangolin database, AFTER a validated backup.
-- Execute with: psql -X -v ON_ERROR_STOP=1 --single-transaction -f CmsNewsMetadataMigration.sql
-- Do not run AuthSchema.sql wholesale over an existing database.
-- Rerunnable: preserves all existing news, authors and publication timestamps.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $guard$
BEGIN
  IF to_regclass('public.cms_news') IS NULL THEN
    RAISE EXCEPTION 'cms_news table missing; refusing to perform CMS migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cms_news' AND column_name='created_at'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cms_news' AND column_name='published'
  ) THEN
    RAISE EXCEPTION 'cms_news prerequisite columns missing; refusing to migrate';
  END IF;
END
$guard$;

ALTER TABLE public.cms_news ADD COLUMN IF NOT EXISTS author VARCHAR(160) NOT NULL DEFAULT '';
ALTER TABLE public.cms_news ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ NULL;

-- Only backfill old published news. Existing, explicitly set dates and drafts remain unchanged.
UPDATE public.cms_news
SET published_at = created_at
WHERE published = TRUE AND published_at IS NULL;

DO $verify$
DECLARE
  author_type text;
  author_nullable text;
  publication_type text;
BEGIN
  SELECT data_type, is_nullable INTO author_type, author_nullable
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='cms_news' AND column_name='author';
  SELECT data_type INTO publication_type
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='cms_news' AND column_name='published_at';
  IF author_type <> 'character varying' OR author_nullable <> 'NO'
    OR publication_type <> 'timestamp with time zone' THEN
    RAISE EXCEPTION 'cms_news metadata columns have unexpected types or constraints';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.cms_news
    WHERE published = TRUE AND published_at IS NULL
  ) THEN
    RAISE EXCEPTION 'cms_news published metadata backfill incomplete';
  END IF;
END
$verify$;
