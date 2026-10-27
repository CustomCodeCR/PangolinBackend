# Main-2 to main: controlled production migration and Dynamics enablement

**Status: pre-merge audit; DO NOT MERGE automatically.** The `main` push
publishes immutable GHCR images and automatically deploys on the self-hosted
`dhole` runner. CI success is necessary but not sufficient to deploy.

## Protected existing behavior from main

- The frontend image keeps `VITE_OFFICIAL_QUOTES_ENABLED=true` and the backend
  Compose keeps `Features__OfficialQuotesEnabled=true`.
- The deployment **continues loading the verified official quote catalogs**
  (`OfficialQuotesSchema.sql`, `OfficialQuotesVerifiedLocations.sql`,
  `OfficialQuotesVideoLocations.sql`) in one atomic operation; no DEV fixtures.
- Pangolin serves the WWW host with priority 1000. Fennec retains the apex
  routing; same-host Origin validation also accepts the configured apex.
- No production `build:`, no new PostgreSQL instance, no volume deletion,
  no reset or replace of existing user accounts, catalog or CMS content.

## Before approval and before merging

1. Confirm the **actual host running the GitHub runner labelled `dhole`**.
   Do not assume the machine reached as `Argos@192.168.1.7` is the same one.
   On the production runner host, use read-only checks:
   ```bash
   hostname -f
   docker context show
   docker ps --filter label=com.docker.compose.project=pangolin-production --format '{{.Names}} {{.Image}}'
   docker network inspect dhole --format '{{.Name}}'
   test -r /opt/dhole/.env && echo "Dhole environment file is readable"
   ```
   Do not paste the contents of the private environment file or any cookies.
   Confirm the PostgreSQL host, user and database with the runner's current
   deployment settings, **without printing the password**.
2. Take a fresh encrypted/off-host organizational backup if required by
   operations. The pipeline also writes its own restrictive local PostgreSQL
   dump to `$HOME/pangolin-backups/pangolin-predeploy-*.dump` *on the runner
   host*, verifies `pg_restore --list` and checks the identity of the
   target connection before touching existing tables. Do not assume an Argos
   backup covers a different Dhole PostgreSQL database.
3. Restore the dump to a **completely isolated temporary PostgreSQL container**
   and verify its content, including CMS/news/users and the official quotes.
   The previous local-copy migration test is not a substitute for this
   production-target restore verification.
4. Review the PR's checks (Vue, .NET, SEO, Nginx, Docker, PostgreSQL OTP and
   browser). CI runs `scripts/test-cms-news-migration.py` against a uniquely
   named disposable PostgreSQL database and reruns the migration three times.
5. Record the currently running immutable backend and frontend image tags
   (the Docker `ps --format` command above shows their images) for rollback.
6. Confirm the public deployment window and responsible operator. Keep the
   PR in draft until these production preflight checks are complete.

## News schema migration

`backend/Database/CmsNewsMetadataMigration.sql` is included in the production
backend image. After provisioning and before replacing the running containers,
the workflow runs it on the verified production `pangolin` database using
`psql --single-transaction -v ON_ERROR_STOP=1`.

- Adds `author VARCHAR(160) NOT NULL DEFAULT ''` and
  `published_at TIMESTAMPTZ NULL` only if missing.
- For already-published legacy news lacking a publication timestamp,
  initializes `published_at` to the existing `created_at`.
- Preserves all rows, text, authors, timestamps already set and unpublished
  drafts. Re-running it has no extra effect.
- Locks time out after five seconds and statements after 60 seconds. A failure
  rolls back and **blocks deployment** before starting the new image.
- Do not apply the entire `AuthSchema.sql` blindly to an existing database.

The main workflow keeps the official quotes schema initialization and
all 12 required route-role catalog checks. They also block deploying a
new image when incomplete.

## Dynamics settings

The production Compose adds backend-only settings:

| In /opt/dhole/.env | Mapped backend setting | Default |
| --- | --- | --- |
| `PANGOLIN_DHOLE_TRACKING_ENABLED` | `DholeTracking__Enabled` | `false` |
| `PANGOLIN_DHOLE_TRACKING_API_KEY` | `DholeTracking__ApiKey` | empty |

**Never commit, print, paste, or send the real API key.** Do not use a
`VITE_*` key for tracking; the credential only belongs in the backend.
If tracking is explicitly set to `true`, the pipeline refuses to deploy
without the private key. To activate it, a server operator must configure
the actual target host securely and redeploy/recreate only the Pangolin
backend with the reviewed Compose configuration. Use a scheduled change
window; do not modify unrelated Dhole/Fennec services.

With a registered administrator and registered client, verify a real
authorized reference, empty result, invalid reference, and unavailable
provider response. With no session, the POST endpoint should reject the
request (HTTP 401/403). The globe route is illustrative only, not live GPS.
Access to references and fields must also be approved by operations/security
before enabling Dynamics for real users.

## Final smoke and rollback

Once the reviewed merge deploys:
- Verify WWW home, health endpoint, login/logout and OTP flow.
- Verify published news and article metadata, administrator news editor,
  user management, comments, MinIO media and permissions.
- Verify that official quotes remained enabled, routes, all shipment types,
  saved requests and authorizations, without creating unwanted test records.
- Verify tracking without session stays protected, registered roles and
  routing globe if Dynamics has been authorized and enabled.
- Inspect backend/frontend logs without disclosing credentials.

If the application fails, use the workflow's controlled
`workflow_dispatch` with a previously recorded immutable `image_tag`
and `deploy=true` after reviewing operational safety; this rolls back
**application images only**. The additive news columns remain in PostgreSQL
so older images can ignore them. Restore a DB dump **only after independent
operator assessment**; never run `docker compose down -v`, drop databases,
or overwrite other apps' volumes.
