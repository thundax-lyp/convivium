import { peerBindings } from "../fixtures/peer-ownership.js";
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
    for (let i = 0; i < 4; i++) state.identities.push({ ...state.identities[1], id: `extra-${i}` });
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
        ...peerBindings(state.id, state.identities),
        createdAt: 1
    };
    await repository.create(create);
    for (const item of create.initialOwnership)
        await repository.recordSessionOwnership({ ...item, lifecycleStatus: "active" }, 2);
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
            commandKind: "submit_evidence_review",
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
                commandKind: "submit_evidence_review",
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
            commandKind: "submit_evidence_review",
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
        const input = {
            ...command(state, 0, "command-close", ["fact-close"]),
            commandKind: "record_archive_session_result",
            archiveSessionResult: {
                sessionOwnershipId: "ownership-manager-v1",
                status: "closed" as const
            }
        };
        await expect(repository.execute(input)).rejects.toMatchObject({
            code: "RECOVERY_UNAVAILABLE"
        });
        const manager = (await repository.recover()).sessionOwnership.find(
            (o) => o.identityId === "manager-v1"
        )!;
        const { createdAt: _created, updatedAt: _updated, ...binding } = manager;
        await repository.recordSessionOwnership({ ...binding, capabilityStatus: "revoked" }, 3);
        meeting.failPutsInTable("commits");
        await expect(repository.execute(input)).rejects.toThrow();
        meeting.allowPutsInTable("commits");
        expect((await repository.read()).version).toBe(0);
        expect(await repository.readCommittedFacts()).toEqual([]);
        expect(
            (await repository.recover()).sessionOwnership.find((o) => o.identityId === "manager-v1")
        ).toMatchObject({
            lifecycleStatus: "active",
            capabilityStatus: "revoked"
        });
        await repository.execute(input);
        expect(
            (await repository.recover()).sessionOwnership.find((o) => o.identityId === "manager-v1")
        ).toMatchObject({
            lifecycleStatus: "closed",
            capabilityStatus: "revoked"
        });
        await repository.close();
    });

    it("fails closure without complete target ownership and commits nothing", async () => {
        const { repository, state } = await fixture();
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

describe("peer creation and ownership transaction", () => {
    it("requires seven matching bindings, activates before ready and freezes ownership", async () => {
        const state = makeRunningMeetingStateV1();
        for (let i = 0; i < 4; i++)
            state.identities.push({ ...state.identities[1], id: `extra-${i}` });
        const meeting = createFakeMeetingDomain();
        const catalog = createFakeCatalogDomain();
        const repository = await DomainMeetingRepository.open<MeetingState>({
            catalogDomain: catalog,
            meetingDomain: meeting,
            meetingId: state.id,
            authorizationValidator: allow,
            codec,
            now: () => 10
        });
        const input = {
            requestId: "create",
            requestHash: "hash",
            authorization,
            initialState: state,
            ...peerBindings(state.id, state.identities)
        };
        await expect(
            repository.create({ ...input, initialOwnership: input.initialOwnership.slice(1) })
        ).rejects.toMatchObject({ code: "INVALID_INPUT" });
        await expect(
            repository.create({
                ...input,
                initialOwnership: input.initialOwnership.map((o, i) =>
                    i === 0 ? { ...o, role: "participant" as const } : o
                )
            })
        ).rejects.toMatchObject({ code: "INVALID_INPUT" });
        await repository.create(input);
        await expect(repository.completeCreate(input)).rejects.toMatchObject({
            code: "INVALID_STATE"
        });
        await expect(
            repository.create({
                ...input,
                creator: { ...input.creator, sourceSessionId: "different" }
            })
        ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
        for (const item of input.initialOwnership)
            await repository.recordSessionOwnership({ ...item, lifecycleStatus: "active" }, 11);
        await repository.completeCreate(input);
        const active = { ...input.initialOwnership[0], lifecycleStatus: "active" as const };
        await expect(
            repository.recordSessionOwnership(
                { ...active, agentOptions: { provider: "other", model: "model" } },
                12
            )
        ).rejects.toMatchObject({ code: "INVALID_STATE" });
        await expect(
            repository.recordSessionOwnership({ ...active, lifecycleStatus: "closed" }, 12)
        ).rejects.toMatchObject({ code: "INVALID_STATE" });
        await repository.recordSessionOwnership({ ...active, capabilityStatus: "revoked" }, 12);
        await repository.recordSessionOwnership(
            { ...active, capabilityStatus: "revoked", lifecycleStatus: "closed" },
            13
        );
        const reopened = await DomainMeetingRepository.open<MeetingState>({
            catalogDomain: catalog,
            meetingDomain: meeting,
            meetingId: state.id,
            authorizationValidator: allow,
            codec
        });
        expect(
            (await reopened.recover()).sessionOwnership.find((o) => o.identityId === "manager-v1")
        ).toMatchObject({
            lifecycleStatus: "closed",
            capabilityStatus: "revoked",
            createdAt: 10
        });
        expect((await reopened.recover()).preparedDescriptors).toEqual(input.preparedDescriptors);
    });
    it.each(["paused", "intent-failed", "definition-changed", "unchanged"])(
        "rechecks dynamic activation against %s",
        async (change) => {
            const state = makeRunningMeetingStateV1();
            for (let i = 0; i < 4; i++)
                state.identities.push({ ...state.identities[1], id: `extra-${i}` });
            const dynamic = peerBindings(state.id, [{ id: "dynamic", roles: ["contributor"] }]);
            const ownership = { ...dynamic.initialOwnership[0], admissionId: "admission" };
            const intent = {
                id: "admission",
                status: "provisioning",
                identityId: ownership.identityId,
                sessionId: ownership.sessionId,
                definitionId: ownership.definition.agentDefinitionId,
                definitionVersion: ownership.definition.definitionVersion,
                definitionHash: ownership.definition.definitionHash
            };
            // The generic Repository port validates private ownership against the persisted domain facts.
            const initialState = { ...state, identityRecommendations: [intent] };
            const repository = await DomainMeetingRepository.open({
                catalogDomain: createFakeCatalogDomain(),
                meetingDomain: createFakeMeetingDomain(),
                meetingId: state.id,
                authorizationValidator: allow,
                now: () => 10
            });
            try {
                const input = {
                    requestId: "create",
                    requestHash: "hash",
                    authorization,
                    initialState,
                    ...peerBindings(state.id, state.identities)
                };
                await repository.create(input);
                for (const item of input.initialOwnership)
                    await repository.recordSessionOwnership(
                        { ...item, lifecycleStatus: "active" },
                        11
                    );
                await repository.completeCreate(input);
                await repository.recordSessionOwnership(
                    ownership,
                    12,
                    dynamic.preparedDescriptors[0]
                );
                const changed = {
                    ...initialState,
                    lifecycle: {
                        ...state.lifecycle,
                        status: change === "paused" ? "paused" : "running"
                    },
                    identityRecommendations: [
                        {
                            ...intent,
                            status: change === "intent-failed" ? "failed" : "provisioning",
                            definitionHash:
                                change === "definition-changed"
                                    ? "f".repeat(64)
                                    : intent.definitionHash
                        }
                    ]
                };
                await repository.execute({
                    requestId: "change",
                    requestHash: "change",
                    commandKind: "pause",
                    authorization,
                    expectedMeetingVersion: 0,
                    transition: () => ({
                        state: changed,
                        result: {},
                        events: [{ type: "meeting.changed", payload: {} }],
                        outbox: []
                    })
                });
                const activation = repository.recordSessionOwnership(
                    { ...ownership, lifecycleStatus: "active" },
                    13
                );
                if (change === "unchanged")
                    await expect(activation).resolves.toMatchObject({ lifecycleStatus: "active" });
                else {
                    await expect(activation).rejects.toMatchObject({ code: "INVALID_STATE" });
                    expect(
                        (await repository.recover()).sessionOwnership.find(
                            (o) => o.id === ownership.id
                        )?.lifecycleStatus
                    ).toBe("provisioning");
                }
            } finally {
                await repository.close();
            }
        }
    );

    it("revokes every ownership in the same failed creation record", async () => {
        const state = makeRunningMeetingStateV1();
        for (let i = 0; i < 4; i++)
            state.identities.push({ ...state.identities[1], id: `extra-${i}` });
        const repository = await DomainMeetingRepository.open<MeetingState>({
            catalogDomain: createFakeCatalogDomain(),
            meetingDomain: createFakeMeetingDomain(),
            meetingId: state.id,
            authorizationValidator: allow,
            codec,
            now: () => 10
        });
        const input = {
            requestId: "create",
            requestHash: "hash",
            authorization,
            initialState: state,
            ...peerBindings(state.id, state.identities)
        };
        await repository.create(input);
        await repository.updateBootstrap({
            status: "creation_failed",
            failureCode: "CAPABILITY_MISSING",
            now: 11
        });
        const recovered = await repository.recover();
        expect(recovered.bootstrap.status).toBe("creation_failed");
        expect(recovered.sessionOwnership).toHaveLength(7);
        expect(
            recovered.sessionOwnership.every((item) => item.capabilityStatus === "revoked")
        ).toBe(true);
        expect(recovered.pendingOutbox).toBe(0);
    });
});
