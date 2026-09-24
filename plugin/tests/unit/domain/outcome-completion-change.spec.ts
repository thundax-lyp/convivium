import { describe, expect, it } from "vitest";
import type { MeetingState } from "@/domain/meeting-state.js";
import { changeCompletionFact } from "@/domain/transitions/outcome.js";
import { validState, completionReadyState } from "./outcome-fixtures.js";

describe("CompletionFact change", () => {
    const ready = () => {
        const state = completionReadyState();
        state.objective.requiredOutputs[0].status = "satisfied";
        state.objective.acceptanceCriteria = [
            { id: "criterion", text: "criterion", status: "satisfied" }
        ];
        state.completionFacts = [
            {
                id: "old",
                outputId: "o",
                criterionId: "criterion",
                actorId: "captain",
                status: "active",
                statement: "old",
                rationale: "old",
                evidenceIds: ["v"],
                decisionIds: ["dec"],
                createdAt: 0
            }
        ];
        return state;
    };
    const replacement = {
        factId: "new",
        outputId: "o",
        criterionId: "criterion",
        statement: "new",
        rationale: "new",
        evidenceIds: ["v"],
        decisionIds: ["dec"]
    };
    const change = (state: MeetingState, overrides: Record<string, unknown> = {}) =>
        changeCompletionFact(state, {
            factId: "old",
            status: "superseded",
            rationale: "replace",
            replacement,
            actor: { kind: "identity", id: "captain" },
            now: 1,
            ...overrides
        } as never);
    it("revokes a valid old fact without appending and preserves history", () => {
        const state = ready();
        const before = structuredClone(state);
        const result = changeCompletionFact(state, {
            factId: "old",
            status: "revoked",
            rationale: "revoke",
            actor: { kind: "identity", id: "captain" },
            now: 1
        });
        expect(result).toMatchObject({ kind: "accepted", relatedIds: ["old"], effectRequests: [] });
        if (result.kind !== "accepted") return;
        expect(result.state.completionFacts).toHaveLength(1);
        expect(result.state.completionFacts[0]).toMatchObject({
            ...before.completionFacts[0],
            status: "revoked"
        });
        expect(result.state.version).toBe(2);
        expect(result.state.updatedAt).toBe(1);
        expect(state).toEqual(before);
    });
    it.each([
        ["missing old", "missing", "NOT_FOUND"],
        ["revoked old", "revoked", "PRECONDITION_FAILED"],
        ["superseded old", "superseded", "PRECONDITION_FAILED"]
    ] as const)("rejects %s with target", (_name, mode, code) => {
        const state = ready();
        if (mode !== "missing") {
            state.completionFacts[0].status = mode;
            state.objective.requiredOutputs[0].status = "pending";
            state.objective.acceptanceCriteria[0].status = "pending";
        }
        expect(
            changeCompletionFact(state, {
                factId: mode === "missing" ? "missing" : "old",
                status: "revoked",
                rationale: "x",
                actor: { kind: "identity", id: "captain" },
                now: 1
            })
        ).toMatchObject({ error: { code }, state, relatedIds: [], effectRequests: [] });
    });
    it("supersedes with criterion and exact replacement bookkeeping", () => {
        const state = ready();
        const before = structuredClone(state);
        const result = change(state);
        expect(result).toMatchObject({
            kind: "accepted",
            relatedIds: ["old", "new", "o", "criterion", "dec", "v"],
            effectRequests: []
        });
        if (result.kind !== "accepted") return;
        expect(result.state.completionFacts).toMatchObject([
            { id: "old", status: "superseded" },
            {
                id: "new",
                outputId: "o",
                criterionId: "criterion",
                statement: "new",
                rationale: "new",
                evidenceIds: ["v"],
                decisionIds: ["dec"],
                status: "active",
                actorId: "captain",
                supersedesFactId: "old",
                createdAt: 1
            }
        ]);
        expect(result.state.version).toBe(2);
        expect(result.state.updatedAt).toBe(1);
        expect(state).toEqual(before);
    });
    it.each([
        ["missing output", { outputId: "missing" }, "NOT_FOUND", "missing"],
        ["missing criterion", { criterionId: "missing" }, "NOT_FOUND", "missing"],
        ["missing decision", { decisionIds: ["missing"] }, "NOT_FOUND", "missing"],
        ["missing evidence", { evidenceIds: ["missing"] }, "NOT_FOUND", "missing"],
        ["unpublished evidence", { evidenceIds: ["v2"] }, "PRECONDITION_FAILED", undefined]
    ] as const)("replacement typed ref %s", (_name, overrides, code, targetId) => {
        const state = ready();
        if (_name === "unpublished evidence")
            state.evidencePackages[0].versions.push({
                ...state.evidencePackages[0].versions[0],
                id: "v2",
                ordinal: 2,
                status: "submitted"
            });
        expect(change(state, { replacement: { ...replacement, ...overrides } })).toMatchObject({
            error: { code },
            ...(targetId ? { relatedIds: [] } : {}),
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it.each([
        ["unknown", { status: "unknown" }],
        ["missing replacement", { replacement: undefined }],
        ["revoke replacement", { status: "revoked", replacement }],
        ["duplicate replacement", { replacement: { ...replacement, factId: "old" } }],
        ["empty replacement id", { replacement: { ...replacement, factId: "" } }]
    ] as const)("rejects change shape %s", (_name, overrides) => {
        const state = ready();
        expect(change(state, overrides)).toMatchObject({
            error: { code: "INVALID_ARGUMENT" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it.each(["paused"] as const)("rejects change lifecycle %s", (status) => {
        const state = ready();
        state.lifecycle = { ...state.lifecycle, status };
        expect(change(state)).toMatchObject({
            error: { code: "INVALID_STATE" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it.each(["terminal"] as const)("rejects change terminal lifecycle %s", (status) => {
        const state = validState(status);
        expect(
            changeCompletionFact(state, {
                factId: "missing",
                status: "revoked",
                rationale: "x",
                actor: { kind: "identity", id: "captain" },
                now: 1
            })
        ).toMatchObject({
            error: { code: "MEETING_TERMINAL" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it("keeps change authorization and shape ahead of lifecycle", () => {
        const state = ready();
        state.lifecycle = { ...state.lifecycle, status: "paused" };
        expect(
            changeCompletionFact(state, {
                factId: "old",
                status: "revoked",
                rationale: "x",
                actor: { kind: "identity", id: "manager" },
                now: 1
            })
        ).toMatchObject({
            error: { code: "UNAUTHORIZED" },
            state,
            relatedIds: [],
            effectRequests: []
        });
        expect(
            changeCompletionFact(state, {
                factId: "",
                status: "revoked",
                rationale: "x",
                actor: { kind: "identity", id: "captain" },
                now: 1
            })
        ).toMatchObject({
            error: { code: "INVALID_ARGUMENT" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
});
