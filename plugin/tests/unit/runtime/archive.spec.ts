import {
    beginArchiveFromTermination,
    cleanupOwnedSessions,
    finalizeArchive,
    materializeArchivePackage,
    recoverArchive,
    requireExpectedArchiveOwnerships,
    terminationIdentity
} from "../../../src/runtime/services/meeting-archive-service.js";
import type { MeetingState } from "../../../src/domain/model.js";
import type { RepositoryCommand } from "../../../src/repository/types.js";
import { describe, expect, it } from "vitest";

const state = {
    formatVersion: 2,
    id: "meeting-1",
    teamId: "team-1",
    objectiveContract: {},
    artifactRefs: [],
    decisions: [
        { id: "decision-1", proposalId: "proposal-1", proposalRevision: 1, status: "accepted" }
    ],
    proposals: [],
    completionFacts: [],
    attendanceRecommendations: [],
    agenda: [],
    issues: [
        {
            id: "issue-1",
            title: "scope",
            description: "outside",
            disposition: "out_of_scope",
            status: "out_of_scope",
            relatedTaskIds: []
        }
    ],
    openQuestions: [
        {
            id: "question-1",
            text: "who?",
            affectedOutputIds: ["output-1"],
            affectedCriterionIds: ["criterion-1"],
            violatedConstraintIds: ["constraint-1"],
            status: "open"
        }
    ],
    agendaCandidates: [{ id: "candidate-1", title: "later", reason: "parking", status: "parked" }],
    transcript: [],
    participants: [{ id: "participant-1", displayName: "P", role: "reviewer" }],
    termination: { code: "objective_satisfied", finalMessage: "done", endedAt: 10 }
} as unknown as MeetingState;

