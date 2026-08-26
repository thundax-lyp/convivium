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
        from: 0,
        to: 1,
        apply(db) {
            db.exec(CURRENT_SCHEMA);
        }
    },
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
    }
];

export function migrate(db: DatabaseSync): void {
    const version = Number(
        (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version
    );
    if (version > CURRENT_SCHEMA_VERSION) {
        throw new RepositoryError(
            "SCHEMA_VERSION_UNSUPPORTED",
            false,
            "unknown",
            "Database schema is newer than this plugin"
        );
    }
    if (version === CURRENT_SCHEMA_VERSION) return;
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
                "unknown",
                "Cannot initialize a non-empty SQLite database with schema version 0"
            );
        }
    }
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
                "unknown",
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
        throw error;
    }
}
