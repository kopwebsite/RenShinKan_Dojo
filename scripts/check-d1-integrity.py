from __future__ import annotations

import argparse
import pathlib
import sqlite3
import sys
import tempfile


def locate_database(root: pathlib.Path) -> pathlib.Path:
    for candidate in root.rglob("*.sqlite"):
        if candidate.name.startswith("metadata"):
            continue
        connection = sqlite3.connect(f"file:{candidate.as_posix()}?mode=ro", uri=True)
        try:
            found = connection.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='d1_migrations'"
            ).fetchone()
            if found:
                return candidate
        finally:
            connection.close()
    raise RuntimeError("Could not locate the migrated local D1 SQLite file")


def scalar(connection: sqlite3.Connection, query: str) -> int:
    return int(connection.execute(query).fetchone()[0])


def validate(connection: sqlite3.Connection) -> None:
    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    if integrity != "ok":
        raise RuntimeError(f"SQLite integrity_check failed: {integrity}")
    foreign_keys = connection.execute("PRAGMA foreign_key_check").fetchall()
    if foreign_keys:
        raise RuntimeError(f"Foreign-key violations found: {len(foreign_keys)}")

    checks = {
        "duplicate student IDs": "SELECT COUNT(*) FROM (SELECT UPPER(public_student_id) FROM students GROUP BY UPPER(public_student_id) HAVING COUNT(*) > 1)",
        "students with invalid dojo references": "SELECT COUNT(*) FROM students s LEFT JOIN dojos d ON d.id = s.dojo_id WHERE s.dojo_id IS NOT NULL AND d.id IS NULL",
        "duplicate newsletter revision numbers": "SELECT COUNT(*) FROM (SELECT newsletter_id, revision FROM newsletter_revisions GROUP BY newsletter_id, revision HAVING COUNT(*) > 1)",
        "payment proofs missing object metadata": "SELECT COUNT(*) FROM payment_proofs WHERE object_key IS NOT NULL AND (content_type IS NULL OR file_size IS NULL)",
        "media assets missing object metadata": "SELECT COUNT(*) FROM media_assets WHERE storage_key = '' OR mime_type = '' OR byte_size <= 0",
        "invalid profile status": "SELECT COUNT(*) FROM students WHERE profile_status NOT IN ('pending_admin_approval','approved','rejected')",
        "invalid training request status": "SELECT COUNT(*) FROM training_hour_requests WHERE status NOT IN ('pending','approved','rejected')",
        "invalid examination application status": "SELECT COUNT(*) FROM examination_applications WHERE status NOT IN ('application_submitted','examination_completed','archived','rejected')",
        "invalid payment proof status": "SELECT COUNT(*) FROM payment_proofs WHERE status NOT IN ('awaiting_upload','pending_review','approved','denied')",
        "invalid canonical account date": "SELECT COUNT(*) FROM students WHERE account_created_date IS NOT NULL AND account_created_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'",
    }
    failures = {label: scalar(connection, query) for label, query in checks.items() if scalar(connection, query) != 0}
    if failures:
        raise RuntimeError("; ".join(f"{label}: {count}" for label, count in failures.items()))

    plans = {
        "students": "EXPLAIN QUERY PLAN SELECT id FROM students WHERE dojo_id = 'dojo-rsk' AND profile_status = 'approved' AND active = 1 ORDER BY updated_at DESC LIMIT 20",
        "training queue": "EXPLAIN QUERY PLAN SELECT student_id FROM training_hour_requests WHERE status = 'pending' ORDER BY submitted_at DESC LIMIT 20",
        "proof queue": "EXPLAIN QUERY PLAN SELECT id FROM payment_proofs WHERE status = 'pending_review' AND payment_type = 'exam' ORDER BY submitted_at DESC LIMIT 20",
        "rate expiry": "EXPLAIN QUERY PLAN DELETE FROM security_rate_limits WHERE expires_at < '2000-01-01T00:00:00.000Z'",
    }
    for label, query in plans.items():
        detail = " | ".join(str(row[3]) for row in connection.execute(query).fetchall())
        if "INDEX" not in detail.upper():
            raise RuntimeError(f"Query plan for {label} does not use an index: {detail}")


PRESERVED_TABLES = (
    "students",
    "training_hours",
    "belt_examinations",
    "payments",
    "payment_proofs",
    "media_assets",
    "student_profile_media",
    "newsletter_revisions",
    "site_revisions",
    "share_tokens",
    "student_access_sessions",
    "admin_login_attempts",
    "revoked_admin_sessions",
    "audit_log",
)


def table_counts(connection: sqlite3.Connection) -> dict[str, int]:
    return {table: scalar(connection, f"SELECT COUNT(*) FROM {table}") for table in PRESERVED_TABLES}