describe("materializeArchivePackage", () => {
    it("copies existing optional facts without fabricating missing fields", () => {
        const archive = materializeArchivePackage(state, 20);
        expect(archive.acceptedDecisions).toEqual([
            { id: "decision-1", proposalId: "proposal-1", proposalRevision: 1, status: "accepted" }
        ]);
        expect(archive.decisionHistory).toEqual(archive.acceptedDecisions);
        expect(archive.issues).toEqual([
            {
                id: "issue-1",
                title: "scope",
                description: "outside",
                disposition: "out_of_scope",
                status: "out_of_scope",
                relatedTaskIds: []
            }
        ]);
        expect(archive.unresolvedQuestions).toEqual([
            {
                id: "question-1",
                text: "who?",
                affectedOutputIds: ["output-1"],
                affectedCriterionIds: ["criterion-1"],
                violatedConstraintIds: ["constraint-1"],
                status: "open"
            }
        ]);
        expect(archive.parkingLot).toEqual([
            { id: "candidate-1", title: "later", reason: "parking", status: "parked" }
        ]);
    });

    it("deep-copies committed facts", () => {
        const source = structuredClone(state);
        const archive = materializeArchivePackage(source, 20);
        source.agendaCandidates[0].title = "mutated";
        source.issues[0].title = "mutated";

        expect(archive.parkingLot[0]?.title).toBe("later");
        expect(archive.issues[0]?.title).toBe("scope");
    });

    it("persists every Decision in history while keeping acceptedDecisions current-only", () => {
        const source = structuredClone(state);
        source.decisions = [
            {
                id: "decision-1",
                proposalId: "proposal-1",
                proposalRevision: 1,
                status: "superseded"
            },
            {
                id: "decision-2",
                proposalId: "proposal-1",
                proposalRevision: 2,
                status: "accepted"
            }
        ];

        const archive = materializeArchivePackage(source, 20);

        expect(archive.acceptedDecisions.map(({ id }) => id)).toEqual(["decision-2"]);
        expect(archive.decisionHistory.map(({ id }) => id)).toEqual(["decision-1", "decision-2"]);
    });

    it("preserves continuation source provenance without copying source runtime facts", () => {
        const source = structuredClone(state);
        source.sourceMeetingId = "source-meeting";
        source.continuationMaterials = [
            {
                sourceMeetingId: "source-meeting",
                sourceKind: "artifact",
                sourceObjectId: "artifact-1",
                summary: "Selected artifact",
                checksum: "sha256:artifact-1"
            }
        ];
        const archive = materializeArchivePackage(source, 20);

        expect(archive.sourceMeetingId).toBe("source-meeting");
        expect(archive).not.toHaveProperty("continuationMaterials");
        expect(archive).not.toHaveProperty("sourceSessionId");
    });

    it("preserves proposal revisions and their positions as formal archive facts", () => {
        const source = structuredClone(state);
        source.proposals = [
            {
                id: "proposal-1",
                title: "Storage v1",
                description: "Use files.",
                proposedBy: "participant-1",
                revision: 1,
                status: "superseded",
                agendaItemId: "agenda-1",
                positions: [
                    {
                        id: "position-old",
                        participantId: "participant-1",
                        position: "object",
                        blocking: true,
                        proposalRevision: 1
                    }
                ],
                createdAt: 1,
                updatedAt: 1
            },
            {
                id: "proposal-1",
                title: "Storage",
                description: "Use SQLite.",
                proposedBy: "participant-1",
                revision: 2,
                status: "under_review",
                agendaItemId: "agenda-1",
                positions: [
                    {
                        id: "position-1",
                        participantId: "participant-1",
                        position: "accept",
                        blocking: false,
                        proposalRevision: 2
                    }
                ],
                createdAt: 1,
                updatedAt: 2
            }
        ];
        const archive = materializeArchivePackage(source, 20);

        expect(archive.proposals).toEqual(source.proposals);
        source.proposals[1]!.positions[0]!.position = "object";
        expect(archive.proposals[1]?.positions[0]?.position).toBe("accept");
    });

    it("includes agenda candidate facts in the archive parking lot projection", () => {
        const source = structuredClone(state);
        source.agendaCandidates = [
            {
                id: "candidate-2",
                proposedBy: "participant-1",
                sourceMessageId: "message-1",
                title: "Follow-up",
                reason: "Separate discussion",
                relationToActiveAgenda: "adjacent",
                urgency: "later",
                suggestedParticipants: ["participant-1"],
                status: "pending",
                createdAt: 1
            }
        ];
        expect(materializeArchivePackage(source, 20).parkingLot).toEqual([
            {
                id: "candidate-2",
                title: "Follow-up",
                reason: "Separate discussion",
                status: "pending"
            }
        ]);
    });
});

