-- News permalink columns, additive and repeatable. NO se ejecuta automáticamente en producción.
-- Run on the verified database after backup, BEFORE deploying backend code:
-- psql -X -v ON_ERROR_STOP=1 --single-transaction -f CmsNewsPermalinksMigration.sql
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $guard$
BEGIN
  IF to_regclass('public.cms_news') IS NULL THEN
    RAISE EXCEPTION 'cms_news table missing; aborting permalink migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cms_news'
      AND column_name IN ('id', 'title', 'published', 'published_at', 'updated_at', 'created_at')
    GROUP BY table_name HAVING count(*) = 6
  ) THEN
    RAISE EXCEPTION 'cms_news metadata prerequisite columns missing';
  END IF;
END
$guard$;

ALTER TABLE public.cms_news ADD COLUMN IF NOT EXISTS slug VARCHAR(240) NULL;
ALTER TABLE public.cms_news ADD COLUMN IF NOT EXISTS content_modified_at TIMESTAMPTZ NULL;

-- Preserve current public URLs for previously published articles. Their
-- null slug uses the legacy URL until the first subsequent edit, at which
-- point the backend freezes the original address BEFORE changing metadata.
-- No destructive/approximate SQL transliteration of existing article titles.
UPDATE public.cms_news
SET content_modified_at = COALESCE(updated_at, published_at, created_at)
WHERE published = TRUE AND content_modified_at IS NULL;

DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cms_news'
      AND column_name='slug' AND (data_type <> 'character varying' OR is_nullable <> 'YES')
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cms_news'
      AND column_name='slug' AND character_maximum_length = 240
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cms_news'
      AND column_name='content_modified_at'
      AND data_type = 'timestamp with time zone' AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'Unexpected cms_news permalink column definitions';
  END IF;
END
$verify$;
