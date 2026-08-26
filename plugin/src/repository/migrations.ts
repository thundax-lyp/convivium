import type { DatabaseSync } from "node:sqlite";
import { RepositoryError } from "./errors.js";
import { CURRENT_SCHEMA, CURRENT_SCHEMA_VERSION } from "./schema.js";

export { CURRENT_SCHEMA_VERSION } from "./schema.js";

export interface Migration {
    from: number;
    to: number;
    apply: (db: DatabaseSync) => void;
}

export const migrations: readonly Migration[] = [
    {
        from: 1,
        to: 2,
        apply(db) {
            db.exec(`
CREATE TABLE IF NOT EXISTS meeting_bootstrap (
  meeting_id TEXT PRIMARY KEY REFERENCES meetings(meeting_id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'provisioning', 'ready', 'failed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  failure_code TEXT
);
CREATE TABLE IF NOT EXISTS session_ownership (
  session_id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(meeting_id),
  session_label TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager', 'participant')),
  participant_id TEXT,
  lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('provisioning', 'active', 'closed')),
  capability_status TEXT NOT NULL CHECK (capability_status IN ('active', 'revoked')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(meeting_id, session_label)
);
CREATE INDEX IF NOT EXISTS session_ownership_meeting ON session_ownership(meeting_id, lifecycle_status, capability_status);
INSERT INTO meeting_bootstrap(meeting_id, status, created_at, updated_at, failure_code)
SELECT meeting_id, 'failed', updated_at, updated_at, 'MIGRATED_WITHOUT_BOOTSTRAP'
FROM meetings;
`);
        }
    },
    {
        from: 2,
        to: 3,
        apply(db) {
            db.exec(`
ALTER TABLE meeting_bootstrap ADD COLUMN create_request_id TEXT;
ALTER TABLE meeting_bootstrap ADD COLUMN request_hash TEXT;
ALTER TABLE meeting_bootstrap ADD COLUMN result_json TEXT;
UPDATE meeting_bootstrap
SET
  create_request_id = (
    SELECT request_id FROM idempotency_receipts
    WHERE command_kind = 'create_meeting'
    ORDER BY created_at
    LIMIT 1
  ),
  request_hash = (
    SELECT request_hash FROM idempotency_receipts
    WHERE command_kind = 'create_meeting'
    ORDER BY created_at
    LIMIT 1
  ),
  result_json = (
    SELECT result_json FROM idempotency_receipts
    WHERE command_kind = 'create_meeting'
    ORDER BY created_at
    LIMIT 1
  );
`);
        }
    },
    {
        from: 3,
        to: 4,
        apply(db) {
            db.exec(`
CREATE TABLE meeting_bootstrap_next (
  meeting_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('creating', 'ready', 'creation_failed')),
  create_request_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  result_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  failure_code TEXT
);
INSERT INTO meeting_bootstrap_next(
  meeting_id, status, create_request_id, request_hash, result_json, created_at, updated_at, failure_code
)
SELECT
  meeting_id,
  CASE status
    WHEN 'ready' THEN 'ready'
    WHEN 'failed' THEN 'creation_failed'
    ELSE 'creating'
  END,
  create_request_id,
  request_hash,
  result_json,
  created_at,
  updated_at,
  failure_code
FROM meeting_bootstrap;
DROP TABLE meeting_bootstrap;
ALTER TABLE meeting_bootstrap_next RENAME TO meeting_bootstrap;

CREATE TABLE session_ownership_next (
  session_id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meeting_bootstrap(meeting_id),
  session_label TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager', 'participant')),
  participant_id TEXT,
  lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('provisioning', 'active', 'closed')),
  capability_status TEXT NOT NULL CHECK (capability_status IN ('active', 'revoked')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(meeting_id, session_label)
);
INSERT INTO session_ownership_next SELECT * FROM session_ownership;
DROP TABLE session_ownership;
ALTER TABLE session_ownership_next RENAME TO session_ownership;
CREATE INDEX session_ownership_meeting ON session_ownership(meeting_id, lifecycle_status, capability_status);

CREATE TABLE outbox_next (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meeting_bootstrap(meeting_id),
  delivery_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'leased', 'delivered', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at INTEGER NOT NULL,
  lease_owner TEXT,
  lease_token TEXT,
  lease_deadline INTEGER,
  delivered_at INTEGER,
  failed_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL
);
INSERT INTO outbox_next SELECT * FROM outbox;
DROP TABLE outbox;
ALTER TABLE outbox_next RENAME TO outbox;
CREATE INDEX outbox_claim_order ON outbox(status, available_at, lease_deadline, created_at);
`);
        }
    },
    {
        from: 4,
        to: 5,
        apply(db) {
            const ownershipCount = db
                .prepare("SELECT COUNT(*) AS count FROM session_ownership")
                .get() as { count: number };
            if (Number(ownershipCount.count) !== 0) {
                throw new RepositoryError(
                    "SCHEMA_VERSION_UNSUPPORTED",
                    false,
                    "unknown",
                    "Cannot infer session parent or provider from an existing ownership record"
                );
            }
            db.exec(`
CREATE TABLE session_ownership_next (
  session_id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meeting_bootstrap(meeting_id),
  parent_session_id TEXT NOT NULL,
  session_label TEXT NOT NULL,
  provider TEXT NOT NULL,
  initial_message_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('manager', 'participant')),
  participant_id TEXT,
  lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('provisioning', 'active', 'closed')),
  capability_status TEXT NOT NULL CHECK (capability_status IN ('active', 'revoked')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(meeting_id, session_label)
);
DROP TABLE session_ownership;
ALTER TABLE session_ownership_next RENAME TO session_ownership;
CREATE INDEX session_ownership_meeting ON session_ownership(meeting_id, lifecycle_status, capability_status);
`);
        }
    }
];