describe("beginArchiveFromTermination", () => {
    const terminal = (): MeetingState => ({
        formatVersion: 2,
        id: "meeting-1",
        teamId: "team-1",
        status: "completed",
        participants: [],
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
        decisionCandidates: [],
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

    it("uses one stable internal receipt and materializes the committed terminal snapshot", async () => {
        const committed = terminal();
        let command: RepositoryCommand<{ status: "archiving" }> | undefined;
        await beginArchiveFromTermination({
            repository: {
                execute: async (received) => {
                    command = received;
                    const transition = received.transition({
                        teamId: committed.teamId,
                        meetingId: committed.id,
                        version: committed.version,
                        state: committed as never,
                        createdAt: committed.createdAt,
                        updatedAt: committed.updatedAt
                    });
                    expect(transition.state).toMatchObject({
                        status: "archiving",
                        archive: { package: { materializedAt: 9, finalSummary: "done" } }
                    });
                    expect(transition.events.map((event) => event.type)).toEqual([
                        "meeting.archiving"
                    ]);
                    return {
                        requestId: received.requestId,
                        meetingId: committed.id,
                        meetingVersion: 5,
                        result: transition.result,
                        eventSeqs: [1]
                    };
                }
            },
            terminal: committed,
            now: 9
        });

        const identity = terminationIdentity(committed);
        expect(command).toMatchObject({
            requestId: `internal:archive:${identity}`,
            commandKind: "internal_archive_begin",
            authorization: {
                callerBinding: `internal:termination:${identity}`,
                capabilityId: `internal:termination:${identity}`
            },
            expectedMeetingVersion: 4
        });
    });

    it("rejects a non-terminal input and a snapshot with a different termination", async () => {
        await expect(
            beginArchiveFromTermination({
                repository: { execute: async () => ({}) as never },
                terminal: { ...terminal(), status: "running" },
                now: 9
            })
        ).rejects.toThrow(/execution-terminal/);

        const committed = terminal();
        await expect(
            beginArchiveFromTermination({
                repository: {
                    execute: async (received) => {
                        received.transition({
                            teamId: committed.teamId,
                            meetingId: committed.id,
                            version: committed.version,
                            state: {
                                ...committed,
                                termination: { ...committed.termination!, endedAt: 4 }
                            } as never,
                            createdAt: committed.createdAt,
                            updatedAt: committed.updatedAt
                        });
                        return {} as never;
                    }
                },
                terminal: committed,
                now: 9
            })
        ).rejects.toThrow(/does not match/);
    });
});

describe("archive ownership cleanup", () => {
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

    it("keeps revoked ownership open for a retry when drain fails", async () => {
        let current = ownerships();
        await expect(
            cleanupOwnedSessions({
                repository: {
                    recover: async () => ({
                        snapshot: { state: archiving() as never },
                        sessionOwnership: current,
                        bootstrap: {} as never,
                        reclaimedOutbox: 0,
                        pendingOutbox: 0
                    }),
                    recordSessionOwnership: async (input) => {
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
                        throw new Error("DSH_DRAIN_TIMEOUT");
                    }
                },
                signal: new AbortController().signal,
                now: 10
            })
        ).rejects.toThrow("DSH_DRAIN_TIMEOUT");
        expect(
            current.every(
                (item) => item.lifecycleStatus === "active" && item.capabilityStatus === "revoked"
            )
        ).toBe(true);
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

    it("does not finalize while an owned Session remains open", async () => {
        await expect(
            finalizeArchive({
                repository: {
                    recover: async () => ({
                        snapshot: { state: archiving() as never },
                        sessionOwnership: ownerships(),
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
    });
});

describe("recoverArchive", () => {
    it("replays terminal materialization through the termination-derived receipt", async () => {
        const terminal = {
            id: "meeting-1",
            teamId: "team-1",
            status: "completed",
            version: 4,
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
        } as MeetingState;
        let command: RepositoryCommand<{ status: "archiving" }> | undefined;
        await expect(
            recoverArchive({
                repository: {
                    recover: async () => ({
                        snapshot: { state: terminal as never },
                        sessionOwnership: [],
                        bootstrap: {} as never,
                        reclaimedOutbox: 0,
                        pendingOutbox: 0
                    }),
                    execute: async (received) => {
                        command = received;
                        return {
                            requestId: received.requestId,
                            meetingId: terminal.id,
                            meetingVersion: 5,
                            result: { status: "archiving" },
                            eventSeqs: [1]
                        };
                    },
                    recordSessionOwnership: async () => {
                        throw new Error("must not write ownership");
                    }
                },
                signal: new AbortController().signal,
                now: 12
            })
        ).resolves.toBe("begun");
        expect(command).toMatchObject({
            requestId: `internal:archive:${terminationIdentity(terminal)}`,
            commandKind: "internal_archive_begin",
            expectedMeetingVersion: 4
        });
    });

    it("keeps an archiving meeting pending when the Captain runtime is unavailable", async () => {
        await expect(
            recoverArchive({
                repository: {
                    recover: async () => ({
                        snapshot: { state: { status: "archiving" } as never },
                        sessionOwnership: [],
                        bootstrap: {} as never,
                        reclaimedOutbox: 0,
                        pendingOutbox: 0
                    }),
                    execute: async () => {
                        throw new Error("must not execute");
                    },
                    recordSessionOwnership: async () => {
                        throw new Error("must not write ownership");
                    }
                },
                signal: new AbortController().signal,
                now: 12
            })
        ).resolves.toBe("pending");
    });
});
