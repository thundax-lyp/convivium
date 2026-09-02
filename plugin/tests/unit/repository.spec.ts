import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteMeetingRepository as MeetingRepository } from "../../src/repository/sqlite-meeting-repository.js";
import { RepositoryError } from "../../src/repository/errors.js";
import type {
    CommandAuthorization,
    RepositoryAuthorizationValidator
} from "../../src/repository/types.js";
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
describe("MeetingRepository SQLite-only behavior", () => {
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

    it("migrates legacy accepted Decision audit fields from its CompletionFact", async () => {
        const repository = await openRepository();
        await createMeeting(repository, {
            requestId: "create",
            authorization,
            requestHash: "create-hash",
            initialState: {
                status: "running",
                decisions: [
                    {
                        id: "decision-1",
                        proposalId: "proposal-1",
                        proposalRevision: 1,
                        status: "accepted"
                    }
                ],
                completionFacts: [
                    {
                        id: "fact-1",
                        kind: "decision_acceptance",
                        subjectId: "decision-1",
                        assertedBy: "captain:session-1",
                        authority: "captain",
                        result: "accepted",
                        status: "active",
                        evidenceMessageIds: [],
                        taskIds: [],
                        createdAt: 123
                    }
                ]
            }
        });

        await expect(repository.read()).resolves.toMatchObject({
            state: {
                decisions: [
                    {
                        id: "decision-1",
                        acceptanceMode: "captain_acceptance",
                        acceptanceFactIds: ["fact-1"],
                        createdAt: 123
                    }
                ]
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
});
