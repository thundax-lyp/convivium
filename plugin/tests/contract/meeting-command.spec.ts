import { describe, expect, it, vi } from "vitest";
import { makeRunningMeetingStateV1 } from "../fixtures/meeting-state.js";
import type { MeetingState } from "@/domain/index.js";
import {
    MeetingCommandResultV1Schema,
    MeetingCommandV1Schema
} from "@/protocol/meeting-command.js";
import {
    decodeMeetingStateV1,
    encodeMeetingStateV1
} from "@/repository/domain/meeting-state-codec.js";
import type { DomainRepositoryRegistry } from "@/repository/domain/domain-repository-registry.js";
import { meetingIdFor } from "@/repository/domain/keys.js";
import { createMeetingCommandApplicationV1 } from "@/runtime/application-service/meeting-command.js";
import { RepositoryError } from "@/repository/errors.js";
import type { MeetingRepositoryPort } from "@/repository/meeting-repository-port.js";
import type { RepositoryCommand } from "@/repository/types.js";

describe("target Meeting command core", () => {
    it("round-trips a complete target state without loss", () => {
        const state = makeRunningMeetingStateV1();
        expect(decodeMeetingStateV1(encodeMeetingStateV1(state))).toEqual(state);
    });

    it("rejects a state with a missing required field", () => {
        const state = makeRunningMeetingStateV1();
        const missing = { ...state } as Record<string, unknown>;
        delete missing.identities;
        expect(() => decodeMeetingStateV1(encodeMeetingStateV1(missing))).toThrow(
            "INCOMPATIBLE_VERSION"
        );
    });

    it("rejects unknown command kinds and invalid envelopes", () => {
        expect(MeetingCommandV1Schema.safeParse({ kind: "unknown" }).success).toBe(false);
    });

    it("requires the create envelope to use meetingId new and version zero", () => {
        const action = {
            kind: "create_meeting",
            objective: {
                statement: "形成结论",
                requiredOutputs: [],
                acceptanceCriteria: [],
                hardConstraints: [],
                acceptableRiskLevel: "low"
            },
            identities: [],
            managerIdentityKey: "manager",
            evidenceReviewerIdentityKey: "reviewer",
            initialAgenda: [],
            initialActiveAgendaId: "agenda-v1",
            limits: {
                maxFormalMessages: 1,
                maxDurationMs: 1,
                taskDeadlineMs: 1,
                reviewDeadlineMs: 1
            }
        };
        expect(
            MeetingCommandV1Schema.safeParse({
                protocolVersion: 1,
                meetingId: "existing",
                expectedMeetingVersion: 99,
                requestId: "create-request-1",
                action
            }).success
        ).toBe(false);
        expect(
            MeetingCommandV1Schema.safeParse({
                protocolVersion: 1,
                meetingId: "new",
                expectedMeetingVersion: 0,
                requestId: "create-request-1",
                action
            }).success
        ).toBe(true);
    });

    it("scopes reviewer concurrency to immutable evidence versions, not the Meeting version", () => {
        const review = {
            protocolVersion: 1,
            meetingId: "meeting-v1",
            requestId: "review-1",
            action: {
                kind: "submit_review_batch",
                roundId: "round-v1",
                claimId: "review-claim-v1",
                reviews: [
                    {
                        versionId: "evidence-version-v1",
                        scope: "核验来源与论证",
                        dimensions: {
                            source: {
                                score: 2,
                                scope: "来源",
                                reason: "可追溯",
                                baselineEvidenceIds: []
                            },
                            credibility: {
                                score: 2,
                                scope: "可信度",
                                reason: "方法明确",
                                baselineEvidenceIds: []
                            },
                            completeness: {
                                score: 2,
                                scope: "完整性",
                                reason: "覆盖范围",
                                baselineEvidenceIds: []
                            },
                            support: {
                                score: 2,
                                scope: "支持度",
                                reason: "直接支持",
                                baselineEvidenceIds: []
                            }
                        }
                    }
                ]
            }
        };
        expect(MeetingCommandV1Schema.safeParse(review).success).toBe(true);
        expect(
            MeetingCommandV1Schema.safeParse({
                ...review,
                action: { kind: "open_round", agendaId: "agenda-v1", planId: "plan-v1" }
            }).success
        ).toBe(false);
    });

    it("enforces review delivery result invariants", () => {
        const envelope = {
            protocolVersion: 1,
            meetingId: "meeting-v1",
            expectedMeetingVersion: 1,
            requestId: "delivery-1"
        };
        expect(
            MeetingCommandV1Schema.safeParse({
                ...envelope,
                action: { kind: "record_review_delivery", reviewId: "review-1", status: "sent" }
            }).success
        ).toBe(true);
        expect(
            MeetingCommandV1Schema.safeParse({
                ...envelope,
                action: {
                    kind: "record_review_delivery",
                    reviewId: "review-1",
                    status: "failed"
                }
            }).success
        ).toBe(false);
        expect(
            MeetingCommandV1Schema.safeParse({
                ...envelope,
                action: {
                    kind: "record_review_delivery",
                    reviewId: "review-1",
                    status: "sent",
                    failureReason: "unexpected"
                }
            }).success
        ).toBe(false);
    });

    it("derives the create identity and delegates exactly once without opening a repository", async () => {
        const create = vi.fn(async (_command, _context, meetingId: string) => ({
            kind: "accepted" as const,
            meetingId,
            committedVersion: 1,
            receiptId: "receipt-1",
            factIds: ["fact-1"],
            effects: []
        }));
        const openMeeting = vi.fn();
        const now = vi.fn(() => 11);
        const app = createMeetingCommandApplicationV1({
            creation: { create },
            registry: { openMeeting } as unknown as DomainRepositoryRegistry<MeetingState>,
            ids: { nextId: (kind) => `${kind}-1` },
            clock: { now },
            resolveCallerScope: vi.fn()
        });
        const signal = new AbortController().signal;
        const command = {
            protocolVersion: 1 as const,
            meetingId: "new",
            expectedMeetingVersion: 0,
            requestId: "create-request-1",
            action: {
                kind: "create_meeting" as const,
                objective: {
                    statement: "形成结论",
                    requiredOutputs: [],
                    acceptanceCriteria: [],
                    hardConstraints: [],
                    acceptableRiskLevel: "low" as const
                },
                identities: [],
                managerIdentityKey: "manager",
                evidenceReviewerIdentityKey: "reviewer",
                initialAgenda: [],
                initialActiveAgendaId: "agenda-v1",
                limits: {
                    maxFormalMessages: 1,
                    maxDurationMs: 1,
                    taskDeadlineMs: 1,
                    reviewDeadlineMs: 1
                }
            }
        };
        const context = {
            caller: {
                channel: "dsh_tool" as const,
                principalId: "captain-1"
            },
            captainParent: { id: "captain-1" } as never
        };

        const result = await app.execute(command, context, signal);

        expect(result).toMatchObject({
            kind: "accepted",
            meetingId: meetingIdFor(command.requestId)
        });
        expect(create).toHaveBeenCalledOnce();
        expect(create).toHaveBeenCalledWith(
            command,
            context,
            meetingIdFor(command.requestId),
            11,
            signal
        );
        expect(now).toHaveBeenCalledOnce();
        expect(openMeeting).not.toHaveBeenCalled();
    });

    it("maps a conflicting create replay to the protocol rejection", async () => {
        const app = createMeetingCommandApplicationV1({
            creation: {
                create: vi.fn(async () => {
                    throw new RepositoryError(
                        "IDEMPOTENCY_CONFLICT",
                        false,
                        "meeting-v1",
                        "Request hash conflicts with bootstrap"
                    );
                })
            },
            registry: { openMeeting: vi.fn() } as unknown as DomainRepositoryRegistry<MeetingState>,
            ids: { nextId: (kind) => `${kind}-1` },
            clock: { now: () => 11 },
            resolveCallerScope: vi.fn()
        });
        const command = MeetingCommandV1Schema.parse({
            protocolVersion: 1,
            meetingId: "new",
            expectedMeetingVersion: 0,
            requestId: "create-request-1",
            action: {
                kind: "create_meeting",
                objective: {
                    statement: "形成结论",
                    requiredOutputs: [],
                    acceptanceCriteria: [],
                    hardConstraints: [],
                    acceptableRiskLevel: "low"
                },
                identities: [],
                managerIdentityKey: "manager",
                evidenceReviewerIdentityKey: "reviewer",
                initialAgenda: [],
                initialActiveAgendaId: "agenda-v1",
                limits: {
                    maxFormalMessages: 1,
                    maxDurationMs: 1,
                    taskDeadlineMs: 1,
                    reviewDeadlineMs: 1
                }
            }
        });

        await expect(
            app.execute(
                command,
                {
                    caller: { channel: "dsh_tool", principalId: "captain-1" },
                    captainParent: { id: "captain-1" } as never
                },
                new AbortController().signal
            )
        ).resolves.toMatchObject({
            kind: "rejected",
            error: { code: "IDEMPOTENCY_CONFLICT" }
        });
    });

    it("preserves a rejected domain transition instead of reporting storage failure", async () => {
        const state = makeRunningMeetingStateV1();
        const repository = {
            execute: async (command: RepositoryCommand<unknown, MeetingState>) => {
                const transition = command.transition({
                    meetingId: state.id,
                    version: state.version,
                    state,
                    createdAt: state.createdAt,
                    updatedAt: state.updatedAt
                });
                return {
                    requestId: command.requestId,
                    meetingId: state.id,
                    meetingVersion: state.version + 1,
                    result: transition.result,
                    eventSeqs: []
                };
            }
        } as unknown as MeetingRepositoryPort<MeetingState>;
        const caller = {
            channel: "dsh_tool" as const,
            principalId: "manager-session",
            sessionBindingId: "ownership-v1"
        };
        const app = createMeetingCommandApplicationV1({
            creation: { create: vi.fn() },
            registry: {
                openMeeting: vi.fn(async () => repository)
            } as unknown as DomainRepositoryRegistry<MeetingState>,
            ids: { nextId: (kind) => `${kind}-1` },
            clock: { now: () => 10 },
            resolveCallerScope: async () => ({
                caller,
                meetingId: state.id,
                identityId: "manager-v1",
                role: "manager" as const,
                ownership: {
                    id: "ownership-v1",
                    meetingId: state.id,
                    identityId: "manager-v1",
                    parentSessionId: "captain-session",
                    sessionId: "manager-session",
                    lifecycleStatus: "active",
                    capabilityStatus: "active"
                }
            })
        });

        await expect(
            app.execute(
                {
                    protocolVersion: 1,
                    meetingId: state.id,
                    expectedMeetingVersion: state.version,
                    requestId: "open-without-plan",
                    action: { kind: "open_round", agendaId: "agenda-v1", planId: "missing-plan" }
                },
                { caller },
                new AbortController().signal
            )
        ).resolves.toMatchObject({
            kind: "rejected",
            error: { code: "PRECONDITION_FAILED", message: "active open-round plan is required" }
        });
    });

    it("converts the domain archive request into one protocol archive effect", async () => {
        const state = makeRunningMeetingStateV1();
        const execute = vi.fn(async (command: RepositoryCommand<unknown, MeetingState>) => {
            const transition = command.transition({
                meetingId: state.id,
                version: state.version,
                state,
                createdAt: state.createdAt,
                updatedAt: state.updatedAt
            });
            return {
                requestId: command.requestId,
                meetingId: state.id,
                meetingVersion: state.version + 1,
                result: transition.result,
                eventSeqs: []
            };
        });
        let id = 0;
        const repository = { execute } as unknown as MeetingRepositoryPort<MeetingState>;
        const app = createMeetingCommandApplicationV1({
            creation: { create: vi.fn() },
            registry: {
                openMeeting: vi.fn(async () => repository)
            } as unknown as DomainRepositoryRegistry<MeetingState>,
            ids: { nextId: (kind) => `${kind}-${++id}` },
            clock: { now: () => 10 },
            resolveCallerScope: async ({ caller }) => ({
                caller,
                meetingId: state.id,
                role: "local"
            })
        });

        const result = await app.execute(
            {
                protocolVersion: 1,
                meetingId: state.id,
                expectedMeetingVersion: state.version,
                requestId: "end-1",
                action: {
                    kind: "end_meeting",
                    outcome: "partial",
                    reason: "未完成目标",
                    decisionIds: [],
                    completionFactIds: [],
                    unresolvedQuestionIds: [],
                    unresolvedIssueIds: []
                }
            },
            { caller: { channel: "loopback_remote", principalId: "local-controller" } },
            new AbortController().signal
        );

        expect(result).toMatchObject({
            kind: "accepted",
            effects: [{ kind: "archive", status: "queued" }]
        });
        expect(result.kind === "accepted" && result.effects).toHaveLength(1);
        expect(MeetingCommandResultV1Schema.safeParse(result).success).toBe(true);
    });

    it("lets the repository replay an archive result before checking mutable ownership", async () => {
        const state = { ...makeRunningMeetingStateV1(), lifecycle: "archiving" as const };
        const replayed: MeetingCommandResultV1 = {
            kind: "accepted",
            meetingId: state.id,
            committedVersion: 2,
            receiptId: "receipt-archive",
            factIds: ["fact-archive"],
            effects: []
        };
        const execute = vi.fn(async () => ({
            requestId: "archive-result-1",
            meetingId: state.id,
            meetingVersion: 2,
            result: replayed,
            eventSeqs: []
        }));
        const recover = vi.fn(async () => {
            throw new Error("mutable ownership must not be read before receipt replay");
        });
        const caller = {
            channel: "runtime_recovery" as const,
            principalId: "runtime-recovery"
        };
        const app = createMeetingCommandApplicationV1({
            creation: { create: vi.fn() },
            registry: {
                openMeeting: vi.fn(async () => ({ execute, recover }))
            } as unknown as DomainRepositoryRegistry<MeetingState>,
            ids: { nextId: (kind) => `${kind}-1` },
            clock: { now: () => 10 },
            resolveCallerScope: async () => ({
                caller,
                meetingId: state.id,
                role: "runtime"
            })
        });

        await expect(
            app.execute(
                {
                    protocolVersion: 1,
                    meetingId: state.id,
                    expectedMeetingVersion: 2,
                    requestId: "archive-result-1",
                    action: {
                        kind: "record_archive_session_result",
                        sessionOwnershipId: "ownership-1",
                        status: "closed"
                    }
                },
                { caller },
                new AbortController().signal
            )
        ).resolves.toEqual(replayed);
        expect(execute).toHaveBeenCalledOnce();
        expect(recover).not.toHaveBeenCalled();
    });
});
