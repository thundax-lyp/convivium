import type { MeetingDiagnostic } from "@/repository/diagnostics.js";
import {
    cleanupOwnedSessions,
    finalizeArchive,
    materializeArchivePackage,
    requireExpectedArchiveOwnerships
} from "@/runtime/services/meeting-archive-service.js";
import type { MeetingState } from "@/domain/model.js";
import type { RepositoryCommand } from "@/repository/types.js";
import { describe, expect, it } from "vitest";

const archiving = (): MeetingState => ({
    ...terminalState(),
    status: "archiving",
    archive: { package: materializeArchivePackage(terminalState(), 9) }
});
const terminalState = (): MeetingState => ({
    formatVersion: 2,
    id: "meeting-1",
    teamId: "team-1",
    status: "completed",
    participants: [
        {
            id: "participant-a",
            displayName: "A",
            status: "available",
            consecutiveSpeeches: 0,
            consecutiveAttemptFailures: 0,
            totalSpeeches: 0,
            lastDeliveredSeq: 0,
            lastAcknowledgedSeq: 0
        }
    ],
    manager: { promptVersion: "test", status: "idle" },
    agenda: [],
    topic: "topic",
    objective: "objective",
    objectiveContract: {
        requiredOutputs: [],
        acceptanceCriteria: [],
        hardConstraints: [],
        requiredReviewers: [],
        riskAcceptanceAuthority: [],
        acceptableRiskLevel: "low"
    },
    issues: [],
    agendaCandidates: [],
    transcript: [],
    proposals: [],
    decisions: [],
    openQuestions: [],
    handRaises: [],
    meetingTasks: [],
    completionFacts: [],
    attendanceRecommendations: [],
    artifactRefs: [],
    continuationMaterials: [],
    turnSeq: 0,
    messageSeq: 0,
    eventSeq: 0,
    managerPlanningSeq: 0,
    stallCount: 0,
    replanCount: 0,
    selectionMode: "hybrid",
    limits: {
        maxTurns: 10,
        maxSpeakersPerTurn: 5,
        maxTotalMessages: 100,
        maxConsecutiveSpeechesPerSpeaker: 3,
        maxConsecutiveAttemptFailuresPerParticipant: 3,
        maxDeliveryRetries: 5,
        maxStalls: 3,
        maxReplans: 1
    },
    version: 4,
    createdAt: 1,
    updatedAt: 2,
    termination: {
        code: "objective_satisfied",
        reason: "done",
        decisionIds: [],
        unresolvedQuestionIds: [],
        dissentingPositionIds: [],
        blockingAgendaItemIds: [],
        finalMessage: "done",
        endedAt: 3
    }
});
const ownerships = () => [
    {
        sessionId: "manager-session",
        parentSessionId: "captain-session",
        sessionLabel: "convivium:meeting-manager:team-1:meeting-1",
        provider: "spawn",
        role: "manager" as const,
        lifecycleStatus: "active" as const,
        capabilityStatus: "active" as const,
        createdAt: 1,
        updatedAt: 1
    },
    {
        sessionId: "participant-session",
        parentSessionId: "captain-session",
        sessionLabel: "convivium:meeting-participant:team-1:meeting-1:participant-a",
        provider: "spawn",
        role: "participant" as const,
        participantId: "participant-a",
        lifecycleStatus: "active" as const,
        capabilityStatus: "active" as const,
        createdAt: 1,
        updatedAt: 1
    }
];

