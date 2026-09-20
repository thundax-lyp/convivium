import { afterEach, describe, expect, it } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import Storage from "@deepseek-ai/dsh-storage";
import * as storageDomain from "@deepseek-ai/dsh-storage-domain";
import * as storageSqlite from "@deepseek-ai/dsh-storage-sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DomainRepositoryRegistry } from "@/repository/domain/domain-repository-registry.js";
import {
    decodeMeetingStateV1,
    encodeMeetingStateV1
} from "@/repository/domain/meeting-state-codec.js";
import { makeRunningMeetingStateV1 } from "../fixtures/meeting-state-v1.js";

const authorization = { callerBinding: "local", capabilityId: "local" };
const allow = { validateCreate: () => undefined, validateCommand: () => undefined };
const codec = { encode: encodeMeetingStateV1, decode: decodeMeetingStateV1 };
const directories: string[] = [];

async function open(path: string, target: boolean) {
    const context = new Context();
    await context.plugin(Storage);
    await context.plugin(storageSqlite, { path, journalMode: "wal" });
    await context.plugin(
        { name: storageDomain.name, inject: storageDomain.inject, apply: storageDomain.apply },
        { backend: "sqlite" }
    );
    const registry = target
        ? await DomainRepositoryRegistry.open({
              storageDomain: context.storageDomain,
              authorizationValidator: allow,
              codec
          })
        : await DomainRepositoryRegistry.open({
              storageDomain: context.storageDomain,
              authorizationValidator: allow
          });
    return {
        registry,
        async close() {
            await registry.close();
            await context.fiber.dispose();
        }
    };
}

async function databasePath(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "convivium-target-recovery-"));
    directories.push(directory);
    return join(directory, "storage.sqlite");
}

afterEach(async () => {
    for (const directory of directories.splice(0))
        await rm(directory, { recursive: true, force: true });
});

describe("target Meeting persistence on SQLite", () => {
    it("reopens target state, facts and atomic Session closure", async () => {
        const path = await databasePath();
        const first = await open(path, true);
        const state = makeRunningMeetingStateV1();
        const create = {
            requestId: "create-target",
            requestHash: "create-target-hash",
            authorization,
            initialState: state,
            createdAt: 1
        };
        const repository = await first.registry.openMeeting({ meetingId: state.id, create });
        await repository.completeCreate(create);
        await repository.recordSessionOwnership({
            id: "ownership-1",
            meetingId: state.id,
            identityId: "manager-v1",
            sessionId: "session-1",
            parentSessionId: "captain-1",
            sessionLabel: "convivium:meeting-manager:legacy:meeting-v1",
            provider: "spawn",
            role: "manager",
            lifecycleStatus: "active",
            capabilityStatus: "active",
            initialMessageId: "message-1"
        });
        const resultingState = { ...state, version: 1, updatedAt: 2 };
        await repository.execute({
            requestId: "close-session",
            requestHash: "close-session-hash",
            commandKind: "record_archive_session_result",
            authorization,
            expectedMeetingVersion: 0,
            facts: [
                {
                    factId: "fact-close",
                    kind: "record_archive_session_result",
                    actorId: "runtime",
                    occurredAt: 2,
                    meetingVersion: 1,
                    relatedIds: ["manager-v1"],
                    payload: { kind: "references", relatedIds: ["manager-v1"] },
                    resultingState
                }
            ],
            archiveSessionResult: { sessionOwnershipId: "ownership-1", status: "closed" },
            transition: () => ({
                state: resultingState,
                result: { accepted: true },
                events: [],
                outbox: []
            })
        });
        await first.close();

        const second = await open(path, true);
        const reopened = await second.registry.openMeeting({ meetingId: state.id });
        await expect(reopened.read()).resolves.toMatchObject({ version: 1, state: resultingState });
        await expect(reopened.readCommittedFacts()).resolves.toHaveLength(1);
        await expect(reopened.recover()).resolves.toMatchObject({
            sessionOwnership: [
                {
                    id: "ownership-1",
                    sessionId: "session-1",
                    identityId: "manager-v1",
                    lifecycleStatus: "closed",
                    capabilityStatus: "revoked"
                }
            ]
        });
        await second.close();
    });

    it("rejects a legacy snapshot without migration", async () => {
        const path = await databasePath();
        const first = await open(path, false);
        const create = {
            requestId: "create-legacy",
            requestHash: "create-legacy-hash",
            authorization,
            initialState: { count: 0 },
            createdAt: 1
        };
        const legacy = await first.registry.openMeeting({ meetingId: "meeting-legacy", create });
        await legacy.completeCreate(create);
        await first.close();

        const second = await open(path, true);
        await expect(
            second.registry.openMeeting({ meetingId: "meeting-legacy" })
        ).rejects.toMatchObject({
            code: "SCHEMA_VERSION_UNSUPPORTED"
        });
        await second.close();
    });
});
