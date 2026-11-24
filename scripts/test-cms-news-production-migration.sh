#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
# Isolated test database. Never read production configuration or use a shared network.
container="$(docker run -d --network none -e POSTGRES_PASSWORD=isolated_ci_fixture postgres:16-alpine)"
trap 'docker rm -f "$container" >/dev/null' EXIT
ready=false
for i in $(seq 1 60); do
  if docker exec "$container" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]]
sql() {
  docker exec -i "$container" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}
# Simulate existing database after the previous production metadata migration.
sql <<'SQL'
CREATE TABLE public.cms_news (
  id integer PRIMARY KEY,
  title varchar(160) NOT NULL,
  published boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  author varchar(160) NOT NULL DEFAULT '',
  published_at timestamptz NULL,
  expires_at timestamptz NULL
);
INSERT INTO public.cms_news VALUES
 (1,'Legacy published',true,'2026-01-01T00:00:00Z','2026-01-02T00:00:00Z','Author','2026-01-01T00:00:00Z',NULL),
 (2,'Draft',false,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','',NULL,NULL);
SQL
cat backend/Database/CmsNewsMetadataMigration.sql backend/Database/CmsNewsPermalinksMigration.sql | sql --single-transaction -f -
sql <<'SQL'
DO $test$
BEGIN
  IF (SELECT COUNT(*) FROM public.cms_news) <> 2 OR
     NOT EXISTS (SELECT 1 FROM public.cms_news WHERE id=1 AND title='Legacy published'
       AND author='Author' AND slug IS NULL AND published_at='2026-01-01T00:00:00Z'
       AND content_modified_at='2026-01-02T00:00:00Z') OR
     NOT EXISTS (SELECT 1 FROM public.cms_news WHERE id=2 AND NOT published
       AND slug IS NULL AND published_at IS NULL AND content_modified_at IS NULL) THEN
    RAISE EXCEPTION 'Migration did not preserve the legacy news or draft';
  END IF;
END
$test$;
UPDATE public.cms_news SET slug='stable-original', content_modified_at='2026-01-03T00:00:00Z' WHERE id=1;
SQL
cat backend/Database/CmsNewsMetadataMigration.sql backend/Database/CmsNewsPermalinksMigration.sql | sql --single-transaction -f -
sql <<'SQL'
DO $test$
BEGIN
  IF (SELECT COUNT(*) FROM public.cms_news) <> 2 OR
     NOT EXISTS (SELECT 1 FROM public.cms_news WHERE id=1 AND slug='stable-original'
       AND content_modified_at='2026-01-03T00:00:00Z') THEN
    RAISE EXCEPTION 'Repeated migration rewrote editorial metadata';
  END IF;
END
$test$;
SQL
echo "PASS production legacy news migration and idempotence."