describe("archive ownership cleanup", () => {
    it("requires exactly one Manager and every Participant", () => {
        expect(() =>
            requireExpectedArchiveOwnerships(archiving(), ownerships().slice(1), "captain-session")
        ).toThrow(/incomplete/);
        expect(() =>
            requireExpectedArchiveOwnerships(
                archiving(),
                [...ownerships(), { ...ownerships()[1]!, sessionId: "foreign" }],
                "captain-session"
            )
        ).toThrow(/Participant/);
    });

    it("revokes before interrupt and drain, then closes without requiring durable child deletion", async () => {
        let current = ownerships();
        const calls: string[] = [];
        const recover = async () => ({
            snapshot: { state: archiving() as never },
            sessionOwnership: current,
            bootstrap: {} as never,
            reclaimedOutbox: 0,
            pendingOutbox: 0
        });
        await cleanupOwnedSessions({
            repository: {
                recover,
                recordSessionOwnership: async (input) => {
                    calls.push(
                        `${input.lifecycleStatus}:${input.capabilityStatus}:${input.sessionId}`
                    );
                    current = current.map((item) =>
                        item.sessionId === input.sessionId ? { ...item, ...input } : item
                    ) as typeof current;
                    return current.find((item) => item.sessionId === input.sessionId)!;
                }
            },
            parent: { id: "captain-session" } as never,
            runtime: {
                listChildren: async () =>
                    current.map((item) => ({
                        kind: "child",
                        id: item.sessionId,
                        activity: "inactive",
                        hasChildren: false,
                        mode: "continuable",
                        label: item.sessionLabel
                    })) as never,
                interrupt: (sessionId) => calls.push(`interrupt:${sessionId}`),
                drainContinuableChildren: async (_parent, sessionIds) =>
                    calls.push(`drain:${sessionIds.join(",")}`)
            },
            signal: new AbortController().signal,
            now: 10
        });
        expect(calls).toEqual([
            "active:revoked:manager-session",
            "active:revoked:participant-session",
            "interrupt:manager-session",
            "interrupt:participant-session",
            "drain:manager-session,participant-session",
            "closed:revoked:manager-session",
            "closed:revoked:participant-session"
        ]);
        expect(
            current.every(
                (item) => item.lifecycleStatus === "closed" && item.capabilityStatus === "revoked"
            )
        ).toBe(true);
    });

    it.each(["revoked", "closed"] as const)(
        "reports failed %s persistence and allows cleanup retry",
        async (failedStatus) => {
            let current = ownerships();
            let fail = true;
            const diagnostics: MeetingDiagnostic[] = [];
            const cleanup: Parameters<typeof cleanupOwnedSessions>[0] = {
                repository: {
                    recover: async () => ({
                        snapshot: { state: archiving() as never } as never,
                        sessionOwnership: current,
                        bootstrap: {} as never,
                        reclaimedOutbox: 0,
                        pendingOutbox: 0
                    }),
                    recordSessionOwnership: async (input) => {
                        if (
                            fail &&
                            (failedStatus === "revoked"
                                ? input.lifecycleStatus === "active"
                                : input.lifecycleStatus === "closed")
                        )
                            throw new Error("PRIVATE_STORAGE_DETAIL");
                        current = current.map((item) =>
                            item.sessionId === input.sessionId ? { ...item, ...input } : item
                        ) as typeof current;
                        return current.find((item) => item.sessionId === input.sessionId)!;
                    }
                },
                parent: { id: "captain-session" } as never,
                runtime: {
                    listChildren: async () =>
                        current.map((item) => ({
                            kind: "child",
                            id: item.sessionId,
                            activity: "inactive",
                            hasChildren: false,
                            mode: "continuable",
                            label: item.sessionLabel
                        })) as never,
                    interrupt() {},
                    drainContinuableChildren: async () => {}
                },
                signal: new AbortController().signal,
                now: 10,
                onDiagnostic: (record) => diagnostics.push(record)
            };
            await expect(cleanupOwnedSessions(cleanup)).rejects.toThrow("PRIVATE_STORAGE_DETAIL");
            expect(diagnostics).toContainEqual(
                expect.objectContaining({
                    eventType:
                        failedStatus === "revoked"
                            ? "capability.revoke_failed"
                            : "session.close_failed",
                    errorCode: "INTERNAL_ERROR"
                })
            );
            expect(JSON.stringify(diagnostics)).not.toContain("PRIVATE_STORAGE_DETAIL");
            fail = false;
            await cleanupOwnedSessions(cleanup);
            expect(
                current.every(
                    (item) =>
                        item.lifecycleStatus === "closed" && item.capabilityStatus === "revoked"
                )
            ).toBe(true);
        }
    );
});

