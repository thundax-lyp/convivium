import { describe, expect, it } from "vitest";
import { DomainMeetingRepository } from "@/repository/domain/domain-meeting-repository.js";
import { createFakeCatalogDomain, createFakeMeetingDomain } from "../fixtures/domain-storage.js";
import { decodeMeetingState, encodeMeetingState } from "@/repository/domain/meeting-state-codec.js";
import { makeRunningMeetingStateV1 } from "../fixtures/meeting-state.js";
import type { MeetingState } from "@/domain/meeting-state.js";
import { MAX_COMMIT_VALUE_BYTES } from "@/repository/domain/projection.js";

const authorization = { callerBinding: "runtime", capabilityId: "runtime" };
const allow = { validateCreate: () => undefined, validateCommand: () => undefined };
const codec = { encode: encodeMeetingState, decode: decodeMeetingState };

async function fixture() {
    const meeting = createFakeMeetingDomain();
    const catalog = createFakeCatalogDomain();
    const state = makeRunningMeetingStateV1();
    const repository = await DomainMeetingRepository.open<MeetingState>({
        catalogDomain: catalog,
        meetingDomain: meeting,
        meetingId: state.id,
        authorizationValidator: allow,
        codec,
        now: () => 10
    });
    const create = {
        requestId: "create-target",
        requestHash: "create-target-hash",
        authorization,
        initialState: state,
        createdAt: 1
    };
    await repository.create(create);
    await repository.completeCreate(create);
    return { catalog, meeting, repository, state };
}

function command(
    state: MeetingState,
    expectedMeetingVersion: number,
    requestId: string,
    factIds: readonly string[]
) {
    const nextState = {
        ...state,
        version: expectedMeetingVersion + 1,
        updatedAt: expectedMeetingVersion + 2
    };
    return {
        requestId,
        requestHash: requestId + "-hash",
        commandKind: "open_round",
        authorization,
        expectedMeetingVersion,
        facts: factIds.map((factId) => ({
            factId,
            kind: "open_round",
            actorId: "manager-v1",
            occurredAt: expectedMeetingVersion + 2,
            meetingVersion: expectedMeetingVersion + 1,
            relatedIds: ["agenda-v1"],
            payload: { kind: "references", relatedIds: ["agenda-v1"] },
            resultingState: nextState
        })),
        transition: () => ({
            state: nextState,
            result: { accepted: true },
            events: [],
            outbox: []
        })
    } as const;
}

describe("target repository facts contract", () => {
    it("atomically checkpoints a command whose patch exceeds one commit value", async () => {
        const { catalog, meeting, repository, state } = await fixture();
        const statement = "review-result-".repeat(
            Math.ceil((MAX_COMMIT_VALUE_BYTES * 2) / "review-result-".length)
        );

        const committed = await repository.execute({
            requestId: "large-review-batch",
            requestHash: "large-review-batch-hash",
            commandKind: "submit_review_batch",
            authorization,
            expectedMeetingVersion: 0,
            transition: (snapshot) => ({
                state: {
                    ...snapshot.state,
                    objective: { ...snapshot.state.objective, statement }
                },
                result: { accepted: true },
                events: [{ type: "review.batch.submitted", payload: { count: 2 } }],
                outbox: []
            })
        });

        expect(committed.meetingVersion).toBe(1);
        const reopened = await DomainMeetingRepository.open<MeetingState>({
            catalogDomain: catalog,
            meetingDomain: meeting,
            meetingId: state.id,
            authorizationValidator: allow,
            codec,
            now: () => 11
        });
        expect((await reopened.read()).state.objective.statement).toBe(statement);
        expect(
            await reopened.replayReceipt({
                requestId: "large-review-batch",
                requestHash: "large-review-batch-hash",
                commandKind: "submit_review_batch",
                authorization
            })
        ).toMatchObject({ meetingVersion: 1, result: { accepted: true } });
        await reopened.close();
        await repository.close();
    });

    it("commits a locally guarded review after unrelated Meeting state advances", async () => {
        const { repository, state } = await fixture();
        await repository.execute(command(state, 0, "unrelated-state-change", ["fact-unrelated"]));
        const committed = await repository.execute({
            requestId: "review-immutable-version",
            requestHash: "review-immutable-version-hash",
            commandKind: "submit_review_batch",
            authorization,
            transition: (snapshot) => ({
                state: {
                    ...snapshot.state,
                    version: snapshot.version + 1,
                    updatedAt: snapshot.updatedAt + 1
                },
                result: { accepted: true },
                events: [{ type: "message.added", payload: { review: "immutable-version" } }],
                outbox: []
            })
        });

        expect(committed.meetingVersion).toBe(2);
        await repository.close();
    });

    it("orders facts by meetingVersion and factId", async () => {
        const { repository, state } = await fixture();
        await repository.execute(command(state, 0, "command-1", ["fact-b", "fact-a"]));
        const current = (await repository.read()).state;
        await repository.execute(command(current, 1, "command-2", ["fact-c"]));
        expect((await repository.readCommittedFacts()).map((fact) => fact.factId)).toEqual([
            "fact-a",
            "fact-b",
            "fact-c"
        ]);
        await repository.close();
    });

    it("replays one receipt without duplicating facts and rejects a conflicting hash", async () => {
        const { repository, state } = await fixture();
        const input = command(state, 0, "command-replay", ["fact-replay"]);
        const committed = await repository.execute(input);
        await expect(repository.execute(input)).resolves.toEqual(committed);
        await expect(
            repository.execute({ ...input, requestHash: "different-hash" })
        ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
        expect(await repository.readCommittedFacts()).toHaveLength(1);
        await repository.close();
    });

    it("rolls back state, facts, receipt, outbox and closure together", async () => {
        const { meeting, repository, state } = await fixture();
        await repository.recordSessionOwnership({
            id: "session-1",
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
        const input = {
            ...command(state, 0, "command-close", ["fact-close"]),
            commandKind: "record_archive_session_result",
            archiveSessionResult: { sessionOwnershipId: "session-1", status: "closed" as const }
        };
        meeting.failPutsInTable("commits");
        await expect(repository.execute(input)).rejects.toThrow();
        meeting.allowPutsInTable("commits");
        expect((await repository.read()).version).toBe(0);
        expect(await repository.readCommittedFacts()).toEqual([]);
        expect((await repository.recover()).sessionOwnership[0]).toMatchObject({
            lifecycleStatus: "active",
            capabilityStatus: "active"
        });
        await repository.execute(input);
        expect((await repository.recover()).sessionOwnership[0]).toMatchObject({
            lifecycleStatus: "closed",
            capabilityStatus: "revoked"
        });
        await repository.close();
    });

    it("fails closure without complete target ownership and commits nothing", async () => {
        const { repository, state } = await fixture();
        await repository.recordSessionOwnership({
            sessionId: "session-1",
            parentSessionId: "captain-1",
            sessionLabel: "convivium:meeting-manager:legacy:meeting-v1",
            provider: "spawn",
            role: "manager",
            lifecycleStatus: "active",
            capabilityStatus: "active",
            initialMessageId: "message-1"
        });
        const input = {
            ...command(state, 0, "command-invalid-close", ["fact-invalid-close"]),
            commandKind: "record_archive_session_result",
            archiveSessionResult: { sessionOwnershipId: "session-1", status: "closed" as const }
        };
        await expect(repository.execute(input)).rejects.toMatchObject({
            code: "RECOVERY_UNAVAILABLE"
        });
        expect((await repository.read()).version).toBe(0);
        expect(await repository.readCommittedFacts()).toEqual([]);
        await repository.close();
    });
});
