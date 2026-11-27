#!/usr/bin/env python3
"""CI-only PostgreSQL snapshot/restore drill against disposable localhost Docker.

Backs up the isolated CMS test database with pg_dump, restores it into an
independent disposable database, verifies schema count and a synthetic marker.
NEVER runs against external services, production PostgreSQL or customer data.
"""
import hashlib
import os
from pathlib import Path
import subprocess
import uuid


def require(ok, message):
    if not ok:
        raise AssertionError(message)


def command(args, *, data=None):
    result = subprocess.run(
        args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        check=False)
    if result.returncode != 0:
        raise RuntimeError("Isolated postgres operation failed: " + args[0] +
                           " (exit " + str(result.returncode) + ")")
    return result.stdout


def psql(database, query):
    out = command(["docker", "exec", "cms-media-pg", "psql",
                   "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1",
                   "-U", "postgres", "-d", database, "-c", query])
    return out.decode("utf-8").strip()


def main():
    require(os.getenv("CI") == "true" and
            os.getenv("CMS_REAL_MINIO_ISOLATED") == "1" and
            os.getenv("CMS_REAL_MINIO_HTTP_FIXTURE") == "1" and
            os.getenv("CMS_REAL_MINIO_BACKUP_RESTORE_TEST") == "1" and
            os.getenv("RUNNER_TEMP"), "Missing isolated CI restore guards")
    for name in ("ConnectionStrings__Postgres", "Storage__Endpoint",
                 "Storage__AccessKey", "Storage__SecretKey",
                 "PANGOLIN_S3_ENDPOINT", "PANGOLIN_S3_ACCESS_KEY",
                 "PANGOLIN_S3_SECRET_KEY"):
        require(not os.getenv(name), "Inherited production/storage settings: " + name)

    # Verify the exact disposable container and loopback-only port published
    # by cms-real-minio-http.yml before running any SQL.
    port = command(["docker", "inspect", "-f",
                    '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostIp}}:{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',
                    "cms-media-pg"]).decode().strip()
    require(port == "127.0.0.1:15433",
            "Refusing a PostgreSQL instance outside the isolated CI loopback mapping")

    marker = uuid.uuid4().hex
    restore_name = "cms_restore_" + marker[:12]
    snapshot = Path(os.environ["RUNNER_TEMP"]) / ("cms-pg-backup-" + marker + ".dump")
    probe_created = False
    clone_created = False
    try:
        psql("login", "CREATE TABLE public.ci_restore_probe_" + marker[:12] +
             " (marker text PRIMARY KEY, payload text NOT NULL)")
        probe_created = True
        table = "public.ci_restore_probe_" + marker[:12]
        psql("login", "INSERT INTO " + table + " (marker, payload) VALUES ('" +
             marker + "', 'isolated-restore-test-only')")
        original_table_count = int(psql(
            "login", "SELECT COUNT(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public'"))
        require(original_table_count >= 2, "CMS schema not present in original database")

        dump = command(["docker", "exec", "cms-media-pg",
                        "pg_dump", "-Fc", "-U", "postgres", "-d", "login"])
        require(len(dump) > 1024 and dump.startswith(b"PGDMP"),
                "pg_dump did not create a valid custom-format database snapshot")
        snapshot.write_bytes(dump)
        digest = hashlib.sha256(dump).hexdigest()
        require(hashlib.sha256(snapshot.read_bytes()).hexdigest() == digest,
                "Snapshot file checksum mismatch")

        psql("postgres", "CREATE DATABASE " + restore_name)
        clone_created = True
        command(["docker", "exec", "-i", "cms-media-pg", "pg_restore",
                 "--exit-on-error", "--no-owner", "--no-privileges",
                 "-U", "postgres", "-d", restore_name], data=snapshot.read_bytes())

        got = psql(restore_name, "SELECT payload FROM " + table +
                   " WHERE marker='" + marker + "'")
        require(got == "isolated-restore-test-only",
                "Restored PostgreSQL fixture row missing or changed")
        restored_table_count = int(psql(
            restore_name, "SELECT COUNT(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public'"))
        require(restored_table_count == original_table_count,
                "Restored PostgreSQL table count differs from original")
        print("PASS isolated PostgreSQL recovery: pg_dump custom-format, "
              "pg_restore into separate database, synthetic row and schema count verified",
              flush=True)
    finally:
        if clone_created:
            psql("postgres", "DROP DATABASE IF EXISTS " + restore_name + " WITH (FORCE)")
        if probe_created:
            psql("login", "DROP TABLE IF EXISTS public.ci_restore_probe_" + marker[:12])
        snapshot.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
