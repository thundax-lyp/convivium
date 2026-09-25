import { captainActorIdFor } from "@/domain/control-actor.js";
import { describe, expect, it } from "vitest";
import type { MeetingState } from "@/domain/meeting-state.js";
import { decide, changeDecision } from "@/domain/transitions/outcome.js";
import { validState, decisionReadyState } from "./outcome-fixtures.js";

describe("decision change corrective gates", () => {
    const decidedState = () => {
        const state = decisionReadyState();
        state.decisionCandidates.push({
            ...state.decisionCandidates[0],
            id: "replacement",
            rationale: "replacement"
        });
        const result = decide(state, {
            decisionId: "old-decision",
            candidateId: "cand",
            actor: { kind: "captain_user", id: captainActorIdFor("m") },
            now: 1
        });
        if (result.kind !== "accepted") throw new Error("fixture decision failed");
        return result.state;
    };
    const change = (state: MeetingState, overrides: Record<string, unknown> = {}) =>
        changeDecision(state, {
            decisionId: "old-decision",
            status: "revoked",
            rationale: "x",
            evidenceIds: ["v"],
            actor: { kind: "captain_user", id: captainActorIdFor("m") },
            now: 2,
            ...overrides
        } as never);
    it.each([
        ["empty", [], "INVALID_ARGUMENT"],
        ["duplicate", ["v", "v"], "INVALID_ARGUMENT"],
        ["missing", ["missing"], "NOT_FOUND"],
        ["unpublished", ["v2"], "PRECONDITION_FAILED"]
    ] as const)("change evidence %s", (_name, evidenceIds, code) => {
        const state = decidedState();
        if (_name === "unpublished")
            state.evidencePackages[0].versions.push({
                ...state.evidencePackages[0].versions[0],
                id: "v2",
                ordinal: 2,
                status: "submitted"
            });
        expect(change(state, { evidenceIds })).toMatchObject({
            kind: "rejected",
            error: { code },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it("rejects replacement candidate target variants", () => {
        const base = decidedState();
        expect(
            change(base, {
                status: "superseded",
                replacementCandidateId: "missing",
                replacementDecisionId: "new"
            })
        ).toMatchObject({ error: { code: "NOT_FOUND" } });
        for (const variant of ["cross-proposal", "noncurrent"] as const) {
            const state = decidedState();
            state.proposals.push({
                ...state.proposals[0],
                id: "rev-2",
                proposalId: variant === "cross-proposal" ? "other" : "prop",
                ordinal: variant === "cross-proposal" ? 1 : 2,
                ...(variant === "cross-proposal" ? {} : { supersedesRevisionId: "rev" })
            });
            if (variant === "cross-proposal") {
                state.positions.push({
                    ...state.positions[0],
                    id: "pos-2",
                    proposalRevisionId: "rev-2"
                });
            }
            state.decisionCandidates.push({
                ...state.decisionCandidates[1],
                id: "variant",
                proposalRevisionId: variant === "cross-proposal" ? "rev-2" : "rev",
                positionIds: variant === "cross-proposal" ? ["pos-2"] : ["pos"]
            });
            const result = change(state, {
                status: "superseded",
                replacementCandidateId: "variant",
                replacementDecisionId: "new"
            });
            expect(result).toMatchObject({
                error: { code: "PRECONDITION_FAILED" },
                state,
                relatedIds: [],
                effectRequests: []
            });
        }
    });
    it("rejects a replacement revision that already has an accepted decision", () => {
        const state = decidedState();
        state.proposals.push({
            ...state.proposals[0],
            id: "rev-2",
            ordinal: 2,
            supersedesRevisionId: "rev"
        });
        state.positions.push({ ...state.positions[0], id: "pos-2", proposalRevisionId: "rev-2" });
        state.decisionCandidates.push({
            ...state.decisionCandidates[0],
            id: "used-revision-candidate",
            proposalRevisionId: "rev-2",
            positionIds: ["pos-2"]
        });
        state.decisions.push({
            ...state.decisionCandidates[2],
            id: "used-revision-decision",
            candidateId: "used-revision-candidate",
            status: "accepted"
        });
        state.decisionCandidates.push({
            ...state.decisionCandidates[0],
            id: "replacement-revision-candidate",
            proposalRevisionId: "rev-2",
            positionIds: ["pos-2"]
        });
        const result = change(state, {
            status: "superseded",
            replacementCandidateId: "replacement-revision-candidate",
            replacementDecisionId: "new"
        });
        expect(result).toMatchObject({
            kind: "rejected",
            error: { code: "PRECONDITION_FAILED" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it("rejects a replacement candidate already used by any decision", () => {
        const state = decidedState();
        state.decisions.push({
            ...state.decisionCandidates[1],
            id: "used-replacement",
            candidateId: "replacement",
            status: "revoked"
        });
        expect(
            change(state, {
                status: "superseded",
                replacementCandidateId: "replacement",
                replacementDecisionId: "new"
            })
        ).toMatchObject({
            error: { code: "PRECONDITION_FAILED" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it.each(["old-decision"] as const)("rejects replacement decision id %s", (decisionId) => {
        const state = decidedState();
        state.decisions.push({ ...state.decisions[0], id: "new" });
        expect(
            change(state, {
                status: "superseded",
                replacementCandidateId: "replacement",
                replacementDecisionId: decisionId
            })
        ).toMatchObject({
            error: { code: "INVALID_ARGUMENT" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it.each([
        ["missing candidate", { replacementCandidateId: undefined, replacementDecisionId: "new" }],
        [
            "missing decision",
            { replacementCandidateId: "replacement", replacementDecisionId: undefined }
        ],
        ["revoke candidate", { status: "revoked", replacementCandidateId: "replacement" }],
        ["revoke decision", { status: "revoked", replacementDecisionId: "new" }],
        ["unknown status", { status: "unknown" }]
    ] as const)("rejects discriminant %s", (_name, overrides) =>
        expect(change(decidedState(), overrides)).toMatchObject({
            error: { code: "INVALID_ARGUMENT" },
            relatedIds: [],
            effectRequests: []
        })
    );
    it("keeps Captain and local revoke independent and immutable", () => {
        for (const actor of [
            { kind: "captain_user", id: captainActorIdFor("m") },
            { kind: "captain_user", id: captainActorIdFor("m") }
        ] as const) {
            const state = decidedState();
            const before = structuredClone(state);
            const result = change(state, { actor });
            expect(result).toMatchObject({
                kind: "accepted",
                relatedIds: ["old-decision", "v"],
                effectRequests: []
            });
            expect(state).toEqual(before);
        }
    });
    it.each(["paused"] as const)("change lifecycle %s", (status) => {
        const state = decidedState();
        state.lifecycle = { ...state.lifecycle, status };
        expect(change(state)).toMatchObject({
            error: { code: "INVALID_STATE" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it("keeps change authorization and shape ahead of lifecycle", () => {
        const paused = validState("paused");
        expect(
            changeDecision(paused, {
                decisionId: "missing",
                status: "revoked",
                rationale: "x",
                evidenceIds: ["v"],
                actor: { kind: "identity", id: "manager" },
                now: 1
            })
        ).toMatchObject({
            error: { code: "UNAUTHORIZED" },
            state: paused,
            relatedIds: [],
            effectRequests: []
        });
        expect(
            changeDecision(paused, {
                decisionId: "",
                status: "revoked",
                rationale: "x",
                evidenceIds: ["v"],
                actor: { kind: "captain_user", id: captainActorIdFor("m") },
                now: 1
            })
        ).toMatchObject({
            error: { code: "INVALID_ARGUMENT" },
            state: paused,
            relatedIds: [],
            effectRequests: []
        });
    });
});
