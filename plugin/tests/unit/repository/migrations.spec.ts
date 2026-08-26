import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { RepositoryError } from "../../../src/repository/errors.js";
import { migrate } from "../../../src/repository/migrations.js";

function legacyOwnershipDatabase(): DatabaseSync {
    const database = new DatabaseSync(":memory:");
    database.exec(`
CREATE TABLE session_ownership (
  session_id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  session_label TEXT NOT NULL,
  role TEXT NOT NULL,
  participant_id TEXT,
  lifecycle_status TEXT NOT NULL,
  capability_status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
PRAGMA user_version = 4;
`);
    return database;
}

describe("session ownership migration", () => {
    it("upgrades an empty version-four ownership table to the current schema", () => {
        const database = legacyOwnershipDatabase();

        migrate(database, "meeting-1");

        expect(database.prepare("PRAGMA user_version").get()).toMatchObject({ user_version: 5 });
        expect(
            database.prepare("PRAGMA table_info(session_ownership)").all()
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: "parent_session_id", notnull: 1 }),
                expect.objectContaining({ name: "provider", notnull: 1 }),
                expect.objectContaining({ name: "initial_message_id", notnull: 0 })
            ])
        );
        database.close();
    });

    it("isolates legacy ownership whose direct parent and provider cannot be inferred", () => {
        const database = legacyOwnershipDatabase();
        database
            .prepare(
                "INSERT INTO session_ownership VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )
            .run(
                "session-1",
                "meeting-1",
                "convivium:meeting-manager:team-1:meeting-1",
                "manager",
                null,
                "active",
                "active",
                1,
                1
            );

        expect(() => migrate(database, "meeting-1")).toThrowError(
            expect.objectContaining<Partial<RepositoryError>>({
                code: "SCHEMA_VERSION_UNSUPPORTED",
                meetingId: "meeting-1"
            })
        );
        expect(database.prepare("PRAGMA user_version").get()).toMatchObject({ user_version: 4 });
        database.close();
    });
});
