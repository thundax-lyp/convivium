import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";
import {
    MeetingRepository,
    RepositoryError,
    type CommandAuthorization,
    type RepositoryAuthorizationValidator,
    type RepositoryCommand
} from "../../src/repository/index.js";
import { CURRENT_SCHEMA_VERSION, migrate } from "../../src/repository/migrations.js";

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

describe("MeetingRepository", () => {
    it("bootstraps an empty database and returns an idempotent create receipt", async () => {
        const repository = await openRepository();
        const input = {
            requestId: "request-1",
            authorization,
            requestHash: "hash-1",
            initialState: { status: "created" as const }
        };

        const bootstrap = await repository.create(input);
        expect(bootstrap).toMatchObject({
            status: "creating",
            createRequestId: "request-1",
            requestHash: "hash-1"
        });
        await expect(repository.read()).rejects.toMatchObject<RepositoryError>({
            code: "MEETING_NOT_FOUND"
        });
        await expect(repository.create(input)).resolves.toEqual(bootstrap);
        const first = await repository.completeCreate(input);
        const duplicate = await repository.completeCreate(input);

        expect(first).toEqual(duplicate);
        expect(await repository.read()).toMatchObject({ version: 0, state: { status: "created" } });
        await repository.close();
    });

    it("allows a separately authorized caller to complete the bootstrap", async () => {
        const repository = await openRepository();
        const creator = {
            requestId: "create",
            authorization,
            requestHash: "create-hash",
            initialState: { status: "created" as const }
        };
        const completer = {
            ...creator,
            authorization: {
                callerBinding: "captain:2",
                capabilityId: "capability:2"
            }
        };

        await repository.create(creator);
        const result = await repository.completeCreate(completer);

        expect(result.result).toEqual({ meetingId: "meeting-1", meetingVersion: 0 });
        expect(await repository.read()).toMatchObject({ version: 0, state: { status: "created" } });
        await repository.close();
    });

    it("recovers a creating bootstrap without requiring a public meeting", async () => {
        const repository = await openRepository();
        await repository.create({
            requestId: "create",
            authorization,
            requestHash: "create-hash",
            initialState: { status: "created" },
            createdAt: 10
        });
        await repository.recordSessionOwnership(
            {
                sessionId: "session-1",
                parentSessionId: "captain-session-1",
                sessionLabel: "convivium:meeting-manager:team-1:meeting-1",
                provider: "test-continuable-provider",
                role: "manager",
                lifecycleStatus: "provisioning",
                capabilityStatus: "active",
                initialMessageId: "m1"
            },
            11
        );

        const recovery = await repository.recover({ now: 12 });

        expect(recovery).toMatchObject({
            bootstrap: { status: "creating" },
            sessionOwnership: [{ sessionId: "session-1" }],
            reclaimedOutbox: 0,
            pendingOutbox: 0
        });
        expect(recovery).not.toHaveProperty("snapshot");
        await repository.close();
    });

    it("rejects a second repository claiming the same initially empty database", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-repository-"));
        roots.push(root);
        const databasePath = join(root, "meeting.sqlite");
        const first = await MeetingRepository.open({
            databasePath,
            teamId: "team-1",
            meetingId: "meeting-1",
            authorizationValidator: allowAuthorization
        });
        const second = await MeetingRepository.open({
            databasePath,
            teamId: "team-2",
            meetingId: "meeting-2",
            authorizationValidator: allowAuthorization
        });
        const input = {
            requestId: "create",
            authorization,
            requestHash: "create-hash",
            initialState: { status: "created" }
        };

        await first.create(input);
        await expect(second.create(input)).rejects.toMatchObject<RepositoryError>({
            code: "CORRUPT_DATABASE",
            meetingId: "meeting-2"
        });
        await first.close();
        await second.close();
    });

    it("rejects a conflicting idempotency hash and stale version", async () => {
        const repository = await openRepository();
        await createMeeting(repository, {
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

    it("keeps the embedded MeetingState version in sync for plain commands", async () => {
        const repository = await openRepository();
        await createMeeting(repository, {
            requestId: "create",
            authorization,
            requestHash: "create-hash",
            initialState: { status: "created", version: 0, updatedAt: 1 }
        });

        await repository.execute({
            requestId: "plain-command",
            commandKind: "raise_hand",
            authorization,
            requestHash: "plain-command-hash",
            expectedMeetingVersion: 0,
            transition: (snapshot) => ({
                state: { ...snapshot.state, status: "waiting" },
                result: { status: "waiting" },
                events: [{ type: "hand_raise.created", payload: {} }],
                outbox: []
            })
        });

        expect(await repository.read()).toMatchObject({
            version: 1,
            state: { version: 1, status: "waiting" }
        });
        await repository.close();
    });

    it("rolls back and preserves a transition validation error", async () => {
        const repository = await openRepository();
        await createMeeting(repository, {
            requestId: "create",
            authorization,
            requestHash: "create-hash",
            initialState: { count: 0 }
        });
        const validationError = Object.assign(new Error("stale manager attempt"), {
            code: "STALE_MANAGER_ATTEMPT",
            retryable: false
        });

        await expect(
            repository.execute({
                requestId: "invalid-transition",
                commandKind: "submit_manager_plan",
                authorization,
                requestHash: "invalid-transition-hash",
                expectedMeetingVersion: 0,
                transition: () => {
                    throw validationError;
                }
            })
        ).rejects.toBe(validationError);
        expect((await repository.read()).version).toBe(0);
        await repository.close();
    });

    it("uses the generic receipt for speaker attempts and manager plans", async () => {
        const repository = await openRepository();
        await createMeeting(repository, {
            requestId: "create",
            authorization,
            requestHash: "create-hash",
            initialState: { count: 0 }
        });

        const submitSpeaker = (
            authorizationOverride: CommandAuthorization
        ): RepositoryCommand<{
            committed: string;
        }> => ({
            requestId: "speaker-attempt-1",
            commandKind: "submit_speaker_attempt",
            authorization: authorizationOverride,
            requestHash: "speaker-hash",
            expectedMeetingVersion: 0,
            transition: (snapshot) => ({
                state: { count: Number(snapshot.state.count) + 1 },
                result: { committed: "speaker-attempt-1" },
                events: [{ type: "message.added", payload: { count: 1 } }],
                outbox: []
            })
        });

        const speakerFirst = await repository.execute(submitSpeaker(authorization));
        const speakerDuplicate = await repository.execute(
            submitSpeaker({ ...authorization, attemptId: "different-attempt" })
        );
        expect(speakerDuplicate).toEqual(speakerFirst);

        const managerAuthorization = {
            ...authorization,
            attemptId: undefined,
            callerBinding: "manager:1"
        } satisfies CommandAuthorization;
        const submitManagerPlan: RepositoryCommand<{ committed: string }> = {
            requestId: "manager-plan-1",
            commandKind: "submit_manager_plan",
            authorization: managerAuthorization,
            requestHash: "manager-hash",
            expectedMeetingVersion: 1,
            transition: (snapshot) => ({
                state: { count: Number(snapshot.state.count) + 1 },
                result: { committed: "manager-plan-1" },
                events: [{ type: "turn.planned", payload: { turnId: "turn-1" } }],
                outbox: []
            })
        };

        const managerFirst = await repository.execute(submitManagerPlan);
        const managerDuplicate = await repository.execute(submitManagerPlan);
        expect(managerDuplicate).toEqual(managerFirst);
        expect((await repository.read()).version).toBe(2);
        await repository.close();
    });

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

    it("serializes Captain end against a same-version meeting fact command", async () => {
        const repository = await openRepository();
        await createMeeting(repository, {
            requestId: "create",
            authorization,
            requestHash: "create-hash",
            initialState: { status: "running", completionFactIds: [] }
        });
        const endCommand: RepositoryCommand<{ status: string }> = {
            requestId: "end-1",
            commandKind: "end_meeting",
            authorization,
            requestHash: "end-hash",
            expectedMeetingVersion: 0,
            transition: (snapshot) => ({
                state: { ...snapshot.state, status: "completed" },
                result: { status: "completed" },
                events: [{ type: "meeting.ended", payload: { status: "completed" } }],
                outbox: []
            })
        };
        const meetingFactCommand = (expectedMeetingVersion: number) => ({
            requestId: `fact-${expectedMeetingVersion}`,
            commandKind: "associate_task_snapshot",
            authorization: { ...authorization, callerBinding: "participant:1" },
            requestHash: `fact-hash-${expectedMeetingVersion}`,
            expectedMeetingVersion,
            transition: (snapshot: Awaited<ReturnType<MeetingRepository["read"]>>) => {
                if (snapshot.state.status === "completed") {
                    throw Object.assign(new Error("terminal meeting is immutable"), {
                        code: "IMMUTABLE_MEETING",
                        retryable: false
                    });
                }
                return {
                    state: { ...snapshot.state, completionFactIds: ["task-fact-1"] },
                    result: { completionFactId: "task-fact-1" },
                    events: [
                        {
                            type: "completion_fact.added" as const,
                            payload: { completionFactId: "task-fact-1" }
                        }
                    ],
                    outbox: []
                };
            }
        });

        const [endResult, factResult] = await Promise.allSettled([
            repository.execute(endCommand),
            repository.execute(meetingFactCommand(0))
        ]);

        expect(endResult.status).toBe("fulfilled");
        expect(factResult).toMatchObject({
            status: "rejected",
            reason: { code: "VERSION_CONFLICT" }
        });
        await expect(repository.execute(meetingFactCommand(1))).rejects.toMatchObject({
            code: "IMMUTABLE_MEETING"
        });
        expect(await repository.read()).toMatchObject({
            version: 1,
            state: { status: "completed", completionFactIds: [] }
        });
        await repository.close();
    });

    it("rejects stale outbox completion after lease expiry and reclaims the item", async () => {
        const repository = await openRepository();
        await createMeeting(repository, {
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

    it("renews an owned outbox lease before a long dispatch completes", async () => {
        const repository = await openRepository();
        await createMeeting(repository, {
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
            repository.renewOutboxLease({
                id: lease.id,
                leaseOwner: lease.leaseOwner,
                leaseToken: lease.leaseToken,
                ttlMs: 10,
                now: 105
            })
        ).resolves.toBe(115);
        await expect(
            repository.completeOutbox({
                id: lease.id,
                leaseOwner: lease.leaseOwner,
                leaseToken: lease.leaseToken,
                completion: { status: "delivered" },
                now: 111
            })
        ).resolves.toMatchObject({ status: "delivered" });
        await repository.close();
    });

    it("replays a committed command without rerunning its transition or duplicating outbox", async () => {
        const repository = await openRepository();
        await createMeeting(repository, {
            requestId: "create",
            authorization,
            requestHash: "create-hash",
            initialState: { count: 0 }
        });
        let transitionCalls = 0;
        const command: RepositoryCommand<{ count: number }> = {
            requestId: "command-1",
            commandKind: "increment",
            authorization,
            requestHash: "command-hash",
            expectedMeetingVersion: 0,
            transition: (snapshot) => {
                transitionCalls += 1;
                return {
                    state: { count: Number(snapshot.state.count) + 1 },
                    result: { count: 1 },
                    events: [{ type: "message.added", payload: { count: 1 } }],
                    outbox: [
                        {
                            deliveryId: "delivery-1",
                            kind: "dispatch",
                            payload: { count: 1 }
                        }
                    ]
                };
            }
        };

        const first = await repository.execute(command);
        const replay = await repository.execute(command);

        expect(replay).toEqual(first);
        expect(transitionCalls).toBe(1);
        expect((await repository.read()).version).toBe(1);
        expect((await repository.recover()).pendingOutbox).toBe(1);
        await repository.close();
    });

    it("rejects completion after expiry even before another worker claims the item", async () => {
        const repository = await openRepository();
        await createMeeting(repository, {
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
        await repository.recordSessionOwnership(
            {
                sessionId: "session-1",
                parentSessionId: "captain-session-1",
                sessionLabel: "convivium:meeting-manager:team-1:meeting-1",
                provider: "test-continuable-provider",
                role: "manager",
                lifecycleStatus: "provisioning",
                capabilityStatus: "active"
            },
            12
        );
        await repository.recordSessionOwnership(
            {
                sessionId: "session-1",
                parentSessionId: "captain-session-1",
                sessionLabel: "convivium:meeting-manager:team-1:meeting-1",
                provider: "test-continuable-provider",
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
                    parentSessionId: "captain-session-1",
                    sessionLabel: "convivium:meeting-manager:team-1:meeting-1",
                    provider: "test-continuable-provider",
                    role: "manager",
                    lifecycleStatus: "active",
                    capabilityStatus: "active"
                },
                14
            )
        ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_STATE" });

        await repository.completeCreate({
            requestId: "create",
            authorization,
            requestHash: "create-hash",
            initialState: { status: "created" },
            createdAt: 14
        });

        await expect(repository.recover({ now: 15 })).resolves.toMatchObject({
            bootstrap: {
                status: "ready",
                createRequestId: "create",
                requestHash: "create-hash",
                createResult: { meetingId: "meeting-1", meetingVersion: 0 },
                createdAt: 10,
                updatedAt: 14
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
        await createMeeting(repository, {
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

    it("reports the requested meeting for an unsupported schema version", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-repository-"));
        roots.push(root);
        const databasePath = join(root, "meeting.sqlite");
        const db = new DatabaseSync(databasePath);
        db.exec("PRAGMA user_version = 999");
        db.close();

        await expect(
            MeetingRepository.open({
                databasePath,
                teamId: "team-1",
                meetingId: "meeting-1",
                authorizationValidator: allowAuthorization
            })
        ).rejects.toMatchObject<RepositoryError>({
            code: "SCHEMA_VERSION_UNSUPPORTED",
            meetingId: "meeting-1"
        });
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
CREATE TABLE session_ownership (
  session_id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  session_label TEXT NOT NULL,
  role TEXT NOT NULL,
  participant_id TEXT,
  lifecycle_status TEXT NOT NULL,
  capability_status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(meeting_id, session_label)
);
CREATE TABLE outbox (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  delivery_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
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
INSERT INTO meetings VALUES ('meeting-1', 10);
INSERT INTO meeting_bootstrap VALUES ('meeting-1', 'pending', 10, 10, NULL);
INSERT INTO idempotency_receipts VALUES ('create', 'create_meeting', 'captain:1', '{"meetingId":"meeting-1","meetingVersion":0}', 'create-hash', 0, '[1]', 10);
PRAGMA user_version = 2;
`);

        migrate(db);
        expect(db.prepare("PRAGMA user_version").get() as { user_version: number }).toMatchObject({
            user_version: CURRENT_SCHEMA_VERSION
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
        await createMeeting(original, {
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
        await createMeeting(repository, {
            requestId: "create",
            authorization,
            requestHash: "create-hash",
            initialState: { status: "created" }
        });
        await repository.recordSessionOwnership({
            sessionId: "session-1",
            parentSessionId: "captain-session-1",
            sessionLabel: "convivium:meeting-manager:team-1:meeting-1",
            provider: "test-continuable-provider",
            initialMessageId: "initial-message-1",
            role: "manager",
            lifecycleStatus: "active",
            capabilityStatus: "active"
        });
        await repository.close();
        const db = new DatabaseSync(databasePath);
        db.prepare("UPDATE session_ownership SET session_label = ? WHERE session_id = ?").run(
            "convivium:meeting-manager:team-1:meeting-10",
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

    it("rejects attempts to rewrite immutable session ownership identity", async () => {
        const repository = await openRepository();
        await repository.create({
            requestId: "create",
            authorization,
            requestHash: "create-hash",
            initialState: { status: "created" }
        });
        await repository.recordSessionOwnership({
            sessionId: "session-1",
            parentSessionId: "captain-session-1",
            sessionLabel: "convivium:meeting-manager:team-1:meeting-1",
            provider: "test-continuable-provider",
            role: "manager",
            lifecycleStatus: "provisioning",
            capabilityStatus: "active"
        });

        await expect(
            repository.recordSessionOwnership({
                sessionId: "session-1",
                parentSessionId: "captain-session-1",
                sessionLabel: "convivium:meeting-participant:team-1:meeting-1:participant-1",
                provider: "test-continuable-provider",
                initialMessageId: "initial-message-1",
                role: "participant",
                participantId: "participant-1",
                lifecycleStatus: "active",
                capabilityStatus: "active"
            })
        ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_STATE" });
        await repository.close();
    });

    it("keeps an untrusted database in rollback journal mode before identity validation", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-repository-"));
        roots.push(root);
        const databasePath = join(root, "meeting.sqlite");
        const db = new DatabaseSync(databasePath);
        db.exec("CREATE TABLE meetings(team_id TEXT, meeting_id TEXT)");
        db.exec("INSERT INTO meetings VALUES ('other-team', 'other-meeting')");
        db.exec("PRAGMA user_version = 1");
        expect(db.prepare("PRAGMA journal_mode").get()).toMatchObject({ journal_mode: "delete" });
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
        expect(verificationDb.prepare("PRAGMA journal_mode").get()).toMatchObject({
            journal_mode: "delete"
        });
        verificationDb.close();
    });

    it("maps corrupted persisted state to RepositoryError", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-repository-"));
        roots.push(root);
        const databasePath = join(root, "meeting.sqlite");
        const repository = await MeetingRepository.open({
            databasePath,
            teamId: "team-1",
            meetingId: "meeting-1",
            authorizationValidator: allowAuthorization
        });
        await createMeeting(repository, {
            requestId: "create",
            authorization,
            requestHash: "create-hash",
            initialState: { status: "created" }
        });
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
        await expect(reopened.read()).rejects.toMatchObject<RepositoryError>({
            code: "CORRUPT_DATABASE",
            meetingId: "meeting-1",
            retryable: false
        });
        await reopened.close();
    });

    it("defaults legacy meeting state without MeetingTasks at the read boundary", async () => {
        const repository = await openRepository();
        await createMeeting(repository, {
            requestId: "create",
            authorization,
            requestHash: "create-hash",
            initialState: { status: "created", handRaises: [] }
        });

        await expect(repository.read()).resolves.toMatchObject({
            state: {
                status: "created",
                handRaises: [],
                meetingTasks: [],
                decisionCandidates: []
            }
        });
        await repository.close();
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
        await createMeeting(repository, {
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
            createMeeting(repository, {
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
        await createMeeting(repository, {
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

    it("persists an explicitly allowed no-op receipt without changing state", async () => {
        const repository = await openRepository();
        await createMeeting(repository, {
            requestId: "create",
            authorization,
            requestHash: "create-hash",
            initialState: { count: 0 }
        });
        const command = {
            commandKind: "raise_hand",
            authorization,
            requestHash: "duplicate-hand-raise",
            expectedMeetingVersion: 0,
            allowNoop: true,
            transition: (snapshot: { state: Record<string, unknown> }) => ({
                state: snapshot.state,
                result: { handRaiseId: "existing-raise" },
                events: [],
                outbox: []
            })
        };
        const first = await repository.execute({ ...command, requestId: "duplicate-1" });
        expect(first).toMatchObject({
            meetingVersion: 0,
            eventSeqs: []
        });
        await expect(repository.execute({ ...command, requestId: "duplicate-1" })).resolves.toEqual(
            first
        );
        await expect(
            repository.execute({
                ...command,
                requestId: "duplicate-1",
                requestHash: "changed-hand-raise"
            })
        ).rejects.toMatchObject<RepositoryError>({ code: "IDEMPOTENCY_CONFLICT" });
        expect(await repository.read()).toMatchObject({ version: 0, state: { count: 0 } });
        await repository.close();
    });

    it("keeps private mail lifecycle atomic, idempotent, and out of MeetingState", async () => {
        const repository = await openRepository();
        await createMeeting(repository, {
            requestId: "create-mail",
            authorization,
            requestHash: "create-mail-hash",
            initialState: {
                status: "running",
                messageSeq: 2,
                participants: [{ id: "p1" }, { id: "p2" }],
                transcript: [
                    { id: "m1", seq: 1 },
                    { id: "m2", seq: 2 }
                ]
            }
        });
        await repository.recordSessionOwnership(
            {
                sessionId: "participant-session-2",
                parentSessionId: "parent-session",
                sessionLabel: "convivium:meeting-participant:team-1:meeting-1:p2",
                provider: "test",
                role: "participant",
                participantId: "p2",
                lifecycleStatus: "active",
                capabilityStatus: "active",
                initialMessageId: "m1"
            },
            1
        );
        const send = {
            requestId: "mail-request",
            requestHash: "mail-hash",
            authorization,
            expectedMeetingVersion: 0,
            isNewDeliveryAvailable: vi.fn(() => true),
            mail: {
                mailId: "mail-1",
                meetingId: "meeting-1",
                senderParticipantId: "p1",
                recipientParticipantId: "p2",
                content: "private",
                meetingContext: {
                    meetingId: "meeting-1",
                    contextFromSeq: 0,
                    contextThroughSeq: 2,
                    relevantMessageIds: ["m1", "m2"],
                    snapshotSummary: "summary"
                },
                handlingAttemptId: "attempt-1",
                snapshotThroughSeq: 2,
                createdAt: 10
            },
            outbox: {
                deliveryId: "delivery-1",
                kind: "dispatch" as const,
                priority: 0,
                payload: { role: "meeting_mail", mailId: "mail-1", participantId: "p2" }
            }
        };
        const sent = await repository.sendPrivateMeetingMail(send);
        expect(send.isNewDeliveryAvailable).toHaveBeenCalledTimes(1);
        expect(await repository.sendPrivateMeetingMail(send)).toEqual(sent);
        expect(send.isNewDeliveryAvailable).toHaveBeenCalledTimes(1);
        await expect(
            repository.sendPrivateMeetingMail({
                ...send,
                requestId: "mail-request-unavailable",
                requestHash: "mail-hash-unavailable",
                isNewDeliveryAvailable: () => false,
                mail: { ...send.mail, mailId: "mail-unavailable" },
                outbox: {
                    ...send.outbox,
                    deliveryId: "delivery-unavailable",
                    payload: { ...send.outbox.payload, mailId: "mail-unavailable" }
                }
            })
        ).rejects.toMatchObject({ code: "UNSUPPORTED_CAPABILITY" });
        expect((await repository.read()).state).not.toHaveProperty("mailbox");
        expect(await repository.readPrivateMeetingMail("mail-1")).toMatchObject({
            status: "pending",
            snapshotThroughSeq: 2
        });
        const processing = await repository.startPrivateMeetingMail({
            requestId: "start-mail",
            requestHash: "start-mail-hash",
            authorization,
            expectedMeetingVersion: 0,
            mailId: "mail-1",
            processingThroughSeq: 2,
            deliveryId: "delivery-1",
            deadlineAt: 110,
            now: 10
        });
        expect(processing).toMatchObject({
            status: "processing",
            deliveryId: "delivery-1",
            deadlineAt: 110
        });
        await expect(
            repository.startPrivateMeetingMail({
                requestId: "start-mail-2",
                requestHash: "start-mail-2-hash",
                authorization,
                expectedMeetingVersion: 0,
                mailId: "mail-1",
                processingThroughSeq: 1,
                deliveryId: "drifted",
                deadlineAt: 120,
                now: 10
            })
        ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_STATE" });
        const finished = await repository.finishPrivateMeetingMail({
            requestId: "finish-mail",
            requestHash: "finish-mail-hash",
            authorization,
            expectedMeetingVersion: 0,
            mailId: "mail-1",
            handlingAttemptId: "attempt-1",
            deliveryId: "delivery-1",
            status: "processed",
            now: 20
        });
        expect(finished.status).toBe("processed");
        await expect(
            repository.finishPrivateMeetingMail({
                requestId: "late-mail",
                requestHash: "late-mail-hash",
                authorization,
                expectedMeetingVersion: 0,
                mailId: "mail-1",
                handlingAttemptId: "attempt-1",
                deliveryId: "delivery-1",
                status: "failed",
                now: 30
            })
        ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_STATE" });
        await repository.close();
    });
});
