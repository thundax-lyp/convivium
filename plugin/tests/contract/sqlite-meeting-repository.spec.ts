import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteMeetingRepository as MeetingRepository } from "../../src/repository/sqlite-meeting-repository.js";
import { RepositoryError } from "../../src/repository/errors.js";
import { defineMeetingRepositoryBehaviorContract } from "./meeting-repository-behavior.js";
import type {
    CommandAuthorization,
    RepositoryAuthorizationValidator
} from "../../src/repository/types.js";

const roots: string[] = [];
const authorization: CommandAuthorization = {
    callerBinding: "captain:1",
    capabilityId: "capability:1",
    attemptId: "attempt:1"
};
const allowAuthorization: RepositoryAuthorizationValidator = {
    validateCreate: () => undefined,
    validateCommand: () => undefined
};
async function openRepository(authorizationValidator = allowAuthorization) {
    const root = await mkdtemp(join(tmpdir(), "convivium-contract-"));
    roots.push(root);
    return MeetingRepository.open({
        databasePath: join(root, "meeting.sqlite"),
        teamId: "team-1",
        meetingId: "meeting-1",
        authorizationValidator
    });
}
async function createMeeting(
    repository: MeetingRepository,
    input: Parameters<MeetingRepository["completeCreate"]>[0]
) {
    await repository.create(input);
    return repository.completeCreate(input);
}
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
defineMeetingRepositoryBehaviorContract("SQLite MeetingRepository behavior contract", {
    open: openRepository,
    rejectCorruptedReadyState: async () => {
        const repository = await openRepository();
        const input = {
            requestId: "create",
            authorization,
            requestHash: "create-hash",
            initialState: { status: "created" }
        };
        await createMeeting(repository, input);
        const databasePath = join(roots.at(-1)!, "meeting.sqlite");
        await repository.close();
        const db = new DatabaseSync(databasePath);
        db.prepare("UPDATE meetings SET state_json = ? WHERE meeting_id = ?").run("{", "meeting-1");
        db.close();
        const reopened = await MeetingRepository.open({
            databasePath,
            teamId: "team-1",
            meetingId: "meeting-1",
            authorizationValidator: allowAuthorization
        });
        try {
            await reopened.read();
        } finally {
            await reopened.close();
        }
    }
});
describe("SQLite MeetingRepository atomicity", () => {
    it("rolls back state, events and outbox when a transition write fails", async () => {
        const repository = await openRepository();
        await createMeeting(repository, {
            requestId: "create",
            authorization,
            requestHash: "create-hash",
            initialState: { count: 0 }
        });

        await expect(
            repository.execute({
                requestId: "bad-command",
                commandKind: "bad",
                authorization,
                requestHash: "bad-hash",
                expectedMeetingVersion: 0,
                transition: () => ({
                    state: { count: 1 },
                    result: { ok: true },
                    events: [{ type: "message.added", payload: { ok: true } }],
                    outbox: [
                        { deliveryId: "delivery-1", kind: "dispatch", payload: { ok: true } },
                        { deliveryId: "delivery-1", kind: "dispatch", payload: { ok: true } }
                    ]
                })
            })
        ).rejects.toMatchObject<RepositoryError>({ code: "CONSTRAINT_VIOLATION" });

        expect(await repository.read()).toMatchObject({ version: 0, state: { count: 0 } });
        await repository.close();
    });
});
