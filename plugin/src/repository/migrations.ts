import type { DatabaseSync } from "node:sqlite";
import { RepositoryError } from "./index.js";
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
