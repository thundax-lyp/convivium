import { describe, expect, it } from "vitest";
import type { MeetingRepositoryPort } from "../../src/repository/meeting-repository-port.js";
import { SqliteMeetingRepository } from "../../src/repository/sqlite-meeting-repository.js";

describe("MeetingRepositoryPort", () => {
    it("is implemented by the SQLite repository", () => {
        const implementation: MeetingRepositoryPort = SqliteMeetingRepository.prototype;
        expect(implementation).toBeDefined();
    });
});
