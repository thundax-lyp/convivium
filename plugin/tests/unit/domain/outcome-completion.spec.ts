import { captainActorIdFor } from "@/domain/control-actor.ts";
import { describe, expect, it } from "vitest";
import type { MeetingState } from "@/domain/meeting-state.ts";
import { recordCompletionFact, changeCompletionFact } from "@/domain/transitions/outcome.ts";
import {
    addUnpublishedEvidence,
    validState,
    completionReadyState,
    completionInput
} from "./outcome-fixtures.ts";

describe("CompletionFact", () => {
    it("accepts Captain completion from published reviewed evidence without a decision chain", () => {
        const state = completionReadyState();
        const input = completionInput();
        const result = recordCompletionFact(state, input);
        expect(result).toMatchObject({ kind: "accepted" });
        if (result.kind === "accepted") {
            expect(result.state.completionFacts[0].evidenceIds).toEqual(["v"]);
            expect(result.state.objective.requiredOutputs[0].status).toBe("satisfied");
            expect(result.state.lifecycle.status).toBe("converging");
        }
    });

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

    it("requires published reviewed evidence for replacement facts", () => {
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
                createdAt: 0
            }
        ];
        state.objective.requiredOutputs[0] = {
            ...state.objective.requiredOutputs[0],
            status: "satisfied"
        };
        addUnpublishedEvidence(state);
        const reviewResult = changeCompletionFact(state, {
            factId: "old",
            status: "superseded",
            rationale: "replace",
            replacement: {
                factId: "new",
                outputId: "o",
                statement: "new",
                rationale: "new",
                evidenceIds: ["v2"]
            },
            actor: { kind: "captain_user", id: captainActorIdFor("m") },
            now: 1
        });
        expect(reviewResult).toMatchObject({
            kind: "rejected",
            error: { code: "PRECONDITION_FAILED" }
        });
    });
    it.each([
        ["missing output", { outputId: "missing" }, "NOT_FOUND"],
        ["missing criterion", { criterionId: "missing" }, "NOT_FOUND"],
        ["missing evidence", { evidenceIds: ["missing"] }, "NOT_FOUND"],
        ["duplicate evidence", { evidenceIds: ["v", "v"] }, "INVALID_ARGUMENT"],
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
    it("keeps completion facts running with a pending hard constraint", () => {
        const state = completionReadyState();
        state.objective.hardConstraints = [{ id: "c", text: "constraint", status: "pending" }];
        const result = recordCompletionFact(state, completionInput());
        expect(result).toMatchObject({ kind: "accepted", effectRequests: [] });
        if (result.kind !== "accepted") {
            return;
        }
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
