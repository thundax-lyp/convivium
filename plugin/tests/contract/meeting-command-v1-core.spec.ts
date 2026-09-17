import { describe, expect, it, vi } from "vitest";
import { makeRunningMeetingStateV1 } from "../fixtures/meeting-state-v1.js";
import type { MeetingState } from "@/domain/index.js";
import {
    MeetingCommandV1Schema,
    decodeMeetingStateV1,
    encodeMeetingStateV1
} from "@/protocol/meeting-command-v1.js";
import { projectMeetingViewV1 } from "@/projection/meeting-view-v1.js";
import type { DomainRepositoryRegistry } from "@/repository/domain/domain-repository-registry.js";
import { meetingIdFor } from "@/repository/domain/keys.js";
import {
    LOCAL_CONTROLLER_PRINCIPAL_ID,
    createMeetingCommandApplicationV1
} from "@/runtime/application-service/meeting-command-v1.js";

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
                channel: "loopback_remote" as const,
                principalId: LOCAL_CONTROLLER_PRINCIPAL_ID
            }
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

    it("projects only a committed snapshot", () => {
        const state = makeRunningMeetingStateV1();
        const result = projectMeetingViewV1({
            teamId: "team-v1",
            meetingId: state.id,
            version: state.version,
            state,
            createdAt: state.createdAt,
            updatedAt: state.updatedAt
        });
        expect(result).toEqual({ meetingId: state.id, meetingVersion: state.version, state });
        expect(result.state).not.toBe(state);
    });
});
