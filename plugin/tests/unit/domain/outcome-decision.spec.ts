import { expect, it } from "vitest";
import { pendingDecisionCandidates, decide, changeDecision } from "@/domain/transitions/outcome.js";
import { validateMeetingStateV1 } from "@/domain/meeting-state-validation.js";
import { validState, decisionReadyState } from "./outcome-fixtures.js";

it("decides with captain and local controller while copying candidate fields", () => {
    for (const actor of [
        { kind: "identity", id: "captain" },
        { kind: "local_controller", id: "contributor" }
    ] as const) {
        const state = decisionReadyState();
        const before = structuredClone(state);
        const result = decide(state, {
            decisionId: "dec",
            candidateId: "cand",
            actor,
            now: 1
        });
        expect(result).toMatchObject({
            kind: "accepted",
            relatedIds: ["dec", "cand"],
            effectRequests: []
        });
        if (result.kind !== "accepted") continue;
        const decision = result.state.decisions[0];
        const candidate = state.decisionCandidates[0];
        expect(decision).toMatchObject({
            ...candidate,
            id: "dec",
            candidateId: "cand",
            status: "accepted",
            actorId: candidate.actorId
        });
        expect(result.state.version).toBe(2);
        expect(result.state.updatedAt).toBe(1);
        expect(pendingDecisionCandidates(result.state)).toEqual([]);
        expect(state).toEqual(before);
    }
});
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
        actor: { kind: "identity", id: "captain" },
        now: 1
    });
    if (result.kind !== "accepted") throw new Error("fixture decision failed");
    return result.state;
};
it.each([
    ["captain", { kind: "identity", id: "captain" }],
    ["local", { kind: "local_controller", id: "captain" }]
] as const)("supersedes atomically with %s", (_name, actor) => {
    const state = decidedState();
    const before = structuredClone(state);
    const result = changeDecision(state, {
        decisionId: "old-decision",
        status: "superseded",
        replacementCandidateId: "replacement",
        replacementDecisionId: "new-decision",
        rationale: "replace",
        evidenceIds: ["v"],
        actor,
        now: 2
    });
    expect(result).toMatchObject({
        kind: "accepted",
        relatedIds: ["old-decision", "new-decision", "replacement", "v"],
        effectRequests: []
    });
    if (result.kind !== "accepted") return;
    expect(result.state.decisions.map((d) => [d.id, d.status])).toEqual([
        ["old-decision", "superseded"],
        ["new-decision", "accepted"]
    ]);
    expect(result.state.decisions[1]).toMatchObject({
        ...state.decisionCandidates[1],
        id: "new-decision",
        candidateId: "replacement",
        status: "accepted",
        replacesDecisionId: "old-decision"
    });
    expect(result.state.version).toBe(3);
    expect(result.state.updatedAt).toBe(2);
    expect(state).toEqual(before);
});
it("supersedes with a replacement candidate from the current revision of the same proposal", () => {
    const state = decidedState();
    state.proposals.push({
        ...state.proposals[0],
        id: "rev-2",
        ordinal: 2,
        supersedesRevisionId: "rev"
    });
    state.positions.push({ ...state.positions[0], id: "pos-2", proposalRevisionId: "rev-2" });
    state.decisionCandidates[1] = {
        ...state.decisionCandidates[1],
        proposalRevisionId: "rev-2",
        positionIds: ["pos-2"]
    };

    const result = changeDecision(state, {
        decisionId: "old-decision",
        status: "superseded",
        replacementCandidateId: "replacement",
        replacementDecisionId: "new-decision",
        rationale: "replace",
        evidenceIds: ["v"],
        actor: { kind: "identity", id: "captain" },
        now: 2
    });

    expect(result).toMatchObject({ kind: "accepted", effectRequests: [] });
});
it("rejects a superseded decision without an atomic replacement", () => {
    const state = decidedState();
    state.decisions[0] = { ...state.decisions[0], status: "superseded" };

    expect(validateMeetingStateV1(state)).toMatchObject({
        kind: "invalid",
        path: "$.decisions[0].status"
    });
});
it.each(["contributor"] as const)("rejects %s decision actors", (id) => {
    const state = decisionReadyState();
    const decideResult = decide(state, {
        decisionId: "d",
        candidateId: "cand",
        actor: { kind: "identity", id },
        now: 1
    });
    expect(decideResult).toMatchObject({
        error: { code: "UNAUTHORIZED" },
        state,
        relatedIds: [],
        effectRequests: []
    });
    const changeState = decidedState();
    const changeResult = changeDecision(changeState, {
        decisionId: "d",
        status: "revoked",
        rationale: "x",
        evidenceIds: ["v"],
        actor: { kind: "identity", id },
        now: 1
    });
    expect(changeResult).toMatchObject({
        error: { code: "UNAUTHORIZED" },
        state: changeState,
        relatedIds: [],
        effectRequests: []
    });
});
it("rejects decision discriminant shapes and preserves state", () => {
    const state = decisionReadyState();
    expect(
        changeDecision(state, {
            decisionId: "d",
            status: "revoked",
            rationale: "x",
            evidenceIds: ["v"],
            replacementCandidateId: "c",
            actor: { kind: "identity", id: "captain" },
            now: 1
        } as never)
    ).toMatchObject({
        error: { code: "INVALID_ARGUMENT" },
        state,
        relatedIds: [],
        effectRequests: []
    });
    expect(
        decide(state, {
            decisionId: "",
            candidateId: "cand",
            actor: { kind: "identity", id: "captain" },
            now: 1
        })
    ).toMatchObject({ error: { code: "INVALID_ARGUMENT" }, state });
});
it("keeps converging pending candidates empty", () => {
    const state = decisionReadyState();
    state.lifecycle = { ...state.lifecycle, status: "converging" };
    state.decisionCandidates = [state.decisionCandidates[0]];
    expect(pendingDecisionCandidates(state)).toEqual([]);
});
it.each([
    [
        "missing candidate",
        () =>
            decide(decisionReadyState(), {
                decisionId: "d",
                candidateId: "missing",
                actor: { kind: "identity", id: "captain" },
                now: 1
            }),
        "NOT_FOUND"
    ],
    [
        "duplicate decision",
        () => {
            const s = decisionReadyState();
            s.decisions = [
                { ...s.decisionCandidates[0], id: "d", candidateId: "cand", status: "accepted" }
            ];
            return decide(s, {
                decisionId: "d",
                candidateId: "cand",
                actor: { kind: "identity", id: "captain" },
                now: 1
            });
        },
        "INVALID_ARGUMENT"
    ]
] as const)("decide %s", (_name, call, code) =>
    expect(call()).toMatchObject({
        kind: "rejected",
        error: { code },
        relatedIds: [],
        effectRequests: []
    })
);
it.each(["used candidate", "same revision accepted", "old revision candidate"] as const)(
    "decide rejects %s precondition",
    (kind) => {
        const state = decisionReadyState();
        if (kind === "used candidate") {
            state.decisions = [
                {
                    ...state.decisionCandidates[0],
                    id: "used",
                    candidateId: "cand",
                    status: "accepted"
                }
            ];
        } else if (kind === "same revision accepted") {
            state.decisionCandidates.push({ ...state.decisionCandidates[0], id: "other" });
            state.decisions = [
                {
                    ...state.decisionCandidates[1],
                    id: "other-decision",
                    candidateId: "other",
                    status: "accepted"
                }
            ];
        } else {
            state.proposals.push({
                ...state.proposals[0],
                id: "new-rev",
                ordinal: 2,
                supersedesRevisionId: "rev"
            });
        }
        const result = decide(state, {
            decisionId: "new-decision",
            candidateId: "cand",
            actor: { kind: "identity", id: "captain" },
            now: 1
        });
        expect(result).toMatchObject({
            kind: "rejected",
            error: { code: "PRECONDITION_FAILED" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    }
);
it.each([
    ["revoked", "PRECONDITION_FAILED"],
    ["superseded", "INVALID_ARGUMENT"]
] as const)("change rejects old %s", (status, code) => {
    const state = decidedState();
    state.decisions[0].status = status;
    expect(
        changeDecision(state, {
            decisionId: "old-decision",
            status: "revoked",
            rationale: "x",
            evidenceIds: ["v"],
            actor: { kind: "identity", id: "captain" },
            now: 2
        })
    ).toMatchObject({
        error: { code },
        state,
        relatedIds: [],
        effectRequests: []
    });
});
it.each(["paused"] as const)("decision lifecycle %s", (status) => {
    const state = decisionReadyState();
    state.lifecycle = { ...state.lifecycle, status };
    const result = decide(state, {
        decisionId: "d",
        candidateId: "cand",
        actor: { kind: "identity", id: "captain" },
        now: 1
    });
    expect(result).toMatchObject({
        error: { code: "INVALID_STATE" },
        state,
        relatedIds: [],
        effectRequests: []
    });
});
it.each(["terminal"] as const)("decision terminal lifecycle %s", (status) => {
    const state = validState(status);
    const result = decide(state, {
        decisionId: "d",
        candidateId: "cand",
        actor: { kind: "identity", id: "captain" },
        now: 1
    });
    expect(result).toMatchObject({
        error: { code: "MEETING_TERMINAL" },
        state,
        relatedIds: [],
        effectRequests: []
    });
});
it.each(["terminal"] as const)("change terminal lifecycle %s", (status) => {
    const state = validState(status);
    expect(
        changeDecision(state, {
            decisionId: "missing",
            status: "revoked",
            rationale: "x",
            evidenceIds: ["v"],
            actor: { kind: "identity", id: "captain" },
            now: 2
        })
    ).toMatchObject({
        error: { code: "MEETING_TERMINAL" },
        state,
        relatedIds: [],
        effectRequests: []
    });
});
