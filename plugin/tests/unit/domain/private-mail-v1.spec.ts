import { describe, expect, it } from "vitest";
import {
    cancelPrivateMailV1,
    completePrivateMailV1,
    expirePrivateMailV1,
    sendPrivateMailV1,
    startPrivateMailV1
} from "@/domain/transitions/private-mail-v1.js";
import type { MeetingState } from "@/domain/meeting-state-v1.js";
import { validateMeetingStateV1 } from "@/domain/meeting-state-v1-validation.js";

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
            roles: id === "sender" ? ["evidence_reviewer"] : ["contributor"],
            agendaResponsibilityIds: ["agenda-1"],
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
                requiredOutputIds: []
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
        evidenceReviewerId: "sender",
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

    it("captures all publications added after send while preserving send prefix", () => {
        const sent = sendPrivateMailV1(state(), input);
        expect(sent.kind).toBe("accepted");
        if (sent.kind !== "accepted") return;
        const withLaterPublication = {
            ...sent.state,
            publications: [
                ...sent.state.publications,
                { ...sent.state.publications[0], id: "pub-2", seq: 2 }
            ]
        } as MeetingState;
        const result = startPrivateMailV1(withLaterPublication, {
            mailId: "mail-1",
            actorKind: "effect_dispatcher",
            now: 20
        });
        expect(result.kind).toBe("accepted");
        if (result.kind === "accepted") {
            expect(result.state.privateMails[0]).toMatchObject({
                status: "processing",
                sendContextPublicationUpperBound: ["pub-1"],
                processingContextPublicationUpperBound: ["pub-1", "pub-2"],
                processingStartedAt: 20,
                deadlineAt: 110,
                createdAt: 10
            });
            expect(result.relatedIds).toEqual(["mail-1", "pub-1", "pub-2"]);
            expect(result.effectRequests).toEqual([]);
            expect(result.state.version).toBe(3);
            expect(result.state.updatedAt).toBe(20);
        }
    });

    it.each([
        ["wrong actor", { actorKind: "other", now: 20 }, "UNAUTHORIZED", "mail-1"],
        [
            "paused",
            { actorKind: "effect_dispatcher", now: 20, lifecycle: "paused" },
            "INVALID_STATE",
            "mail-1"
        ],
        [
            "before created",
            { actorKind: "effect_dispatcher", now: 9 },
            "PRECONDITION_FAILED",
            "mail-1"
        ],
        [
            "at deadline",
            { actorKind: "effect_dispatcher", now: 110 },
            "PRECONDITION_FAILED",
            "mail-1"
        ],
        [
            "after deadline",
            { actorKind: "effect_dispatcher", now: 111 },
            "PRECONDITION_FAILED",
            "mail-1"
        ]
    ] as const)("rejects start %s", (_name, overrides, code, targetId) => {
        const sent = sendPrivateMailV1(state(), input);
        expect(sent.kind).toBe("accepted");
        if (sent.kind !== "accepted") return;
        const { lifecycle, ...startInput } = overrides;
        const candidate = lifecycle
            ? { ...sent.state, lifecycle: { ...sent.state.lifecycle, status: lifecycle } }
            : sent.state;
        const result = startPrivateMailV1(
            candidate as MeetingState,
            { mailId: "mail-1", ...startInput } as never
        );
        rejected(result, code, targetId);
        expect(result.state).toBe(candidate);
        expect(result.relatedIds).toEqual([]);
        expect(result.effectRequests).toEqual([]);
    });

    it("rejects missing start input without throwing", () => {
        const before = sendPrivateMailV1(state(), input);
        expect(before.kind).toBe("accepted");
        if (before.kind !== "accepted") return;
        const result = startPrivateMailV1(before.state, undefined as never);
        rejected(result, "INVALID_ARGUMENT");
        expect(result.state).toBe(before.state);
        expect(result.relatedIds).toEqual([]);
        expect(result.effectRequests).toEqual([]);
    });

    function withContribution(status: "preparing" | "closed", contributorId = "recipient") {
        const contribution = {
            id: "contribution-1",
            roundId: "round-1",
            contributorId,
            handRaise: { raisedAt: 0, purpose: "purpose" },
            acceptedAt: 0,
            status,
            substantiveSupplementCount: 0
        } as const;
        return {
            ...state(),
            rounds: [{ ...state().rounds[0], contributionIds: [contribution.id] }],
            contributions: [contribution]
        } as MeetingState;
    }

    it("rejects start when recipient owns a non-terminal Contribution", () => {
        const candidate = withContribution("preparing");
        const sent = sendPrivateMailV1(candidate, input);
        expect(sent.kind).toBe("accepted");
        if (sent.kind !== "accepted") return;
        const result = startPrivateMailV1(sent.state, {
            mailId: "mail-1",
            actorKind: "effect_dispatcher",
            now: 20
        });
        rejected(result, "PRECONDITION_FAILED", "mail-1");
        expect(result.state).toBe(sent.state);
        expect(result.relatedIds).toEqual([]);
        expect(result.effectRequests).toEqual([]);
    });

    it("allows terminal Contribution and another recipient's processing mail", () => {
        const terminalContribution = withContribution("closed", "recipient");
        const sent = sendPrivateMailV1(terminalContribution, input);
        expect(sent.kind).toBe("accepted");
        if (sent.kind !== "accepted") return;
        const other = {
            id: "mail-other",
            senderId: "sender",
            recipientId: "sender",
            body: "hello",
            relatedIds: ["pub-1"],
            sendContextPublicationUpperBound: ["pub-1"],
            processingContextPublicationUpperBound: ["pub-1"],
            status: "processing" as const,
            deadlineAt: 110,
            createdAt: 10,
            processingStartedAt: 20
        };
        const candidate = {
            ...sent.state,
            identities: [
                ...sent.state.identities,
                {
                    ...sent.state.identities[0],
                    id: "other",
                    displayName: "other",
                    roles: ["contributor"]
                }
            ],
            privateMails: [sent.state.privateMails[0], { ...other, recipientId: "other" }]
        } as MeetingState;
        const result = startPrivateMailV1(candidate, {
            mailId: "mail-1",
            actorKind: "effect_dispatcher",
            now: 30
        });
        expect(result.kind).toBe("accepted");
        if (result.kind === "accepted") {
            expect(result.state.privateMails[0].status).toBe("processing");
            expect(result.state.privateMails[1].status).toBe("processing");
        }
    });

    it.each(["processing", "completed", "cancelled", "timed_out"] as const)(
        "rejects start of %s mail as INVALID_STATE",
        (status) => {
            const sent = sendPrivateMailV1(state(), input);
            expect(sent.kind).toBe("accepted");
            if (sent.kind !== "accepted") return;
            let candidate = sent.state;
            if (status === "processing") {
                const started = startPrivateMailV1(candidate, {
                    mailId: "mail-1",
                    actorKind: "effect_dispatcher",
                    now: 20
                });
                expect(started.kind).toBe("accepted");
                if (started.kind === "accepted") candidate = started.state;
            } else if (status === "completed") {
                const started = startPrivateMailV1(candidate, {
                    mailId: "mail-1",
                    actorKind: "effect_dispatcher",
                    now: 20
                });
                if (started.kind !== "accepted") return;
                const completed = completePrivateMailV1(started.state, {
                    mailId: "mail-1",
                    recipientId: "recipient",
                    now: 30
                });
                if (completed.kind !== "accepted") return;
                candidate = completed.state;
            } else if (status === "cancelled") {
                const cancelled = cancelPrivateMailV1(candidate, {
                    mailId: "mail-1",
                    senderId: "sender",
                    reason: "stop",
                    now: 20
                });
                if (cancelled.kind !== "accepted") return;
                candidate = cancelled.state;
            } else {
                const expired = expirePrivateMailV1(candidate, {
                    mailId: "mail-1",
                    actorKind: "deadline_handler",
                    reason: "late",
                    now: 110
                });
                if (expired.kind !== "accepted") return;
                candidate = expired.state;
            }
            const result = startPrivateMailV1(candidate, {
                mailId: "mail-1",
                actorKind: "effect_dispatcher",
                now: 20
            });
            rejected(result, "INVALID_STATE", "mail-1");
            expect(result.state).toBe(candidate);
        }
    );

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

    function startedState() {
        const sent = sendPrivateMailV1(state(), input);
        expect(sent.kind).toBe("accepted");
        if (sent.kind !== "accepted") throw new Error("send failed");
        const started = startPrivateMailV1(sent.state, {
            mailId: "mail-1",
            actorKind: "effect_dispatcher",
            now: 20
        });
        expect(started.kind).toBe("accepted");
        if (started.kind !== "accepted") throw new Error("start failed");
        return started.state;
    }

    it("completes processing mail before deadline and preserves fields", () => {
        const before = startedState();
        const result = completePrivateMailV1(before, {
            mailId: "mail-1",
            recipientId: "recipient",
            now: 30
        });
        expect(result.kind).toBe("accepted");
        if (result.kind === "accepted") {
            expect(result.state.privateMails[0]).toMatchObject({
                status: "completed",
                completedAt: 30,
                processingContextPublicationUpperBound: ["pub-1"],
                processingStartedAt: 20,
                deadlineAt: 110,
                createdAt: 10
            });
            expect(result.state.version).toBe(before.version + 1);
            expect(result.state.updatedAt).toBe(30);
            expect(result.effectRequests).toEqual([]);
        }
    });

    it.each([
        ["missing caller", "missing", "UNAUTHORIZED"],
        ["wrong recipient", "sender", "UNAUTHORIZED"]
    ] as const)("rejects complete %s before lifecycle/mail lookup", (_name, recipientId, code) => {
        const before = startedState();
        const mailId = recipientId === "missing" ? "missing" : "mail-1";
        const result = completePrivateMailV1(before, { mailId, recipientId, now: 30 });
        rejected(result, code, mailId);
        expect(result.state).toBe(before);
    });

    it.each([
        ["before start", 19, "PRECONDITION_FAILED"],
        ["at deadline", 110, "PRECONDITION_FAILED"],
        ["after deadline", 111, "PRECONDITION_FAILED"]
    ] as const)("rejects complete %s", (_name, now, code) => {
        const before = startedState();
        const result = completePrivateMailV1(before, {
            mailId: "mail-1",
            recipientId: "recipient",
            now
        });
        rejected(result, code, "mail-1");
        expect(result.state).toBe(before);
    });

    it("rejects complete on queued mail as INVALID_STATE", () => {
        const before = sendPrivateMailV1(state(), input);
        expect(before.kind).toBe("accepted");
        if (before.kind !== "accepted") return;
        const result = completePrivateMailV1(before.state, {
            mailId: "mail-1",
            recipientId: "recipient",
            now: 20
        });
        rejected(result, "INVALID_STATE", "mail-1");
    });

    it.each([
        ["complete", completePrivateMailV1],
        ["cancel", cancelPrivateMailV1]
    ] as const)("rejects missing %s input without throwing", (_name, fn) => {
        const before = state();
        const result = fn(before, undefined as never);
        rejected(result, "INVALID_ARGUMENT");
        expect(result.state).toBe(before);
        expect(result.relatedIds).toEqual([]);
        expect(result.effectRequests).toEqual([]);
    });

    it("rejects cancel for wrong sender, empty reason, and early times atomically", () => {
        const queued = sendPrivateMailV1(state(), input);
        expect(queued.kind).toBe("accepted");
        if (queued.kind !== "accepted") return;
        for (const [senderId, reason, now, code] of [
            ["missing", "stop", 20, "UNAUTHORIZED"],
            ["sender", "", 20, "INVALID_ARGUMENT"],
            ["sender", "stop", 9, "PRECONDITION_FAILED"]
        ] as const) {
            const result = cancelPrivateMailV1(queued.state, {
                mailId: "mail-1",
                senderId,
                reason,
                now
            });
            rejected(
                result,
                code,
                code === "INVALID_ARGUMENT"
                    ? undefined
                    : senderId === "missing"
                      ? "missing"
                      : "mail-1"
            );
            expect(result.state).toBe(queued.state);
            expect(result.relatedIds).toEqual([]);
            expect(result.effectRequests).toEqual([]);
        }
        const processing = startedState();
        const early = cancelPrivateMailV1(processing, {
            mailId: "mail-1",
            senderId: "sender",
            reason: "stop",
            now: 19
        });
        rejected(early, "PRECONDITION_FAILED", "mail-1");
        expect(early.state).toBe(processing);
    });

    it("cancels queued and processing mail while preserving the processing pair", () => {
        const queued = sendPrivateMailV1(state(), input);
        expect(queued.kind).toBe("accepted");
        if (queued.kind !== "accepted") return;
        const cancelled = cancelPrivateMailV1(queued.state, {
            mailId: "mail-1",
            senderId: "sender",
            reason: "stop",
            now: 20
        });
        expect(cancelled.kind).toBe("accepted");
        if (cancelled.kind === "accepted")
            expect(cancelled.state.privateMails[0]).toMatchObject({
                status: "cancelled",
                completedAt: 20,
                failureReason: "stop"
            });
        const processing = startedState();
        const stopped = cancelPrivateMailV1(processing, {
            mailId: "mail-1",
            senderId: "sender",
            reason: "stop",
            now: 30
        });
        expect(stopped.kind).toBe("accepted");
        if (stopped.kind === "accepted")
            expect(stopped.state.privateMails[0]).toMatchObject({
                status: "cancelled",
                processingStartedAt: 20,
                processingContextPublicationUpperBound: ["pub-1"],
                completedAt: 30,
                failureReason: "stop"
            });
    });

    it("expires queued and processing mail and rejects early or malformed calls", () => {
        const queued = sendPrivateMailV1(state(), input);
        expect(queued.kind).toBe("accepted");
        if (queued.kind !== "accepted") return;
        const early = expirePrivateMailV1(queued.state, {
            mailId: "mail-1",
            actorKind: "deadline_handler",
            reason: "late",
            now: 109
        });
        rejected(early, "PRECONDITION_FAILED", "mail-1");
        const expired = expirePrivateMailV1(queued.state, {
            mailId: "mail-1",
            actorKind: "deadline_handler",
            reason: "late",
            now: 110
        });
        expect(expired.kind).toBe("accepted");
        const processing = startedState();
        const stopped = expirePrivateMailV1(processing, {
            mailId: "mail-1",
            actorKind: "deadline_handler",
            reason: "late",
            now: 110
        });
        expect(stopped.kind).toBe("accepted");
        if (stopped.kind === "accepted")
            expect(stopped.state.privateMails[0]).toMatchObject({
                status: "timed_out",
                processingStartedAt: 20,
                processingContextPublicationUpperBound: ["pub-1"],
                completedAt: 110,
                failureReason: "late"
            });
        const malformed = expirePrivateMailV1(processing, undefined as never);
        rejected(malformed, "INVALID_ARGUMENT");
    });

    it("releases the recipient gate after cancellation so the next mail can start", () => {
        const processing = startedState();
        const cancelled = cancelPrivateMailV1(processing, {
            mailId: "mail-1",
            senderId: "sender",
            reason: "stop",
            now: 30
        });
        expect(cancelled.kind).toBe("accepted");
        if (cancelled.kind !== "accepted") return;
        const next = sendPrivateMailV1(cancelled.state, { ...input, mailId: "mail-2", now: 31 });
        expect(next.kind).toBe("accepted");
        if (next.kind !== "accepted") return;
        const started = startPrivateMailV1(next.state, {
            mailId: "mail-2",
            actorKind: "effect_dispatcher",
            now: 32
        });
        expect(started.kind).toBe("accepted");
        if (started.kind === "accepted") {
            expect(started.relatedIds).toEqual(["mail-2", "pub-1"]);
            expect(started.effectRequests).toEqual([]);
        }
    });

    it("rejects a queued mail when another processing mail targets the same recipient", () => {
        const before = state();
        const candidate = {
            ...before,
            privateMails: [
                {
                    id: "mail-target",
                    senderId: "sender",
                    recipientId: "recipient",
                    body: "queued",
                    relatedIds: ["pub-1"],
                    sendContextPublicationUpperBound: ["pub-1"],
                    status: "queued" as const,
                    deadlineAt: 110,
                    createdAt: 10
                },
                {
                    id: "mail-processing",
                    senderId: "sender",
                    recipientId: "recipient",
                    body: "processing",
                    relatedIds: ["pub-1"],
                    sendContextPublicationUpperBound: ["pub-1"],
                    processingContextPublicationUpperBound: ["pub-1"],
                    status: "processing" as const,
                    deadlineAt: 110,
                    createdAt: 10,
                    processingStartedAt: 20
                }
            ]
        } as MeetingState;
        expect(validateMeetingStateV1(candidate)).toMatchObject({ kind: "valid" });
        const result = startPrivateMailV1(candidate, {
            mailId: "mail-target",
            actorKind: "effect_dispatcher",
            now: 30
        });
        rejected(result, "PRECONDITION_FAILED", "mail-target");
        expect(result.state).toBe(candidate);
        expect(result.relatedIds).toEqual([]);
        expect(result.effectRequests).toEqual([]);
    });

    function lifecycleState(
        status:
            "preparing" | "paused" | "converging" | "ending" | "terminal" | "archiving" | "archived"
    ) {
        const base = state();
        const termination = {
            id: "termination-1",
            outcome: "completed" as const,
            reason: "done",
            endedAt: 0,
            decisionIds: [],
            completionFactIds: [],
            unresolvedQuestionIds: [],
            unresolvedIssueIds: [],
            unclosedContributionIds: []
        };
        const archive = {
            id: "archive-1",
            status: "complete" as const,
            createdAt: 0,
            publicSnapshotVersion: 1,
            terminationId: termination.id,
            objective: base.objective,
            agenda: base.agenda,
            agendaCandidates: [],
            publications: [],
            messages: [],
            evidenceBundles: [],
            proposalRevisions: [],
            positions: [],
            decisionCandidates: [],
            decisions: [],
            completionFacts: [],
            questions: [],
            issues: [],
            riskDispositions: [],
            questionIssueDispositionFacts: [],
            termination,
            unresolvedQuestionIds: [],
            unresolvedIssueIds: [],
            unresolvedItemIds: [],
            unclosedContributions: [],
            identityProvenance: [],
            exportMaterials: []
        };
        const candidate = {
            ...base,
            lifecycle: { ...base.lifecycle, status },
            ...(status === "terminal" || status === "archiving" || status === "archived"
                ? { termination }
                : {}),
            ...(status === "archiving" || status === "archived" ? { archive } : {})
        } as MeetingState;
        expect(validateMeetingStateV1(candidate)).toMatchObject({ kind: "valid" });
        return candidate;
    }

    function lifecycleMail(
        status:
            | "preparing"
            | "paused"
            | "converging"
            | "ending"
            | "terminal"
            | "archiving"
            | "archived",
        processing = false
    ) {
        const base = lifecycleState(status);
        return {
            ...base,
            privateMails: [
                {
                    id: "mail-1",
                    senderId: "sender",
                    recipientId: "recipient",
                    body: "hello",
                    relatedIds: ["pub-1"],
                    sendContextPublicationUpperBound: ["pub-1"],
                    ...(processing
                        ? {
                              processingContextPublicationUpperBound: ["pub-1"],
                              processingStartedAt: 20,
                              status: "processing" as const
                          }
                        : { status: "queued" as const }),
                    deadlineAt: 110,
                    createdAt: 10
                }
            ]
        } as MeetingState;
    }

    it.each(["paused", "converging", "ending"] as const)(
        "allows cleanup actions while %s",
        (status) => {
            const complete = completePrivateMailV1(lifecycleMail(status, true), {
                mailId: "mail-1",
                recipientId: "recipient",
                now: 30
            });
            expect(complete.kind).toBe("accepted");
            expect(
                cancelPrivateMailV1(lifecycleMail(status), {
                    mailId: "mail-1",
                    senderId: "sender",
                    reason: "stop",
                    now: 20
                }).kind
            ).toBe("accepted");
            expect(
                expirePrivateMailV1(lifecycleMail(status), {
                    mailId: "mail-1",
                    actorKind: "deadline_handler",
                    reason: "late",
                    now: 110
                }).kind
            ).toBe("accepted");
        }
    );

    it.each(["preparing"] as const)("rejects all cleanup actions while %s", (status) => {
        const queued = lifecycleMail(status);
        for (const result of [
            completePrivateMailV1(lifecycleMail(status, true), {
                mailId: "mail-1",
                recipientId: "recipient",
                now: 30
            }),
            cancelPrivateMailV1(queued, {
                mailId: "mail-1",
                senderId: "sender",
                reason: "stop",
                now: 20
            }),
            expirePrivateMailV1(queued, {
                mailId: "mail-1",
                actorKind: "deadline_handler",
                reason: "late",
                now: 110
            })
        ])
            rejected(result, "INVALID_STATE");
    });

    it.each(["terminal", "archiving", "archived"] as const)(
        "rejects all cleanup actions while %s",
        (status) => {
            const queued = lifecycleMail(status);
            const processing = lifecycleMail(status, true);
            const results = [
                completePrivateMailV1(processing, {
                    mailId: "mail-1",
                    recipientId: "recipient",
                    now: 30
                }),
                cancelPrivateMailV1(queued, {
                    mailId: "mail-1",
                    senderId: "sender",
                    reason: "stop",
                    now: 20
                }),
                expirePrivateMailV1(queued, {
                    mailId: "mail-1",
                    actorKind: "deadline_handler",
                    reason: "late",
                    now: 110
                })
            ];
            for (const result of results) {
                rejected(result, "MEETING_TERMINAL", "mail-1");
                expect(result.relatedIds).toEqual([]);
                expect(result.effectRequests).toEqual([]);
            }
            expect(results[0].state).toBe(processing);
            expect(results[1].state).toBe(queued);
            expect(results[2].state).toBe(queued);
        }
    );

    it("rejects expire wrong actor and checks input/state before actor", () => {
        const before = sendPrivateMailV1(state(), input);
        expect(before.kind).toBe("accepted");
        if (before.kind !== "accepted") return;
        rejected(
            expirePrivateMailV1(before.state, {
                mailId: "mail-1",
                actorKind: "other",
                reason: "late",
                now: 110
            } as never),
            "UNAUTHORIZED",
            "mail-1"
        );
        rejected(
            expirePrivateMailV1({ ...before.state, version: -1 }, {
                mailId: "mail-1",
                actorKind: "other",
                reason: "late",
                now: 110
            } as never),
            "INVALID_ARGUMENT"
        );
        rejected(
            expirePrivateMailV1(before.state, {
                mailId: "mail-1",
                actorKind: "other",
                reason: "",
                now: 110
            } as never),
            "INVALID_ARGUMENT"
        );
    });

    const input = {
        mailId: "mail-1",
        senderId: "sender",
        recipientId: "recipient",
        body: "hello",
        relatedIds: ["pub-1"],
        now: 10
    } as const;

    function rejected(
        result: ReturnType<typeof sendPrivateMailV1>,
        code: string,
        targetId?: string
    ) {
        expect(result.kind).toBe("rejected");
        if (result.kind === "rejected") {
            expect(result.error.code).toBe(code);
            if (targetId === undefined) expect(result.error.targetId).toBeUndefined();
            else expect(result.error.targetId).toBe(targetId);
        }
    }

    it.each([
        ["empty relatedIds", { relatedIds: [] }, "INVALID_ARGUMENT"],
        ["duplicate relatedIds", { relatedIds: ["pub-1", "pub-1"] }, "INVALID_ARGUMENT"],
        ["private related ref", { relatedIds: ["agenda-1"] }, "NOT_FOUND"],
        ["unknown related ref", { relatedIds: ["missing"] }, "NOT_FOUND"],
        ["unknown sender", { senderId: "missing" }, "UNAUTHORIZED"],
        ["unknown recipient", { recipientId: "missing" }, "NOT_FOUND"],
        ["unknown agenda", { agendaId: "missing" }, "NOT_FOUND"],
        ["self mail", { senderId: "sender", recipientId: "sender" }, "PRECONDITION_FAILED"],
        ["duplicate mail id", { mailId: "mail-1" }, "INVALID_ARGUMENT"]
    ] as const)("rejects %s atomically", (_name, overrides, code) => {
        const before = state();
        const candidate =
            _name === "duplicate mail id"
                ? {
                      ...before,
                      privateMails: [
                          {
                              id: input.mailId,
                              senderId: input.senderId,
                              recipientId: input.recipientId,
                              body: input.body,
                              relatedIds: [...input.relatedIds],
                              deadlineAt: 110,
                              createdAt: 10,
                              status: "queued",
                              sendContextPublicationUpperBound: ["pub-1"]
                          }
                      ]
                  }
                : before;
        const result = sendPrivateMailV1(candidate, { ...input, ...overrides } as never);
        rejected(
            result,
            code,
            _name === "unknown sender"
                ? "missing"
                : _name === "unknown recipient" || _name === "unknown agenda"
                  ? "missing"
                  : _name === "duplicate mail id"
                    ? "mail-1"
                    : _name === "private related ref"
                      ? "agenda-1"
                      : _name === "unknown related ref"
                        ? "missing"
                        : undefined
        );
        expect(result.state).toBe(candidate);
        expect(result.relatedIds).toEqual([]);
        expect(result.effectRequests).toEqual([]);
    });

    it.each([
        ["missing input", undefined],
        ["empty mail id", { ...input, mailId: "" }],
        ["empty body", { ...input, body: "   " }],
        ["empty agenda id", { ...input, agendaId: "" }],
        ["invalid related id", { ...input, relatedIds: [""] }],
        ["invalid now", { ...input, now: -1 }]
    ] as const)("rejects %s as INVALID_ARGUMENT without throwing", (_name, candidate) => {
        const before = state();
        const result = sendPrivateMailV1(before, candidate as never);
        rejected(result, "INVALID_ARGUMENT");
        expect(result.state).toBe(before);
        expect(result.relatedIds).toEqual([]);
        expect(result.effectRequests).toEqual([]);
    });

    it("omits an explicitly undefined optional agendaId and preserves all other state", () => {
        const before = state();
        const result = sendPrivateMailV1(before, { ...input, agendaId: undefined });
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
            expect(result.relatedIds).toEqual(["mail-1", "recipient", "pub-1"]);
            expect(result.state.version).toBe(2);
            expect(result.state.updatedAt).toBe(10);
            expect(result.state.identities).toBe(before.identities);
            expect(result.state.publications).toBe(before.publications);
            expect(result.state.contributions).toBe(before.contributions);
        }
    });

    it("accepts a public FormalMessage related ref without adding it to send context", () => {
        const before = state();
        const message = {
            id: "message-1",
            seq: 1,
            actorId: "sender",
            agendaId: "agenda-1",
            kind: "note",
            body: "public",
            publicationId: "pub-1",
            relatedIds: ["pub-1"],
            createdAt: 0
        };
        const candidate = { ...before, messages: [message] } as MeetingState;
        const result = sendPrivateMailV1(candidate, { ...input, relatedIds: ["message-1"] });
        expect(result.kind).toBe("accepted");
        if (result.kind === "accepted") {
            expect(result.state.privateMails[0].relatedIds).toEqual(["message-1"]);
            expect(result.state.privateMails[0].sendContextPublicationUpperBound).toEqual([
                "pub-1"
            ]);
            expect(result.relatedIds).toEqual(["mail-1", "recipient", "message-1"]);
        }
    });

    it("checks unknown sender before lifecycle and self-mail preconditions", () => {
        const before = {
            ...state(),
            lifecycle: { ...state().lifecycle, status: "paused" }
        } as MeetingState;
        const result = sendPrivateMailV1(before, {
            ...input,
            senderId: "missing",
            recipientId: "missing"
        });
        rejected(result, "UNAUTHORIZED", "missing");
        expect(result.state).toBe(before);
    });

    it.each([
        [
            "deadline overflow",
            { now: Number.MAX_SAFE_INTEGER, limits: { ...state().limits, taskDeadlineMs: 1 } },
            "PRECONDITION_FAILED"
        ],
        ["paused", { lifecycle: { ...state().lifecycle, status: "paused" } }, "INVALID_STATE"],
        [
            "terminal",
            {
                lifecycle: { ...state().lifecycle, status: "terminal" },
                termination: {
                    id: "termination-1",
                    outcome: "completed",
                    reason: "done",
                    endedAt: 10,
                    decisionIds: [],
                    completionFactIds: [],
                    unresolvedQuestionIds: [],
                    unresolvedIssueIds: [],
                    unclosedContributionIds: []
                }
            },
            "MEETING_TERMINAL"
        ]
    ] as const)("rejects %s with the fixed code", (_name, overrides, code) => {
        const before = state();
        const { limits, ...rest } = overrides;
        const candidate = { ...before, ...rest, ...(limits ? { limits } : {}) } as MeetingState;
        const result = sendPrivateMailV1(candidate, {
            ...input,
            ...(limits ? { now: Number.MAX_SAFE_INTEGER } : {})
        });
        rejected(result, code);
        expect(result.state).toBe(candidate);
        expect(result.relatedIds).toEqual([]);
        expect(result.effectRequests).toEqual([]);
    });

    it("rejects an invalid snapshot before input processing", () => {
        const before = { ...state(), version: -1 } as MeetingState;
        const result = sendPrivateMailV1(before, input);
        rejected(result, "INVALID_ARGUMENT");
        expect(result.state).toBe(before);
        expect(result.relatedIds).toEqual([]);
        expect(result.effectRequests).toEqual([]);
    });
});
