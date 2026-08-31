import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { CURRENT_SCHEMA, CURRENT_SCHEMA_VERSION } from "../../../src/repository/schema.js";

describe("current repository schema", () => {
    it("requires direct parent and provider while keeping initial message optional", () => {
        const database = new DatabaseSync(":memory:");
        database.exec(CURRENT_SCHEMA);

        const columns = database.prepare("PRAGMA table_info(session_ownership)").all() as Array<{
            name: string;
            notnull: number;
        }>;

        expect(CURRENT_SCHEMA_VERSION).toBe(6);
        expect(columns).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: "parent_session_id", notnull: 1 }),
                expect.objectContaining({ name: "provider", notnull: 1 }),
                expect.objectContaining({ name: "initial_message_id", notnull: 0 })
            ])
        );
        expect(database.prepare("PRAGMA table_info(meeting_mail)").all()).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: "mail_id", notnull: 0 }),
                expect.objectContaining({ name: "content", notnull: 1 }),
                expect.objectContaining({ name: "processing_through_seq", notnull: 0 })
            ])
        );
        database.close();
    });
});
