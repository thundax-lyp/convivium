import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import {
    MeetingRepository,
    RepositoryError,
    type RepositoryCommand
} from "../../src/repository/index.js";

const roots: string[] = [];

async function openRepository() {
    const root = await mkdtemp(join(tmpdir(), "convivium-repository-"));
    roots.push(root);
    return MeetingRepository.open({
        databasePath: join(root, "meeting.sqlite"),
        teamId: "team-1",
        meetingId: "meeting-1"
    });
}

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("MeetingRepository", () => {
    it("bootstraps an empty database and returns an idempotent create receipt", async () => {
        const repository = await openRepository();
        const input = {
            requestId: "request-1",
            callerBinding: "captain:1",
            requestHash: "hash-1",
            initialState: { status: "created" as const }
        };

        const first = await repository.create(input);
        const duplicate = await repository.create(input);

        expect(first).toEqual(duplicate);
        expect(await repository.read()).toMatchObject({ version: 0, state: { status: "created" } });
        await repository.close();
    });

    it("rejects a conflicting idempotency hash and stale version", async () => {
        const repository = await openRepository();
        await repository.create({
            requestId: "create",
            callerBinding: "captain:1",
            requestHash: "create-hash",
            initialState: { count: 0 }
        });

        const command: RepositoryCommand<{ count: number }> = {
            requestId: "command-1",
            commandKind: "increment",
            callerBinding: "captain:1",
            requestHash: "command-hash",
            expectedMeetingVersion: 0,
            transition: (snapshot) => ({
                state: { count: Number(snapshot.state.count) + 1 },
                result: { count: Number(snapshot.state.count) + 1 },
                events: [{ type: "message.added", payload: { count: 1 } }],
                outbox: []
            })
        };

        await repository.execute(command);
        await expect(
            repository.execute({ ...command, requestHash: "different-hash" })
        ).rejects.toMatchObject<RepositoryError>({ code: "IDEMPOTENCY_CONFLICT" });
        await expect(
            repository.execute({ ...command, requestId: "command-2" })
        ).rejects.toMatchObject<RepositoryError>({ code: "VERSION_CONFLICT" });
        expect((await repository.read()).version).toBe(1);
        await repository.close();
    });

    it("rolls back state, events and outbox when a transition write fails", async () => {
        const repository = await openRepository();
        await repository.create({
            requestId: "create",
            callerBinding: "captain:1",
            requestHash: "create-hash",
            initialState: { count: 0 }
        });

        await expect(
            repository.execute({
                requestId: "bad-command",
                commandKind: "bad",
                callerBinding: "captain:1",
                requestHash: "bad-hash",
                expectedMeetingVersion: 0,
                transition: () => ({
                    state: { count: 1 },
                    result: { ok: true },
                    events: [{ type: "message.added", payload: { ok: true } }],
                    outbox: [
                        { deliveryId: "delivery-1", kind: "dispatch", payload: { ok: true } },
                        { deliveryId: "delivery-1", kind: "duplicate", payload: { ok: true } }
                    ]
                })
            })
        ).rejects.toMatchObject<RepositoryError>({ code: "CORRUPT_DATABASE" });

        expect(await repository.read()).toMatchObject({ version: 0, state: { count: 0 } });
        await repository.close();
    });

    it("rejects stale outbox completion after lease expiry and reclaims the item", async () => {
        const repository = await openRepository();
        await repository.create({
            requestId: "create",
            callerBinding: "captain:1",
            requestHash: "create-hash",
            initialState: { status: "created" },
            createdAt: 0,
            outbox: [
                { deliveryId: "delivery-1", kind: "dispatch", payload: { meetingId: "meeting-1" } }
            ]
        });

        const first = await repository.claimOutbox({
            owner: "worker-a",
            ttlMs: 10,
            batchSize: 1,
            now: 100
        });
        const second = await repository.claimOutbox({
            owner: "worker-b",
            ttlMs: 100,
            batchSize: 1,
            now: 111
        });

        expect(first).toHaveLength(1);
        expect(second[0]?.leaseOwner).toBe("worker-b");
        await expect(
            repository.completeOutbox({
                id: first[0].id,
                leaseOwner: first[0].leaseOwner,
                leaseToken: first[0].leaseToken,
                completion: { status: "delivered" }
            })
        ).rejects.toMatchObject<RepositoryError>({ code: "LEASE_LOST" });
        await expect(
            repository.completeOutbox({
                id: second[0].id,
                leaseOwner: second[0].leaseOwner,
                leaseToken: second[0].leaseToken,
                completion: { status: "delivered" }
            })
        ).resolves.toMatchObject({ status: "delivered" });
        await repository.close();
    });
});
