import { captainActorIdFor } from "@/domain/control-actor.js";
import { describe, expect, it } from "vitest";
import type { MeetingState } from "@/domain/meeting-state.js";
import { recordCompletionFact, changeCompletionFact } from "@/domain/transitions/outcome.js";
import { validState, completionReadyState, completionInput } from "./outcome-fixtures.js";

describe("CompletionFact", () => {
    const reviewBreaks = [
        [
            "missing evidence review",
            (s: MeetingState) => {
                s.reviews = [];
                s.evidencePackages[0].versions[0].status = "submitted";
                s.reviewDeliveries = [];
                s.publications[0].finalReviewIds = [];
            }
        ],
        [
            "publication omits review",
            (s: MeetingState) => {
                s.publications[0].finalReviewIds = [];
            }
        ],
        [
            "review delivery is not sent",
            (s: MeetingState) => {
                const { sentAt: _sentAt, ...delivery } = s.reviewDeliveries[0];
                s.reviewDeliveries[0] = {
                    ...delivery,
                    status: "failed",
                    failedAt: 1,
                    failureReason: "timeout"
                };
            }
        ],
        [
            "duplicate selected review",
            (s: MeetingState) => {
                s.reviews = [s.reviews[0], { ...s.reviews[0], id: "review-2" }];
            }
        ]
    ] as const;

    it.each(reviewBreaks)("rejects when %s", (_name, mutate) => {
        const state = completionReadyState();
        mutate(state);
        const result = recordCompletionFact(state, completionInput());
        expect(result).toMatchObject({ kind: "rejected", error: { code: "PRECONDITION_FAILED" } });
        expect(result.state).toBe(state);
        expect(result.effectRequests).toEqual([]);
        expect(state.completionFacts).toEqual([]);
    });

    it.each([
        [
            "revoked",
            (s: MeetingState) => {
                s.decisions[0].status = "revoked";
            }
        ],
        [
            "non-adopt",
            (s: MeetingState) => {
                s.decisions[0].outcome = "reject";
            }
        ],
        [
            "stale revision",
            (s: MeetingState) => {
                s.proposals.push({
                    ...s.proposals[0],
                    id: "rev-2",
                    ordinal: 2,
                    supersedesRevisionId: "rev"
                });
            }
        ]
    ] as const)("rejects %s decision basis", (_name, mutate) => {
        const state = completionReadyState();
        mutate(state);
        const result = recordCompletionFact(state, completionInput());
        expect(result).toMatchObject({ kind: "rejected", error: { code: "PRECONDITION_FAILED" } });
        expect(result.state).toBe(state);
        expect(result.effectRequests).toEqual([]);
        expect(state.completionFacts).toEqual([]);
    });

    it("checks authorization before review preconditions", () => {
        const state = completionReadyState();
        state.publications[0].finalReviewIds = [];
        const result = recordCompletionFact(
            state,
            completionInput({ kind: "identity", id: "manager" })
        );
        expect(result).toMatchObject({ kind: "rejected", error: { code: "UNAUTHORIZED" } });
        expect(result.state).toBe(state);
    });

    it("rejects a local controller and manager even with a valid review chain", () => {
        for (const actor of [
            { kind: "identity", id: "manager" } as const,
            { kind: "local_controller", id: "local" } as const
        ]) {
            const result = recordCompletionFact(
                completionReadyState(),
                completionInput(actor as never)
            );
            expect(result).toMatchObject({ kind: "rejected", error: { code: "UNAUTHORIZED" } });
        }
    });

    it("applies the same review and basis gates to replacement facts", () => {
        const state = completionReadyState();
        state.completionFacts = [
            {
                id: "old",
                outputId: "o",
                actorId: captainActorIdFor("m"),
                status: "active",
                statement: "old",
                rationale: "old",
                evidenceIds: ["v"],
                decisionIds: ["dec"],
                createdAt: 0
            }
        ];
        state.objective.requiredOutputs[0] = {
            ...state.objective.requiredOutputs[0],
            status: "satisfied"
        };
        state.evidencePackages[0].currentVersionId = "v2";
        state.evidencePackages[0].versions.push({
            ...state.evidencePackages[0].versions[0],
            id: "v2",
            ordinal: 2,
            status: "submitted"
        });
        state.publications[0].finalVersionIds = ["v", "v2"];
        state.publications[0].finalReviewIds = ["review"];
        const reviewResult = changeCompletionFact(state, {
            factId: "old",
            status: "superseded",
            rationale: "replace",
            replacement: {
                factId: "new",
                outputId: "o",
                statement: "new",
                rationale: "new",
                evidenceIds: ["v2"],
                decisionIds: ["dec"]
            },
            actor: { kind: "captain_user", id: captainActorIdFor("m") },
            now: 1
        });
        expect(reviewResult).toMatchObject({
            kind: "rejected",
            error: { code: "PRECONDITION_FAILED" }
        });
        const basisState = completionReadyState();
        basisState.completionFacts = [
            {
                id: "old",
                outputId: "o",
                actorId: captainActorIdFor("m"),
                status: "active",
                statement: "old",
                rationale: "old",
                evidenceIds: ["v"],
                decisionIds: ["dec"],
                createdAt: 0
            }
        ];
        basisState.objective.requiredOutputs[0] = {
            ...basisState.objective.requiredOutputs[0],
            status: "pending"
        };
        basisState.proposals.push({
            ...basisState.proposals[0],
            id: "rev-2",
            ordinal: 2,
            supersedesRevisionId: "rev"
        });
        const basisResult = changeCompletionFact(basisState, {
            factId: "old",
            status: "superseded",
            rationale: "replace",
            replacement: {
                factId: "new",
                outputId: "o",
                statement: "new",
                rationale: "new",
                evidenceIds: ["v"],
                decisionIds: ["dec"]
            },
            actor: { kind: "captain_user", id: captainActorIdFor("m") },
            now: 1
        });
        expect(basisResult).toMatchObject({
            kind: "rejected",
            error: { code: "PRECONDITION_FAILED" }
        });
    });
    it.each([
        ["missing output", { outputId: "missing" }, "NOT_FOUND"],
        ["missing criterion", { criterionId: "missing" }, "NOT_FOUND"],
        ["missing decision", { decisionIds: ["missing"] }, "NOT_FOUND"],
        ["missing evidence", { evidenceIds: ["missing"] }, "NOT_FOUND"],
        ["duplicate evidence", { evidenceIds: ["v", "v"] }, "INVALID_ARGUMENT"],
        ["empty decision ids", { decisionIds: [] }, "INVALID_ARGUMENT"],
        ["duplicate fact", {}, "INVALID_ARGUMENT"]
    ] as const)("record rejects %s", (_name, overrides, code) => {
        const state = completionReadyState();
        if (_name === "duplicate fact") {
            state.objective.requiredOutputs[0].status = "satisfied";
            state.completionFacts = [
                {
                    id: "fact",
                    outputId: "o",
                    actorId: captainActorIdFor("m"),
                    status: "active",
                    statement: "existing",
                    rationale: "existing",
                    evidenceIds: ["v"],
                    decisionIds: ["dec"],
                    createdAt: 0
                }
            ];
        }
        expect(recordCompletionFact(state, { ...completionInput(), ...overrides })).toMatchObject({
            kind: "rejected",
            error: { code },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it.each([
        ["unknown status", { status: "unknown" }, "INVALID_ARGUMENT"],
        ["missing replacement", { status: "superseded" }, "INVALID_ARGUMENT"],
        [
            "revoke replacement",
            { status: "revoked", replacement: { factId: "new" } },
            "INVALID_ARGUMENT"
        ]
    ] as const)("change rejects %s", (_name, overrides, code) => {
        const state = completionReadyState();
        state.objective.requiredOutputs[0].status = "satisfied";
        state.completionFacts = [
            {
                ...completionInput(),
                actor: undefined,
                status: "active",
                id: "fact",
                actorId: captainActorIdFor("m"),
                createdAt: 0
            } as never
        ];
        expect(
            changeCompletionFact(state, {
                factId: "fact",
                rationale: "x",
                actor: { kind: "captain_user", id: captainActorIdFor("m") },
                now: 1,
                ...overrides
            } as never)
        ).toMatchObject({
            kind: "rejected",
            error: { code },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it("keeps completion facts running with a pending hard constraint", () => {
        const state = completionReadyState();
        state.objective.hardConstraints = [{ id: "c", text: "constraint", status: "pending" }];
        const result = recordCompletionFact(state, completionInput());
        expect(result).toMatchObject({ kind: "accepted", effectRequests: [] });
        if (result.kind !== "accepted") return;
        expect(result.state.objective.requiredOutputs[0].status).toBe("satisfied");
        expect(result.state.lifecycle.status).toBe("running");
    });
    it.each(["paused"] as const)("record rejects lifecycle %s", (status) => {
        const state = completionReadyState();
        state.lifecycle = { ...state.lifecycle, status };
        expect(recordCompletionFact(state, completionInput())).toMatchObject({
            error: { code: "INVALID_STATE" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it.each(["terminal"] as const)("record rejects terminal lifecycle %s", (status) => {
        const state = validState(status);
        expect(recordCompletionFact(state, completionInput())).toMatchObject({
            error: { code: "MEETING_TERMINAL" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
});