def validate_previous_fixture_upgrade(connection: sqlite3.Connection, before: dict[str, int]) -> None:
    after = table_counts(connection)
    if after != before:
        changed = {table: (before[table], after[table]) for table in PRESERVED_TABLES if before[table] != after[table]}
        raise RuntimeError(f"Previous-release row counts changed during migrations: {changed}")

    expected = {
        "student dates": "SELECT COUNT(*) FROM students WHERE id = 'fixture-student-rsk' AND account_created_date = '2024-01-15' AND dojo_joined_date = '2024-02-01'",
        "payment proof reference": "SELECT COUNT(*) FROM payment_proofs pp JOIN payments p ON p.id = pp.payment_reference_id AND p.student_id = pp.student_id WHERE pp.id = 'fixture-proof-1' AND pp.object_key = 'payment-proofs/fixture-proof-1.webp'",
        "profile media reference": "SELECT COUNT(*) FROM student_profile_media m JOIN students s ON s.id = m.student_id WHERE m.id = 'fixture-profile-media-1' AND m.status = 'active'",
        "newsletter revision": "SELECT COUNT(*) FROM newsletter_revisions WHERE newsletter_id = 'fixture-newsletter-1' AND revision = 1",
        "revoked session": "SELECT COUNT(*) FROM revoked_admin_sessions WHERE session_id = 'fixture-revoked-session'",
        "legacy login state": "SELECT COUNT(*) FROM admin_login_attempts WHERE actor_hash = 'fixture-admin-actor' AND attempts = 2",
    }
    missing = [label for label, query in expected.items() if scalar(connection, query) != 1]
    if missing:
        raise RuntimeError(f"Previous-release fixture invariants were not preserved: {', '.join(missing)}")

    new_tables = {
        "admin_accounts",
        "admin_account_dojos",
        "student_id_aliases",
        "security_rate_limits",
        "publish_operations",
    }
    available = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    if not new_tables.issubset(available):
        raise RuntimeError(f"Missing hardening tables after upgrade: {sorted(new_tables - available)}")

    # The environment-backed legacy administrator remains compatible without
    # inventing or overwriting a password hash. New account enrollment can be
    # established explicitly and scoped after the migration.
    connection.execute(
        "INSERT INTO admin_accounts (id, credential_id, display_name, role, created_at, updated_at) VALUES (?, ?, ?, 'central', ?, ?)",
        ("fixture-admin-account", "env:central", "Fixture Administrator", "2026-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z"),
    )
    connection.execute(
        "INSERT INTO admin_account_dojos (account_id, dojo_id, created_at) VALUES (?, 'dojo-rsk', ?)",
        ("fixture-admin-account", "2026-08-01T00:00:00.000Z"),
    )
    connection.commit()
    if scalar(connection, "SELECT COUNT(*) FROM admin_accounts a JOIN admin_account_dojos d ON d.account_id = a.id WHERE a.credential_id = 'env:central' AND d.dojo_id = 'dojo-rsk'") != 1:
        raise RuntimeError("Admin account and dojo scope could not be enrolled after migration")


def replay_previous_schema(migrations: pathlib.Path, fixture: pathlib.Path) -> None:
    with tempfile.TemporaryDirectory(prefix="renshinkan-schema-upgrade-") as directory:
        database = pathlib.Path(directory) / "upgrade.sqlite"
        connection = sqlite3.connect(database)
        try:
            for migration in sorted(migrations.glob("*.sql")):
                if migration.name >= "0024_":
                    break
                connection.executescript(migration.read_text(encoding="utf-8"))
            connection.executescript(fixture.read_text(encoding="utf-8"))
            connection.commit()
            before = table_counts(connection)
            for migration in sorted(migrations.glob("*.sql")):
                if migration.name >= "0024_":
                    connection.executescript(migration.read_text(encoding="utf-8"))
            connection.commit()
            validate_previous_fixture_upgrade(connection, before)
            validate(connection)
        finally:
            connection.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--local-state", type=pathlib.Path)
    parser.add_argument("--upgrade", action="store_true")
    parser.add_argument("--migrations", type=pathlib.Path, default=pathlib.Path("migrations"))
    parser.add_argument("--fixture", type=pathlib.Path, default=pathlib.Path("tests/fixtures/previous-production-v0023.sql"))
    arguments = parser.parse_args()
    if arguments.upgrade:
        replay_previous_schema(arguments.migrations, arguments.fixture)
        print("Sanitized previous-production v0023 fixture upgraded through migration 0027 with row preservation, relationship, session, date, status, metadata, integrity, and query-plan checks passing.")
        return 0
    if not arguments.local_state:
        parser.error("--local-state is required unless --upgrade is used")
    database = locate_database(arguments.local_state)
    connection = sqlite3.connect(f"file:{database.as_posix()}?mode=ro", uri=True)
    try:
        validate(connection)
        latest = connection.execute("SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1").fetchone()[0]
    finally:
        connection.close()
    if latest != "0027_remove_review_notes.sql":
        raise RuntimeError(f"Unexpected latest migration: {latest}")
    print("Empty local D1 replay, foreign keys, integrity checks, data checks, and query plans passed.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"Migration integrity check failed: {error}", file=sys.stderr)
        raise SystemExit(1)
