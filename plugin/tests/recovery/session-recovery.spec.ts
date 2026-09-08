import type { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import type { SessionId } from "@deepseek-ai/dsh-session";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { describe, expect, it, vi } from "vitest";
import { DomainMeetingRepository } from "../../src/repository/domain/domain-meeting-repository.js";
import { createFakeCatalogDomain, createFakeMeetingDomain } from "../fixtures/domain-storage.js";
import { questionState, now } from "../unit/domain/transitions/fixtures.js";
import { encodeMeetingSessionLabel } from "../../src/dsh/index.js";
import { reconcileMeetingSessions } from "../../src/runtime/services/meeting-session-recovery.js";
import { endMeeting } from "../../src/domain/transitions/termination.js";
import type { MeetingState } from "../../src/domain/model.js";
import type { DomainEventInput } from "../../src/repository/types.js";
import type { MeetingDiagnostic } from "../../src/repository/diagnostics.js";
import { resolveMeetingCaller } from "../../src/dsh/caller-resolver.js";
import type { AgentDefinitionBindingV1 } from "../../src/role-composition/model.js";
import type { JsonObject } from "../../src/repository/types.js";

async function fixture(ready = true, definition?: AgentDefinitionBindingV1) {
    const state = questionState();
    state.version = 0;
    state.eventSeq = 0;
    const domain = createFakeMeetingDomain();
    const openOptions = {
        teamId: state.teamId,
        meetingId: state.id,
        catalogDomain: createFakeCatalogDomain(),
        meetingDomain: domain,
        authorizationValidator: { validateCreate() {}, validateCommand() {} },
        now: () => now
    };
    const repository = await DomainMeetingRepository.open(openOptions);
    const create = {
        requestId: "create",
        requestHash: "create",
        authorization: { callerBinding: "captain:c", capabilityId: "captain:c" },
        initialState: JSON.parse(JSON.stringify(state)) as JsonObject
    };
    await repository.create(create);
    const entries: Array<
        Extract<
            Awaited<ReturnType<SubagentRuntime["listDescendants"]>>[number],
            { kind: "child"; mode: "continuable" }
        >
    > = [];
    for (const [role, id] of [
        ["manager", undefined],
        ...state.participants.map((item) => ["participant", item.id])
    ] as const) {
        const sessionId = id ?? "manager";
        const label = encodeMeetingSessionLabel({
            teamId: state.teamId,
            meetingId: state.id,
            ...(role === "manager"
                ? { role: "manager" }
                : { role: "participant", participantId: id! })
        });
        await repository.recordSessionOwnership({
            sessionId,
            sessionLabel: label,
            parentSessionId: "captain",
            provider: "spawn",
            ...(definition ? { agentDefinition: definition } : {}),
            role,
            ...(id ? { participantId: id } : {}),
            lifecycleStatus: "active",
            capabilityStatus: "active",
            initialMessageId: `initial-${sessionId}`
        });
        entries.push({
            kind: "child",
            mode: "continuable",
            id: sessionId as SessionId,
            parentId: "captain" as SessionId,
            label,
            activity: "inactive",
            hasChildren: false,
            depth: 1
        });
    }
    if (ready) await repository.completeCreate(create);
    const runtime = {
        listDescendants: vi.fn<SubagentRuntime["listDescendants"]>(async () => [...entries]),
        listChildren: vi.fn<SubagentRuntime["listChildren"]>(async () => [...entries]),
        interrupt: vi.fn<SubagentRuntime["interrupt"]>(),
        drainContinuableChildren: vi.fn<SubagentRuntime["drainContinuableChildren"]>(
            async () => {}
        ),
        startContinuable: vi.fn<SubagentRuntime["startContinuable"]>(async (spec) => {
            if (spec.childId === undefined) throw new Error("Expected reserved child identity");
            entries.push({
                kind: "child",
                mode: "continuable",
                id: spec.childId,
                parentId: "captain" as SessionId,
                activity: "inactive",
                hasChildren: false,
                depth: 1,
                label: spec.label
            });
            return {
                childId: spec.childId,
                messageId: `initial-${spec.childId}` as Awaited<
                    ReturnType<SubagentRuntime["startContinuable"]>
                >["messageId"]
            };
        })
    };
    const input = {
        repository,
        runtime,
        parent: { id: "captain" as SessionId } as Agent,
        signal: new AbortController().signal,
        now
    };
    return { repository, domain, entries, runtime, input, openOptions };
}

describe("meeting Session recovery", () => {
    it("re-admits unfinished planning once after a cold bind and skips paused meetings", async () => {
        for (const paused of [false, true]) {
            const f = await fixture();
            try {
                const before = await f.repository.read();
                await f.repository.execute({
                    requestId: "plan",
                    requestHash: "plan",
                    commandKind: "test-plan",
                    expectedMeetingVersion: before.version,
                    authorization: { callerBinding: "captain", capabilityId: "captain" },
                    transition: (snapshot) => ({
                        state: {
                            ...snapshot.state,
                            status: paused ? "paused" : "running",
                            manager: {
                                ...snapshot.state.manager,
                                currentPlanningAttempt: {
                                    id: "planning",
                                    meetingId: "meeting-1",
                                    observedMeetingVersion: 1,
                                    reason: "initial_plan",
                                    createdAt: now,
                                    catalogBinding: { kind: "none" },
                                    status: "running",
                                    deliveryId: "planning-delivery"
                                }
                            }
                        },
                        result: {},
                        events: [{ type: "turn.planned", payload: { turnId: "planning" } }],
                        outbox: [
                            {
                                id: "planning-outbox",
                                kind: "dispatch",
                                deliveryId: "planning-delivery",
                                payload: { role: "manager", planningAttemptId: "planning" }
                            }
                        ]
                    })
                });
                const [item] = await f.repository.claimOutbox({
                    owner: "before-restart",
                    ttlMs: 100,
                    batchSize: 1,
                    now
                });
                await f.repository.completeOutbox({
                    id: item.id,
                    leaseOwner: item.leaseOwner,
                    leaseToken: item.leaseToken,
                    completion: { status: "delivered" },
                    now
                });
                const snapshot = await f.repository.read();
                await Promise.all([
                    reconcileMeetingSessions(f.input),
                    reconcileMeetingSessions(f.input)
                ]);
                const replay = await f.repository.claimOutbox({
                    owner: "after-restart",
                    ttlMs: 100,
                    batchSize: 10,
                    now
                });
                expect(replay).toHaveLength(paused ? 0 : 1);
                if (!paused) expect(replay[0].deliveryId).toBe("planning-delivery");
                expect(await f.repository.read()).toEqual(snapshot);
                expect(f.runtime.startContinuable).not.toHaveBeenCalled();
            } finally {
                await f.repository.close();
            }
        }
    });
    it("retires interrupted creation with verified cleanup and no public partial Meeting", async () => {
        const f = await fixture(false);
        await reconcileMeetingSessions(f.input);
        const recovered = await f.repository.recover();
        expect(recovered.bootstrap).toMatchObject({
            status: "creation_failed",
            failureCode: "CREATION_INTERRUPTED"
        });
        expect(recovered.snapshot).toBeUndefined();
        expect(
            recovered.sessionOwnership.every(
                (item) => item.capabilityStatus === "revoked" && item.lifecycleStatus === "closed"
            )
        ).toBe(true);
        expect(f.runtime.startContinuable).not.toHaveBeenCalled();
        await f.repository.close();
    });
    it("replaces missing Manager and Participant, preserves facts and serializes concurrent recovery", async () => {
        const f = await fixture();
        const before = await f.repository.read();
        const old = f.entries.splice(0, 2).map((item) => item.id);
        await Promise.all([reconcileMeetingSessions(f.input), reconcileMeetingSessions(f.input)]);
        const recovered = await f.repository.recover();
        expect(recovered.snapshot?.state.status).toBe("paused");
        expect(recovered.snapshot?.state.transcript).toEqual(before.state.transcript);
        expect(recovered.sessionOwnership.filter((item) => old.includes(item.sessionId))).toEqual(
            old.map((sessionId) =>
                expect.objectContaining({
                    sessionId,
                    lifecycleStatus: "closed",
                    capabilityStatus: "revoked",
                    supersededBySessionId: expect.any(String)
                })
            )
        );
        expect(
            recovered.sessionOwnership
                .filter((item) => item.supersededBySessionId === undefined)
                .every((item) => item.lifecycleStatus === "active")
        ).toBe(true);
        expect(f.runtime.startContinuable).toHaveBeenCalledTimes(2);
        await reconcileMeetingSessions(f.input);
        expect(f.runtime.startContinuable).toHaveBeenCalledTimes(2);
        await f.repository.close();
    });
    it("does not touch an unproven or foreign child", async () => {
        const f = await fixture(false);
        f.entries[0]!.label += ":foreign";
        await expect(reconcileMeetingSessions(f.input)).rejects.toThrow(
            "RECOVERY_OWNERSHIP_UNPROVEN"
        );
        expect(f.runtime.interrupt).not.toHaveBeenCalled();
        expect(f.runtime.startContinuable).not.toHaveBeenCalled();
        await f.repository.close();
    });
    it("keeps durable retirement retryable when replacement provisioning fails", async () => {
        const f = await fixture();
        f.entries.shift();
        f.runtime.startContinuable.mockRejectedValueOnce(new Error("provider unavailable"));
        await expect(reconcileMeetingSessions(f.input)).rejects.toThrow("provider unavailable");
        expect((await f.repository.read()).state.status).toBe("paused");
        await reconcileMeetingSessions(f.input);
        expect(
            (await f.repository.recover()).sessionOwnership
                .filter((item) => item.supersededBySessionId === undefined)
                .every((item) => item.lifecycleStatus === "active")
        ).toBe(true);
        await f.repository.close();
    });
    it("retains revoked identities after checkpoint compaction and rejects their callers", async () => {
        const f = await fixture();
        const previous = f.entries.shift()!.id;
        await reconcileMeetingSessions(f.input);
        const active = (await f.repository.recover()).sessionOwnership.find(
            (item) => item.role === "manager" && item.supersededBySessionId === undefined
        )!;
        for (let index = 1; index <= 130; index += 1) {
            await f.repository.recordSessionOwnership(active, now + index);
        }
        await f.repository.close();
        expect(f.domain.table("checkpoint_pointer").get("current")?.baseSeq).toBeGreaterThanOrEqual(
            128
        );
        const reopened = await DomainMeetingRepository.open(f.openOptions);
        try {
            const retired = (await reopened.recover()).sessionOwnership.find(
                (item) => item.sessionId === previous
            )!;
            expect(retired).toMatchObject({
                capabilityStatus: "revoked",
                lifecycleStatus: "closed",
                supersededBySessionId: active.sessionId
            });
            expect(
                await resolveMeetingCaller(
                    { id: previous } as never,
                    {
                        findBySessionId: async () => ({
                            teamId: reopened.teamId,
                            meetingId: reopened.meetingId,
                            ownership: retired
                        })
                    },
                    f.input.signal
                )
            ).toMatchObject({ ok: false, code: "UNAUTHORIZED_CALLER" });
            await reconcileMeetingSessions({ ...f.input, repository: reopened });
            expect(f.runtime.startContinuable).toHaveBeenCalledTimes(1);
        } finally {
            await reopened.close();
        }
    });
    it("pauses without substituting a current Agent Definition when the historical role descriptor is lost", async () => {
        const f = await fixture(true, {
            agentDefinitionId: "manager-definition",
            definitionVersion: "1",
            definitionHash: "a".repeat(64)
        });
        f.entries.shift();
        await expect(reconcileMeetingSessions(f.input)).rejects.toThrow(
            "RECOVERY_ROLE_DESCRIPTOR_MISSING"
        );
        expect((await f.repository.read()).state.status).toBe("paused");
        expect(f.runtime.startContinuable).not.toHaveBeenCalled();
        await f.repository.close();
    });
    it("archives a terminated Meeting with absent children without rebuilding Sessions", async () => {
        const f = await fixture();
        const snapshot = await f.repository.read();
        await f.repository.execute({
            requestId: "end",
            requestHash: "end",
            commandKind: "end",
            authorization: { callerBinding: "captain:c", capabilityId: "captain:c" },
            expectedMeetingVersion: snapshot.version,
            transition(current) {
                const ended = endMeeting(current.state as unknown as MeetingState, {
                    meetingId: f.repository.meetingId,
                    captainBinding: "captain:c",
                    outcome: "cancelled",
                    reason: "cancel",
                    acceptedDecisionIds: [],
                    deferredAgendaItemIds: [],
                    waivers: [],
                    now,
                    factId: (index) => `fact-${index}`
                });
                return {
                    state: ended.state as unknown as JsonObject,
                    events: ended.effect.events as unknown as DomainEventInput[],
                    outbox: [],
                    result: {}
                };
            }
        });
        f.entries.length = 0;
        await reconcileMeetingSessions(f.input);
        expect((await f.repository.read()).state.status).toBe("archived");
        expect(f.runtime.startContinuable).not.toHaveBeenCalled();
        expect(f.runtime.interrupt).not.toHaveBeenCalled();
        await f.repository.close();
    });
    it("reports failed capability retirement without starting cleanup or exposing storage errors", async () => {
        const f = await fixture(false);
        const diagnostics: MeetingDiagnostic[] = [];
        const write = vi
            .spyOn(f.repository, "recordSessionOwnership")
            .mockRejectedValueOnce(new Error("PRIVATE_STORAGE_DETAIL"));
        await expect(
            reconcileMeetingSessions({
                ...f.input,
                onDiagnostic: (record) => diagnostics.push(record)
            })
        ).rejects.toThrow("PRIVATE_STORAGE_DETAIL");
        expect(f.runtime.interrupt).not.toHaveBeenCalled();
        expect(diagnostics).toContainEqual(
            expect.objectContaining({
                eventType: "capability.revoke_failed",
                metrics: { capabilityRevokeFailures: 1 }
            })
        );
        expect(JSON.stringify(diagnostics)).not.toContain("PRIVATE_STORAGE_DETAIL");
        write.mockRestore();
        await reconcileMeetingSessions(f.input);
        await f.repository.close();
    });
    it("revokes capability before cleanup and reports a retryable recovery failure without leaking provider detail", async () => {
        const f = await fixture(false);
        const diagnostics: MeetingDiagnostic[] = [];
        f.runtime.drainContinuableChildren.mockRejectedValueOnce(
            new Error("PRIVATE_PROVIDER_DETAIL")
        );
        await expect(
            reconcileMeetingSessions({
                ...f.input,
                onDiagnostic: (record) => diagnostics.push(record)
            })
        ).rejects.toThrow("PRIVATE_PROVIDER_DETAIL");
        expect((await f.repository.recover()).sessionOwnership[0]?.capabilityStatus).toBe(
            "revoked"
        );
        expect(diagnostics).toContainEqual(
            expect.objectContaining({
                eventType: "session.close_failed",
                metrics: { sessionCloseFailures: 1 }
            })
        );
        expect(diagnostics.at(-1)).toMatchObject({
            eventType: "recovery.failed",
            errorCode: "INTERNAL_ERROR",
            metrics: { recoveryFailures: 1 }
        });
        expect(JSON.stringify(diagnostics)).not.toContain("PRIVATE_PROVIDER_DETAIL");
        await reconcileMeetingSessions(f.input);
        expect((await f.repository.recover()).bootstrap.status).toBe("creation_failed");
        await f.repository.close();
    });
});
