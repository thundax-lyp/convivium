import { expect, it } from "vitest";
import {
    recordPosition,
    recordDecisionCandidate,
    pendingDecisionCandidates
} from "@/domain/transitions/outcome.js";
import { validState, expectRejected } from "./outcome-fixtures.js";

const ready = () => {
    const state = validState();
    state.proposals = [
        {
            id: "rev",
            proposalId: "prop",
            ordinal: 1,
            actorId: "contributor",
            agendaId: "a",
            summary: "s",
            body: "b",
            evidenceIds: ["v"],
            createdAt: 0
        }
    ];
    return state;
};
const positionInput = (
    actor = { kind: "identity", id: "contributor" } as const,
    overrides: Record<string, unknown> = {}
) => ({
    positionId: "pos",
    proposalRevisionId: "rev",
    stance: "support",
    rationale: "x",
    evidenceIds: ["v"],
    actor,
    now: 1,
    ...overrides
});
const candidateInput = (
    actor = { kind: "identity", id: "contributor" } as const,
    overrides: Record<string, unknown> = {}
) => ({
    candidateId: "cand",
    proposalRevisionId: "rev",
    outcome: "adopt",
    rationale: "x",
    evidenceIds: ["v"],
    positionIds: ["pos"],
    actor,
    now: 1,
    ...overrides
});

