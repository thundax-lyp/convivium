import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";
import {
    MeetingRepository,
    RepositoryError,
    type CommandAuthorization,
    type RepositoryAuthorizationValidator,
    type RepositoryCommand
} from "../../src/repository/index.js";
import { migrate } from "../../src/repository/migrations.js";

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

async function openRepository() {
    const root = await mkdtemp(join(tmpdir(), "convivium-repository-"));
    roots.push(root);
    return MeetingRepository.open({
        databasePath: join(root, "meeting.sqlite"),
        teamId: "team-1",
        meetingId: "meeting-1",
        authorizationValidator: allowAuthorization
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
            authorization,
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
            authorization,
            requestHash: "create-hash",
            initialState: { count: 0 }
        });

        const command: RepositoryCommand<{ count: number }> = {
            requestId: "command-1",
            commandKind: "increment",
            authorization,
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

    it("rejects stale outbox completion after lease expiry and reclaims the item", async () => {
        const repository = await openRepository();
        await repository.create({
            requestId: "create",
            authorization,
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
                completion: { status: "delivered" },
                now: 112
            })
        ).resolves.toMatchObject({ status: "delivered" });
        await repository.close();
    });

    it("rejects completion after expiry even before another worker claims the item", async () => {
        const repository = await openRepository();
        await repository.create({
            requestId: "create",
            authorization,
            requestHash: "create-hash",
            initialState: { status: "created" },
            createdAt: 0,
            outbox: [
                { deliveryId: "delivery-1", kind: "dispatch", payload: { meetingId: "meeting-1" } }
            ]
        });
        const [lease] = await repository.claimOutbox({
            owner: "worker-a",
            ttlMs: 10,
            batchSize: 1,
            now: 100
        });

        await expect(
            repository.completeOutbox({
                id: lease.id,
                leaseOwner: lease.leaseOwner,
                leaseToken: lease.leaseToken,
                completion: { status: "delivered" },
                now: 111
            })
        ).rejects.toMatchObject<RepositoryError>({ code: "LEASE_LOST" });
        await repository.close();
    });

    it("persists bootstrap and session ownership for recovery", async () => {
        const repository = await openRepository();
        await repository.create({
            requestId: "create",
            authorization,
            requestHash: "create-hash",
            initialState: { status: "created" },
            createdAt: 10
        });
        await repository.updateBootstrap({ status: "provisioning", now: 11 });
        await repository.recordSessionOwnership(
            {
                sessionId: "session-1",
                sessionLabel: "convivium/team-1/meeting-1/manager",
                role: "manager",
                lifecycleStatus: "provisioning",
                capabilityStatus: "active"
            },
            12
        );
        await repository.recordSessionOwnership(
            {
                sessionId: "session-1",
                sessionLabel: "convivium/team-1/meeting-1/manager",
                role: "manager",
                lifecycleStatus: "closed",
                capabilityStatus: "revoked"
            },
            13
        );
        await expect(
            repository.recordSessionOwnership(
                {
                    sessionId: "session-1",
                    sessionLabel: "convivium/team-1/meeting-1/manager",
                    role: "manager",
                    lifecycleStatus: "active",
                    capabilityStatus: "active"
                },
                14
            )
        ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_STATE" });

        await expect(repository.recover({ now: 15 })).resolves.toMatchObject({
            bootstrap: {
                status: "provisioning",
                createRequestId: "create",
                requestHash: "create-hash",
                createResult: { meetingId: "meeting-1", meetingVersion: 0 },
                createdAt: 10,
                updatedAt: 11
            },
            sessionOwnership: [
                {
                    sessionId: "session-1",
                    lifecycleStatus: "closed",
                    capabilityStatus: "revoked",
                    createdAt: 12,
                    updatedAt: 13
                }
            ]
        });
        await repository.close();
    });

    it("requires the authorization validator before a new command commits", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-repository-"));
        roots.push(root);
        const repository = await MeetingRepository.open({
            databasePath: join(root, "meeting.sqlite"),
            teamId: "team-1",
            meetingId: "meeting-1",
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => {
                    throw new RepositoryError(
                        "INVALID_STATE",
                        false,
                        "meeting-1",
                        "Capability is revoked"
                    );
                }
            }
        });
        await repository.create({
            requestId: "create",
            authorization,
            requestHash: "create-hash",
            initialState: { count: 0 }
        });

        await expect(
            repository.execute({
                requestId: "command",
                commandKind: "increment",
                authorization,
                requestHash: "command-hash",
                expectedMeetingVersion: 0,
                transition: () => ({
                    state: { count: 1 },
                    result: { count: 1 },
                    events: [{ type: "hand_raise.created", payload: { handRaiseId: "hand-1" } }],
                    outbox: []
                })
            })
        ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_STATE" });
        expect(await repository.read()).toMatchObject({ version: 0, state: { count: 0 } });
        await repository.close();
    });

    it("rejects a non-empty version-zero database instead of treating it as fresh", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-repository-"));
        roots.push(root);
        const databasePath = join(root, "meeting.sqlite");
        const db = new DatabaseSync(databasePath);
        db.exec("CREATE TABLE stray_data(value TEXT)");
        db.close();

        await expect(
            MeetingRepository.open({
                databasePath,
                teamId: "team-1",
                meetingId: "meeting-1",
                authorizationValidator: allowAuthorization
            })
        ).rejects.toMatchObject<RepositoryError>({ code: "SCHEMA_VERSION_UNSUPPORTED" });
    });

    it("upgrades a version-two bootstrap without replaying current schema DDL", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-repository-"));
        roots.push(root);
        const db = new DatabaseSync(join(root, "meeting.sqlite"));
        db.exec(`
CREATE TABLE meetings (meeting_id TEXT PRIMARY KEY, updated_at INTEGER NOT NULL);
CREATE TABLE idempotency_receipts (
  request_id TEXT NOT NULL,
  command_kind TEXT NOT NULL,
  caller_binding TEXT NOT NULL,
  result_json TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  meeting_version INTEGER NOT NULL,
  event_seqs_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(request_id, command_kind, caller_binding)
);
CREATE TABLE meeting_bootstrap (
  meeting_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  failure_code TEXT
);
INSERT INTO meetings VALUES ('meeting-1', 10);
INSERT INTO meeting_bootstrap VALUES ('meeting-1', 'pending', 10, 10, NULL);
INSERT INTO idempotency_receipts VALUES ('create', 'create_meeting', 'captain:1', '{"meetingId":"meeting-1","meetingVersion":0}', 'create-hash', 0, '[1]', 10);
PRAGMA user_version = 2;
`);

        migrate(db);
        expect(db.prepare("PRAGMA user_version").get() as { user_version: number }).toMatchObject({
            user_version: 3
        });
        expect(
            db
                .prepare(
                    "SELECT create_request_id, request_hash, result_json FROM meeting_bootstrap WHERE meeting_id = ?"
                )
                .get("meeting-1")
        ).toMatchObject({
            create_request_id: "create",
            request_hash: "create-hash",
            result_json: '{"meetingId":"meeting-1","meetingVersion":0}'
        });
        db.close();
    });

    it("isolates a database whose stored identity differs from the requested meeting", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-repository-"));
        roots.push(root);
        const databasePath = join(root, "meeting.sqlite");
        const original = await MeetingRepository.open({
            databasePath,
            teamId: "team-1",
            meetingId: "meeting-1",
            authorizationValidator: allowAuthorization
        });
        await original.create({
            requestId: "create",
            authorization,
            requestHash: "create-hash",
            initialState: { status: "created" }
        });
        await original.close();

        await expect(
            MeetingRepository.open({
                databasePath,
                teamId: "team-2",
                meetingId: "meeting-2",
                authorizationValidator: allowAuthorization
            })
        ).rejects.toMatchObject<RepositoryError>({ code: "CORRUPT_DATABASE" });
    });

    it("rejects a session label whose meeting segment only contains the requested id", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-repository-"));
        roots.push(root);
        const databasePath = join(root, "meeting.sqlite");
        const repository = await MeetingRepository.open({
            databasePath,
            teamId: "team-1",
            meetingId: "meeting-1",
            authorizationValidator: allowAuthorization
        });
        await repository.create({
            requestId: "create",
            authorization,
            requestHash: "create-hash",
            initialState: { status: "created" }
        });
        await repository.recordSessionOwnership({
            sessionId: "session-1",
            sessionLabel: "convivium/team-1/meeting-1/manager",
            role: "manager",
            lifecycleStatus: "active",
            capabilityStatus: "active"
        });
        await repository.close();
        const db = new DatabaseSync(databasePath);
        db.prepare("UPDATE session_ownership SET session_label = ? WHERE session_id = ?").run(
            "convivium/team-1/meeting-10/manager",
            "session-1"
        );
        db.close();

        await expect(
            MeetingRepository.open({
                databasePath,
                teamId: "team-1",
                meetingId: "meeting-1",
                authorizationValidator: allowAuthorization
            })
        ).rejects.toMatchObject<RepositoryError>({ code: "CORRUPT_DATABASE" });
    });

    it("rejects a mismatched version-two database before migration writes it", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-repository-"));
        roots.push(root);
        const databasePath = join(root, "meeting.sqlite");
        const repository = await MeetingRepository.open({
            databasePath,
            teamId: "team-1",
            meetingId: "meeting-1",
            authorizationValidator: allowAuthorization
        });
        await repository.create({
            requestId: "create",
            authorization,
            requestHash: "create-hash",
            initialState: { status: "created" }
        });
        await repository.close();
        const db = new DatabaseSync(databasePath);
        db.prepare("UPDATE meetings SET team_id = ? WHERE meeting_id = ?").run(
            "team-2",
            "meeting-1"
        );
        db.exec("PRAGMA user_version = 2");
        db.close();

        await expect(
            MeetingRepository.open({
                databasePath,
                teamId: "team-1",
                meetingId: "meeting-1",
                authorizationValidator: allowAuthorization
            })
        ).rejects.toMatchObject<RepositoryError>({ code: "CORRUPT_DATABASE" });
        const verificationDb = new DatabaseSync(databasePath);
        expect(
            verificationDb.prepare("PRAGMA user_version").get() as { user_version: number }
        ).toMatchObject({ user_version: 2 });
        verificationDb.close();
    });

    it("rejects unregistered outbox kinds before committing a create", async () => {
        const repository = await openRepository();
        await expect(
            repository.create({
                requestId: "create",
                authorization,
                requestHash: "create-hash",
                initialState: { status: "created" },
                outbox: [
                    {
                        deliveryId: "delivery-1",
                        kind: "unknown" as never,
                        payload: { meetingId: "meeting-1" }
                    }
                ]
            })
        ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_INPUT" });
        await repository.close();
    });

    it("rejects a state transition that has no domain event", async () => {
        const repository = await openRepository();
        await repository.create({
            requestId: "create",
            authorization,
            requestHash: "create-hash",
            initialState: { count: 0 }
        });

        await expect(
            repository.execute({
                requestId: "eventless",
                commandKind: "increment",
                authorization,
                requestHash: "eventless-hash",
                expectedMeetingVersion: 0,
                transition: () => ({
                    state: { count: 1 },
                    result: { count: 1 },
                    events: [],
                    outbox: []
                })
            })
        ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_STATE" });
        expect(await repository.read()).toMatchObject({ version: 0, state: { count: 0 } });
        await repository.close();
    });
});
