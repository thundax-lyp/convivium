import type { MeetingState } from "@/domain/meeting-state.js";
import { sendPrivateMail, startPrivateMail } from "@/domain/transitions/private-mail.js";
import { expect } from "vitest";

export const privateMailInput = {
    mailId: "mail-1",
    senderId: "sender",
    recipientId: "recipient",
    body: "hello",
    relatedIds: ["pub-1"],
    now: 10
} as const;

export function privateMailState(): MeetingState {
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
        identities: [
            ...["sender", "recipient"].map((id) => ({
                id,
                displayName: id,
                roles:
                    id === "sender" ? (["evidence_reviewer"] as const) : (["contributor"] as const),
                agendaResponsibilityIds: ["agenda-1"],
                riskAuthority: false,
                required: false
            })),
            {
                id: "manager",
                displayName: "manager",
                roles: ["manager"],
                agendaResponsibilityIds: ["agenda-1"],
                riskAuthority: false,
                required: false
            }
        ],
        identityRecommendations: [],
        agenda: [
            {
                id: "agenda-1",
                title: "a",
                question: "q",
                status: "active",
                requiredOutputIds: []
            }
        ],
        agendaCandidates: [],
        rounds: [
            {
                id: "round-1",
                agendaId: "agenda-1",
                planId: "plan-1",
                roundGoal: { question: "q", evidenceGap: "gap", expectedOutput: "output" },
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
        evidenceReviewerId: "sender",
        evidencePackages: [],
        registrations: [],
        reviews: [],
        reviewClaims: [],
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
        managerPlans: [
            {
                id: "plan-1",
                agendaId: "agenda-1",
                managerId: "manager",
                kind: "open_round",
                roundGoal: { question: "q", evidenceGap: "gap", expectedOutput: "output" },
                rationale: "plan",
                createdAt: 0,
                status: "completed"
            }
        ],
        limits: {
            maxFormalMessages: 10,
            maxDurationMs: 10,
            taskDeadlineMs: 100,
            reviewDeadlineMs: 10,
            responseDeadlineMs: 60000
        }
    } as MeetingState;
}

export function privateMailStateWithContribution(
    status: "preparing" | "closed",
    contributorId = "recipient"
): MeetingState {
    const contribution = {
        id: "contribution-1",
        roundId: "round-1",
        contributorId,
        handRaise: { raisedAt: 0, purpose: "purpose" },
        acceptedAt: 0,
        status,
        substantiveSupplementCount: 0
    } as const;
    const state = privateMailState();
    return {
        ...state,
        rounds: [{ ...state.rounds[0], contributionIds: [contribution.id] }],
        contributions: [contribution]
    } as MeetingState;
}

export function startedPrivateMailState(): MeetingState {
    const sent = sendPrivateMail(privateMailState(), privateMailInput);
    if (sent.kind !== "accepted") throw new Error("send failed");
    const started = startPrivateMail(sent.state, {
        mailId: "mail-1",
        actorKind: "effect_dispatcher",
        now: 20
    });
    if (started.kind !== "accepted") throw new Error("start failed");
    return started.state;
}

export function expectPrivateMailRejection(
    result: ReturnType<typeof sendPrivateMail>,
    code: string,
    targetId?: string
): void {
    expect(result.kind).toBe("rejected");
    if (result.kind !== "rejected") return;
    expect(result.error.code).toBe(code);
    if (targetId === undefined) expect(result.error.targetId).toBeUndefined();
    else expect(result.error.targetId).toBe(targetId);
}