export function migrate(db: DatabaseSync, meetingId = "unknown"): void {
    const version = Number(
        (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version
    );
    if (version > CURRENT_SCHEMA_VERSION) {
        throw new RepositoryError(
            "SCHEMA_VERSION_UNSUPPORTED",
            false,
            meetingId,
            "Database schema is newer than this plugin"
        );
    }
    if (version === 0) {
        const existingObjects = db
            .prepare(
                "SELECT COUNT(*) AS count FROM sqlite_master WHERE type IN ('table', 'index', 'trigger', 'view') AND name NOT LIKE 'sqlite_%'"
            )
            .get() as { count: number };
        if (Number(existingObjects.count) !== 0) {
            throw new RepositoryError(
                "SCHEMA_VERSION_UNSUPPORTED",
                false,
                meetingId,
                "Cannot initialize a non-empty SQLite database with schema version 0"
            );
        }
        db.exec("BEGIN IMMEDIATE");
        try {
            db.exec(CURRENT_SCHEMA);
            db.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`);
            db.exec("COMMIT");
            return;
        } catch (error) {
            try {
                db.exec("ROLLBACK");
            } catch {
                // Preserve the original initialization failure.
            }
            throw error;
        }
    }
    if (version === CURRENT_SCHEMA_VERSION) return;
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN IMMEDIATE");
    try {
        let current = version;
        for (const migration of migrations) {
            if (migration.from !== current) continue;
            migration.apply(db);
            current = migration.to;
            db.exec(`PRAGMA user_version = ${current}`);
        }
        if (current !== CURRENT_SCHEMA_VERSION) {
            throw new RepositoryError(
                "SCHEMA_VERSION_UNSUPPORTED",
                false,
                meetingId,
                "Missing contiguous SQLite migration"
            );
        }
        db.exec("COMMIT");
    } catch (error) {
        try {
            db.exec("ROLLBACK");
        } catch {
            // Preserve the original migration failure.
        }
        if (error instanceof RepositoryError && error.meetingId === "unknown") {
            throw new RepositoryError(error.code, error.retryable, meetingId, error.message);
        }
        throw error;
    } finally {
        db.exec("PRAGMA foreign_keys = ON");
    }
}
