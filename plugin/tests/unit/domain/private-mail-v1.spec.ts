import { describe, expect, it } from "vitest";
import {
    cancelPrivateMailV1,
    completePrivateMailV1,
    expirePrivateMailV1,
    sendPrivateMailV1,
    startPrivateMailV1
} from "@/domain/transitions/private-mail-v1.js";
import type { MeetingState } from "@/domain/meeting-state-v1.js";

function state(): MeetingState {
    return {
        id: "meeting-1",
        version: 1,
        createdAt: 0,
        updatedAt: 0,
        objective: {
            statement: "x",
            requiredOutputs: [],
            acceptanceCriteria: [],
            hardConstraints: [],
            acceptableRiskLevel: "low"
        },
        lifecycle: { status: "running", changedAt: 0, changedBy: "captain" },
        identities: ["sender", "recipient"].map((id) => ({
            id,
            displayName: id,
            roles: ["contributor"],
            agendaResponsibilityIds: [],
            reviewResponsibilityIds: [],
            riskAuthority: false,
            required: false
        })),
        identityRecommendations: [],
        agenda: [
            {
                id: "agenda-1",
                title: "a",
                question: "q",
                status: "active",
                requiredOutputIds: [],
                requiredReviewerIds: []
            }
        ],
        agendaCandidates: [],
        rounds: [
            {
                id: "round-1",
                agendaId: "agenda-1",
                publicBaselinePublicationIds: [],
                openedAt: 0,
                status: "published",
                contributionIds: [],
                publicationId: "pub-1"
            }
        ],
        opportunityRequests: [],
        pendingHandRaises: [],
        contributions: [],
        formatApprovals: [],
        evidencePackages: [],
        registrations: [],
        reviews: [],
        reviewDeliveries: [],
        publications: [
            {
                id: "pub-1",
                roundId: "round-1",
                seq: 1,
                finalVersionIds: [],
                finalReviewIds: [],
                publishedAt: 0,
                exitReasons: []
            }
        ],
        messages: [],
        proposals: [],
        positions: [],
        decisionCandidates: [],
        decisions: [],
        questions: [],
        issues: [],
        riskDispositions: [],
        tasks: [],
        completionDeclarations: [],
        completionFacts: [],
        privateMails: [],
        managerPlans: [],
        limits: {
            maxFormalMessages: 10,
            maxDurationMs: 10,
            taskDeadlineMs: 100,
            reviewDeadlineMs: 10,
            responseDeadlineMs: 60000
        }
    } as MeetingState;
}

describe("private mail transitions", () => {
    it("sends queued mail with fixed context, deadline, and session effect", () => {
        const before = state();
        const result = sendPrivateMailV1(before, {
            mailId: "mail-1",
            senderId: "sender",
            recipientId: "recipient",
            body: "hello",
            relatedIds: ["pub-1"],
            now: 10
        });
        expect(result.kind).toBe("accepted");
        if (result.kind === "accepted") {
            expect(result.state.privateMails[0]).toEqual({
                id: "mail-1",
                senderId: "sender",
                recipientId: "recipient",
                body: "hello",
                relatedIds: ["pub-1"],
                sendContextPublicationUpperBound: ["pub-1"],
                status: "queued",
                deadlineAt: 110,
                createdAt: 10
            });
            expect(result.effectRequests).toEqual([
                {
                    kind: "session_mail",
                    mailId: "mail-1",
                    recipientId: "recipient",
                    contextPublicationUpperBound: ["pub-1"]
                }
            ]);
            expect(result.state.version).toBe(2);
        }
    });
    it("starts queued mail and fixes processing context", () => {
        const sent = sendPrivateMailV1(state(), {
            mailId: "mail-1",
            senderId: "sender",
            recipientId: "recipient",
            body: "hello",
            relatedIds: ["pub-1"],
            now: 10
        });
        expect(sent.kind).toBe("accepted");
        if (sent.kind === "accepted") {
            const result = startPrivateMailV1(sent.state, {
                mailId: "mail-1",
                actorKind: "effect_dispatcher",
                now: 20
            });
            expect(result.kind).toBe("accepted");
            if (result.kind === "accepted")
                expect(result.state.privateMails[0]).toMatchObject({
                    status: "processing",
                    processingContextPublicationUpperBound: ["pub-1"],
                    processingStartedAt: 20
                });
        }
    });
    it("completes, cancels, and expires with lifecycle fields", () => {
        const sent = sendPrivateMailV1(state(), {
            mailId: "mail-1",
            senderId: "sender",
            recipientId: "recipient",
            body: "hello",
            relatedIds: ["pub-1"],
            now: 10
        });
        expect(sent.kind).toBe("accepted");
        if (sent.kind === "accepted") {
            const completed = completePrivateMailV1(sent.state, {
                mailId: "mail-1",
                recipientId: "recipient",
                now: 20
            });
            expect(completed.kind).toBe("rejected");
            const cancelled = cancelPrivateMailV1(sent.state, {
                mailId: "mail-1",
                senderId: "sender",
                reason: "stop",
                now: 20
            });
            expect(cancelled.kind).toBe("accepted");
            const expired = expirePrivateMailV1(sent.state, {
                mailId: "mail-1",
                actorKind: "deadline_handler",
                reason: "late",
                now: 110
            });
            expect(expired.kind).toBe("accepted");
        }
    });
});