describe("archive ownership finalization", () => {
    it("keeps revoked ownership open for a retry when drain fails", async () => {
        const meetingState = archiving();
        const metadata = {
            status: "draft" as const,
            coverage: { fromSeq: 1, throughSeq: 1 },
            referencedMessageIds: ["source-1"]
        };
        const source = {
            id: "source-1",
            seq: 1,
            turnSeq: 1,
            turnId: "turn-1",
            stepId: "step-1",
            attemptId: "attempt-1",
            speaker: "participant-a",
            agendaItemId: "agenda-1",
            agendaRelation: "on_topic" as const,
            kind: "statement" as const,
            content: "source",
            mentions: [],
            taskIds: [],
            createdAt: 1
        };
        meetingState.transcript = [
            source,
            {
                ...source,
                id: "draft-2",
                seq: 2,
                kind: "summary",
                content: "minutes",
                minutesDraft: metadata
            }
        ];
        meetingState.archive!.package.formalTranscript = structuredClone(meetingState.transcript);
        const originalArchive = structuredClone(meetingState.archive!.package);
        let current = ownerships();
        const writes: string[] = [];
        let drains = 0;
        const cleanup: Parameters<typeof cleanupOwnedSessions>[0] = {
            repository: {
                recover: async () => ({
                    snapshot: { state: meetingState as never },
                    sessionOwnership: current,
                    bootstrap: {} as never,
                    reclaimedOutbox: 0,
                    pendingOutbox: 0
                }),
                recordSessionOwnership: async (input) => {
                    writes.push(
                        `${input.lifecycleStatus}:${input.capabilityStatus}:${input.sessionId}`
                    );
                    current = current.map((item) =>
                        item.sessionId === input.sessionId ? { ...item, ...input } : item
                    ) as typeof current;
                    return current.find((item) => item.sessionId === input.sessionId)!;
                }
            },
            parent: { id: "captain-session" } as never,
            runtime: {
                listChildren: async () =>
                    current.map((item) => ({
                        kind: "child",
                        id: item.sessionId,
                        activity: "inactive",
                        hasChildren: false,
                        mode: "continuable",
                        label: item.sessionLabel
                    })) as never,
                interrupt: () => undefined,
                drainContinuableChildren: async () => {
                    drains += 1;
                    if (drains === 1) throw new Error("DSH_DRAIN_TIMEOUT");
                }
            },
            signal: new AbortController().signal,
            now: 10
        };
        await expect(cleanupOwnedSessions(cleanup)).rejects.toThrow("DSH_DRAIN_TIMEOUT");
        expect(
            current.every(
                (item) => item.lifecycleStatus === "active" && item.capabilityStatus === "revoked"
            )
        ).toBe(true);
        await cleanupOwnedSessions({ ...cleanup, now: 20 });
        expect(drains).toBe(2);
        expect(writes).toEqual([
            "active:revoked:manager-session",
            "active:revoked:participant-session",
            "closed:revoked:manager-session",
            "closed:revoked:participant-session"
        ]);
        expect(current.every((item) => item.lifecycleStatus === "closed")).toBe(true);
        await cleanupOwnedSessions({ ...cleanup, now: 30 });
        expect(drains).toBe(2);
        expect(writes).toHaveLength(4);
        expect(meetingState.archive!.package).toEqual(originalArchive);
        expect(meetingState.archive!.package.formalTranscript[1]!.minutesDraft).toEqual(metadata);
    });

    it("writes archived only after every owned Session is revoked and closed", async () => {
        const closed = ownerships().map((ownership) => ({
            ...ownership,
            capabilityStatus: "revoked" as const,
            lifecycleStatus: "closed" as const
        }));
        let command: RepositoryCommand<{ status: "archived" }> | undefined;
        await finalizeArchive({
            repository: {
                recover: async () => ({
                    snapshot: { state: archiving() as never },
                    sessionOwnership: closed,
                    bootstrap: {} as never,
                    reclaimedOutbox: 0,
                    pendingOutbox: 0
                }),
                execute: async (received) => {
                    command = received;
                    const transition = received.transition({
                        teamId: "team-1",
                        meetingId: "meeting-1",
                        version: 4,
                        state: archiving() as never,
                        createdAt: 1,
                        updatedAt: 2
                    });
                    expect(transition.state).toMatchObject({
                        status: "archived",
                        archive: { archivedAt: 11 }
                    });
                    expect(transition.events.map((event) => event.type)).toEqual([
                        "meeting.archived",
                        "archive.sessions_closed"
                    ]);
                    return {
                        requestId: received.requestId,
                        meetingId: "meeting-1",
                        meetingVersion: 5,
                        result: received.transition as never,
                        eventSeqs: [1, 2]
                    };
                }
            },
            now: 11
        });
        expect(command).toMatchObject({
            commandKind: "internal_archive_finalize",
            expectedMeetingVersion: 4
        });
    });

    it.each([
        { lifecycleStatus: "active", capabilityStatus: "revoked" },
        { lifecycleStatus: "closed", capabilityStatus: "active" }
    ] as const)(
        "does not finalize with one $lifecycleStatus/$capabilityStatus Session",
        async (unfinished) => {
            const current = ownerships().map((ownership, index) => ({
                ...ownership,
                ...(index === 1
                    ? unfinished
                    : { lifecycleStatus: "closed" as const, capabilityStatus: "revoked" as const })
            }));
            await expect(
                finalizeArchive({
                    repository: {
                        recover: async () => ({
                            snapshot: { state: archiving() as never },
                            sessionOwnership: current,
                            bootstrap: {} as never,
                            reclaimedOutbox: 0,
                            pendingOutbox: 0
                        }),
                        execute: async () => {
                            throw new Error("must not execute");
                        }
                    },
                    now: 11
                })
            ).rejects.toThrow(/revoked and closed/);
        }
    );
});
