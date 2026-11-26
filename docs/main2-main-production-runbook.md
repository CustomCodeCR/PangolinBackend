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


## Release recovery checkpoint (2026-11-25 security update)

**Planning only. No production actions without fresh operator approval.**
The previous release workflow's image-tag rollback is not a complete rollback
of the production environment. Its publish job builds and pushes images before
the deployment job, even when an earlier `image_tag` is supplied. Deployment
downloads Compose and gateway configuration from the selected workflow run,
not necessarily from the requested earlier image tag. A commit-shaped tag
is a convention, not a registry immutability guarantee; preserve digests.

Before any authorized next release, record and securely preserve the following
on the verified runner host (do not upload secrets or database dumps to GitHub):

- Current four container image references, image IDs and repository digests;
  the gateway is part of the rollback baseline, not just backend and Vue.
- The current release directory's Compose and gateway configuration files,
  their SHA-256 hashes, and the current-tag marker. Preserve a private copy
  outside the directory overwritten by deployment. Check actual mount paths
  and active routing settings. Do not print environment contents or complete
  Docker inspect output.
- The private environment configuration and a recovery record of the active
  routing/feature flags. Keep these with the responsible operator only.
- A fresh PostgreSQL backup of the verified Pangolin database, with a
  successful isolated restoration check. Account for media objects separately.
  Never restore a previous database automatically after an application rollback:
  new requests, sessions and outbox records may exist.
- Confirm the old image digests remain retrievable and the previous configuration
  works with them. Check old/new gateway compatibility in hosted CI and confirm
  the selected release Compose resolves the intended gateway digest. Current
  deployment explicitly pulls the three application images; check the gateway
  is available before the cutover. Do not issue a registry pull on Argos as part
  of a read-only inventory.

### Read-only release baseline check

On the confirmed Argos host, these checks print only file existence, hashes,
file metadata and bounded container metadata. They do not create a backup.

```bash
sudo bash <<'BASH'
set -euo pipefail
set +x
release=/home/actions-runner/pangolin-release
for file in current-tag docker-compose.images.yml nuxt-hybrid-gateway.conf; do
  test -r "$release/$file"
  sha256sum "$release/$file"
done
docker ps -a --filter label=com.docker.compose.project=pangolin-production \
  --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
BASH
```

### Decision gates

1. Approve candidate commit, review CI and exact production image findings.
2. Confirm recovery prerequisites, operator and maintenance window. Keep the
   deployment PR in draft until approved. Do not dispatch the production
   workflow from development branches.
3. If cutover checks fail, stop and assess whether reverting WWW routing
   alone restores service. This is a routing fallback, not a full rollback.
   For a full application/configuration rollback, use the previously preserved
   compatible Compose, gateway and image digests under a separately approved
   operator procedure. Never assume a previous application image tag restores
   the previous configuration or database.
4. Verify public pages, health/readiness, auth, private SPA routing, CMS media,
   official quote outbox and tracking without creating real provider requests.
   Confirm Fennec and other Dhole services are unaffected.
5. Record final observed versions and checks. A successful HTTP smoke alone
   does not certify recovery of all dependencies.

These gates are documentation, not a tested restoration of the live host.
The prior local dump/list check is not proof of an isolated full restore.