it("accepts current Position with exact bookkeeping and immutable input", () => {
    const state = ready();
    const before = structuredClone(state);
    const result = recordPosition(state, positionInput());
    expect(result).toMatchObject({
        kind: "accepted",
        relatedIds: ["pos", "rev", "v"],
        effectRequests: []
    });
    if (result.kind !== "accepted") return;
    expect(result.state.version).toBe(2);
    expect(result.state.updatedAt).toBe(1);
    expect(state).toEqual(before);
    expect(state.positions).toEqual([]);
});
it("accepts current Candidate without status or Decision and preserves related order", () => {
    const state = ready();
    const position = recordPosition(state, positionInput());
    expect(position.kind).toBe("accepted");
    if (position.kind !== "accepted") return;
    const result = recordDecisionCandidate(position.state, candidateInput());
    expect(result).toMatchObject({
        kind: "accepted",
        relatedIds: ["cand", "rev", "pos", "v"],
        effectRequests: []
    });
    if (result.kind !== "accepted") return;
    expect(result.state.decisionCandidates[0]).not.toHaveProperty("status");
    expect(result.state.decisions).toEqual([]);
    expect(result.state.version).toBe(3);
});
it.each([
    ["missing evidence", ["missing"], "NOT_FOUND"],
    ["unpublished evidence", ["v2"], "PRECONDITION_FAILED"],
    ["empty evidence", [], "INVALID_ARGUMENT"],
    ["duplicate evidence", ["v", "v"], "INVALID_ARGUMENT"]
] as const)("Position evidence %s", (_name, evidenceIds, code) => {
    const state = ready();
    if (_name === "unpublished evidence")
        state.evidencePackages[0].versions.push({
            ...state.evidencePackages[0].versions[0],
            id: "v2",
            ordinal: 2
        });
    const result = recordPosition(
        state,
        positionInput({ kind: "identity", id: "contributor" }, { evidenceIds })
    );
    expectRejected(result, state, code);
});
it.each(["paused"] as const)("Position/Candidate reject %s", (status) => {
    const state = ready();
    state.lifecycle = { ...state.lifecycle, status };
    expect(recordPosition(state, positionInput())).toMatchObject({
        error: { code: "INVALID_STATE" }
    });
    expect(recordDecisionCandidate(state, candidateInput())).toMatchObject({
        error: { code: "INVALID_STATE" }
    });
});
it.each(["terminal"] as const)("Position/Candidate reject terminal %s", (status) => {
    const state = validState(status);
    state.proposals = [
        {
            id: "rev",
            proposalId: "prop",
            ordinal: 1,
            actorId: "contributor",
            agendaId: "a",
            summary: "s",
            body: "b",
            evidenceIds: ["v"],
            createdAt: 0
        }
    ];
    expect(recordPosition(state, positionInput())).toMatchObject({
        error: { code: "MEETING_TERMINAL" }
    });
    expect(recordDecisionCandidate(state, candidateInput())).toMatchObject({
        error: { code: "MEETING_TERMINAL" }
    });
});
it("derives pending candidates only for current unused revisions without mutating state", () => {
    const state = ready();
    const positions = state.positions;
    state.proposals.push({ ...state.proposals[0], id: "old", ordinal: 0 });
    state.decisionCandidates = [
        {
            id: "used",
            proposalRevisionId: "rev",
            actorId: "contributor",
            outcome: "adopt",
            rationale: "x",
            evidenceIds: ["v"],
            positionIds: ["pos"],
            createdAt: 0
        }
    ];
    state.decisions = [{ ...state.decisionCandidates[0], candidateId: "used", status: "accepted" }];
    const before = structuredClone(state);
    expect(pendingDecisionCandidates(state)).toEqual([]);
    expect(state).toEqual(before);
    expect(state.positions).toBe(positions);
});
it("keeps precedence authorization and shape ahead of lifecycle for both writes", () => {
    const state = ready();
    state.lifecycle = { ...state.lifecycle, status: "paused" };
    expect(recordPosition(state, positionInput({ kind: "identity", id: "manager" }))).toMatchObject(
        { error: { code: "UNAUTHORIZED" } }
    );
    expect(
        recordPosition(
            state,
            positionInput({ kind: "identity", id: "contributor" }, { positionId: "" })
        )
    ).toMatchObject({ error: { code: "INVALID_ARGUMENT" } });
    expect(
        recordDecisionCandidate(state, candidateInput({ kind: "identity", id: "manager" }))
    ).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    expect(
        recordDecisionCandidate(
            state,
            candidateInput({ kind: "identity", id: "contributor" }, { candidateId: "" })
        )
    ).toMatchObject({ error: { code: "INVALID_ARGUMENT" } });
});
it("accepts captain Position and Candidate writes", () => {
    const state = ready();
    const position = recordPosition(state, positionInput({ kind: "identity", id: "captain" }));
    expect(position).toMatchObject({ kind: "accepted" });
    if (position.kind !== "accepted") return;
    const candidate = recordDecisionCandidate(
        position.state,
        candidateInput({ kind: "identity", id: "captain" })
    );
    expect(candidate).toMatchObject({
        kind: "accepted",
        relatedIds: ["cand", "rev", "pos", "v"],
        effectRequests: []
    });
});
it.each([
    ["manager", { kind: "identity", id: "manager" }],
    ["reviewer", { kind: "identity", id: "reviewer" }],
    ["local_controller", { kind: "local_controller", id: "local" }]
] as const)("rejects %s for Position and Candidate independently", (_name, actor) => {
    const state = ready();
    const p = recordPosition(state, positionInput(actor as never));
    expect(p).toMatchObject({
        kind: "rejected",
        error: { code: "UNAUTHORIZED" },
        state,
        relatedIds: [],
        effectRequests: []
    });
    const withPosition = ready();
    withPosition.positions = [
        {
            id: "pos",
            proposalRevisionId: "rev",
            actorId: "contributor",
            stance: "support",
            rationale: "x",
            evidenceIds: ["v"],
            createdAt: 0
        }
    ];
    const c = recordDecisionCandidate(withPosition, candidateInput(actor as never));
    expect(c).toMatchObject({
        kind: "rejected",
        error: { code: "UNAUTHORIZED" },
        state: withPosition,
        relatedIds: [],
        effectRequests: []
    });
});
it.each([
    ["missing", ["missing"], "NOT_FOUND"],
    ["unpublished", ["v2"], "PRECONDITION_FAILED"],
    ["duplicate", ["v", "v"], "INVALID_ARGUMENT"]
] as const)("Candidate evidence %s", (_name, evidenceIds, code) => {
    const state = ready();
    state.positions = [
        {
            id: "pos",
            proposalRevisionId: "rev",
            actorId: "contributor",
            stance: "support",
            rationale: "x",
            evidenceIds: ["v"],
            createdAt: 0
        }
    ];
    if (_name === "unpublished")
        state.evidencePackages[0].versions.push({
            ...state.evidencePackages[0].versions[0],
            id: "v2",
            ordinal: 2
        });
    const result = recordDecisionCandidate(state, candidateInput(undefined, { evidenceIds }));
    expect(result).toMatchObject({
        kind: "rejected",
        error: { code },
        state,
        relatedIds: [],
        effectRequests: []
    });
});
it.each([
    ["duplicate", ["pos", "pos"], "INVALID_ARGUMENT"],
    ["missing", ["missing"], "NOT_FOUND"]
] as const)("Candidate positionIds %s", (_name, positionIds, code) => {
    const state = ready();
    if (_name !== "missing")
        state.positions = [
            {
                id: "pos",
                proposalRevisionId: "rev",
                actorId: "contributor",
                stance: "support",
                rationale: "x",
                evidenceIds: ["v"],
                createdAt: 0
            }
        ];
    const result = recordDecisionCandidate(state, candidateInput(undefined, { positionIds }));
    expect(result).toMatchObject({
        kind: "rejected",
        error: { code },
        state,
        relatedIds: [],
        effectRequests: []
    });
});
it("rejects duplicate Position and Candidate IDs", () => {
    const state = ready();
    state.positions = [
        {
            id: "pos",
            proposalRevisionId: "rev",
            actorId: "contributor",
            stance: "support",
            rationale: "x",
            evidenceIds: ["v"],
            createdAt: 0
        }
    ];
    expect(recordPosition(state, positionInput())).toMatchObject({
        kind: "rejected",
        error: { code: "INVALID_ARGUMENT" }
    });
    state.decisionCandidates = [
        {
            id: "cand",
            proposalRevisionId: "rev",
            actorId: "contributor",
            outcome: "adopt",
            rationale: "x",
            evidenceIds: ["v"],
            positionIds: ["pos"],
            createdAt: 0
        }
    ];
    expect(recordDecisionCandidate(state, candidateInput())).toMatchObject({
        kind: "rejected",
        error: { code: "INVALID_ARGUMENT" }
    });
});
it("rejects cross-revision Position and Candidate references", () => {
    const state = ready();
    state.proposals.push({
        ...state.proposals[0],
        id: "rev-2",
        ordinal: 2,
        supersedesRevisionId: "rev"
    });
    state.positions = [
        {
            id: "other-pos",
            proposalRevisionId: "rev",
            actorId: "contributor",
            stance: "support",
            rationale: "x",
            evidenceIds: ["v"],
            createdAt: 0
        }
    ];
    expect(
        recordPosition(state, positionInput(undefined, { proposalRevisionId: "rev" }))
    ).toMatchObject({ error: { code: "PRECONDITION_FAILED" } });
    expect(
        recordDecisionCandidate(
            state,
            candidateInput(undefined, {
                proposalRevisionId: "rev-2",
                positionIds: ["other-pos"]
            })
        )
    ).toMatchObject({ error: { code: "PRECONDITION_FAILED" } });
});
it("keeps pending order for running and paused and filters used/old while retaining current unused", () => {
    for (const status of ["running", "paused"] as const) {
        const state = ready();
        state.lifecycle = { ...state.lifecycle, status };
        state.proposals.push({
            ...state.proposals[0],
            id: "old",
            ordinal: 0
        });
        state.decisionCandidates = [
            {
                id: "old-cand",
                proposalRevisionId: "old",
                actorId: "contributor",
                outcome: "adopt",
                rationale: "x",
                evidenceIds: ["v"],
                positionIds: ["pos"],
                createdAt: 0
            },
            {
                id: "used",
                proposalRevisionId: "rev",
                actorId: "contributor",
                outcome: "adopt",
                rationale: "x",
                evidenceIds: ["v"],
                positionIds: ["pos"],
                createdAt: 1
            },
            {
                id: "free",
                proposalRevisionId: "rev",
                actorId: "contributor",
                outcome: "reject",
                rationale: "x",
                evidenceIds: ["v"],
                positionIds: ["pos"],
                createdAt: 2
            }
        ];
        state.decisions = [
            { ...state.decisionCandidates[1], candidateId: "used", status: "accepted" }
        ];
        const before = structuredClone(state);
        const pending = pendingDecisionCandidates(state);
        expect(pending.map((c) => c.id)).toEqual(["free"]);
        expect(state).toEqual(before);
    }
});
it.each(["preparing", "converging", "ending", "terminal", "archiving", "archived"] as const)(
    "pending is empty in %s",
    (status) => {
        const state = ready();
        state.lifecycle = { ...state.lifecycle, status };
        state.decisionCandidates = [
            {
                id: "free",
                proposalRevisionId: "rev",
                actorId: "contributor",
                outcome: "adopt",
                rationale: "x",
                evidenceIds: ["v"],
                positionIds: ["pos"],
                createdAt: 0
            }
        ];
        expect(pendingDecisionCandidates(state)).toEqual([]);
    }
);
