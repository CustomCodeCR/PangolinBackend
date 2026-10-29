#!/usr/bin/env python3
"""CI-only PostgreSQL regression for the additive CMS news metadata migration.

Runs only in GitHub Actions against the local Compose postgres service.
Creates and removes a uniquely named disposable database, never the app database.
"""
import os
from pathlib import Path
import subprocess
import uuid

if os.environ.get("GITHUB_ACTIONS") != "true":
    raise SystemExit("Safety guard: migration regression may only run in GitHub Actions")

root = Path(__file__).resolve().parents[1]
migration = (root / "backend/Database/CmsNewsMetadataMigration.sql").read_text(encoding="utf-8")
database = "cf_cms_news_migration_ci_" + uuid.uuid4().hex[:12]
base = ["docker", "compose", "exec", "-T", "postgres"]

def run(*args: str, sql: str | None = None) -> None:
    subprocess.run(
        [*base, *args],
        input=sql,
        text=True,
        check=True,
        cwd=root,
    )

run("createdb", "-U", "postgres", database)
try:
    run(
        "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database,
        sql="""
CREATE TABLE public.cms_news (
  id integer PRIMARY KEY,
  title text NOT NULL,
  published boolean NOT NULL DEFAULT FALSE,
  created_at timestamptz NOT NULL
);
INSERT INTO public.cms_news (id, title, published, created_at) VALUES
  (1, 'Legacy published', TRUE, '2025-01-10T10:00:00Z'),
  (2, 'Legacy draft', FALSE, '2025-02-11T10:00:00Z'),
  (3, 'Later published', TRUE, '2025-03-12T10:00:00Z');
""",
    )
    def apply_migration() -> None:
        run(
            "psql", "-X", "-v", "ON_ERROR_STOP=1", "--single-transaction",
            "-U", "postgres", "-d", database, "-f", "-",
            sql=migration,
        )

    apply_migration()
    # Operators may edit author, published_at and expires_at after initial migration;
    # these values must never be overwritten by repeated deployments.
    run(
        "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database,
        sql="""UPDATE public.cms_news
SET author='Editor verificado', published_at='2025-04-01T12:00:00Z',
    expires_at='2030-06-01T00:00:00Z'
WHERE id=1;""",
    )
    apply_migration()
    apply_migration()
    run(
        "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database,
        sql="""
DO $verify$
BEGIN
  IF (SELECT COUNT(*) FROM public.cms_news) <> 3
     OR (SELECT title FROM public.cms_news WHERE id=1) <> 'Legacy published'
     OR (SELECT author FROM public.cms_news WHERE id=1) <> 'Editor verificado'
     OR (SELECT published_at FROM public.cms_news WHERE id=1)
           <> '2025-04-01T12:00:00Z'::timestamptz
     OR (SELECT published_at FROM public.cms_news WHERE id=3)
           <> '2025-03-12T10:00:00Z'::timestamptz
     OR (SELECT expires_at FROM public.cms_news WHERE id=1)
           <> '2030-06-01T00:00:00Z'::timestamptz
     OR (SELECT expires_at FROM public.cms_news WHERE id=2) IS NOT NULL
     OR (SELECT expires_at FROM public.cms_news WHERE id=3) IS NOT NULL
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='cms_news'
         AND column_name='expires_at' AND data_type='timestamp with time zone'
         AND is_nullable='YES'
     )
     OR (SELECT author FROM public.cms_news WHERE id=2) <> ''
     OR (SELECT published_at FROM public.cms_news WHERE id=2) IS NOT NULL
  THEN
    RAISE EXCEPTION 'CMS news migration modified existing content or metadata';
  END IF;
END
$verify$;
""",
    )
    print("OK: CMS migration replay preserves publication/expiry dates, metadata, rows and drafts")
finally:
    run("dropdb", "-U", "postgres", "--if-exists", database)
