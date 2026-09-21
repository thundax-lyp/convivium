import { describe, expect, it } from "vitest";
import { recordProposalRevision } from "@/domain/transitions/outcome.js";
import { validState, proposalState } from "./outcome-fixtures.js";

describe("proposal revision gates", () => {
    const input = (overrides: Record<string, unknown> = {}) => ({
        revisionId: "rev-1",
        proposalId: "prop",
        agendaId: "a",
        summary: "summary",
        body: "body",
        evidenceIds: ["v"],
        actor: { kind: "identity", id: "contributor" },
        now: 1,
        ...overrides
    });

    it.each([
        ["manager", { kind: "identity", id: "manager" }],
        ["local", { kind: "local_controller", id: "local" }]
    ] as const)("rejects %s actor", (_name, actor) => {
        const state = proposalState();
        const result = recordProposalRevision(state, input({ actor }));
        expect(result).toMatchObject({
            kind: "rejected",
            error: { code: "UNAUTHORIZED" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it("distinguishes missing from unpublished evidence", () => {
        const missing = recordProposalRevision(
            proposalState(),
            input({ evidenceIds: ["missing"] })
        );
        expect(missing).toMatchObject({
            kind: "rejected",
            error: { code: "NOT_FOUND", targetId: "missing" }
        });
        const unpublished = proposalState();
        unpublished.evidencePackages[0].versions.push({
            ...unpublished.evidencePackages[0].versions[0],
            id: "v2",
            ordinal: 2
        });
        const result = recordProposalRevision(unpublished, input({ evidenceIds: ["v2"] }));
        expect(result).toMatchObject({ kind: "rejected", error: { code: "PRECONDITION_FAILED" } });
    });
    it.each([
        ["duplicate evidence", { evidenceIds: ["v", "v"] }],
        ["empty summary", { summary: "" }],
        ["empty revision", { revisionId: "" }],
        ["empty proposal", { proposalId: "" }]
    ] as const)("rejects %s shape", (_name, overrides) => {
        expect(recordProposalRevision(proposalState(), input(overrides))).toMatchObject({
            kind: "rejected",
            error: { code: "INVALID_ARGUMENT" }
        });
    });
    it("rejects duplicate revision IDs", () => {
        const state = proposalState();
        state.proposals = [
            {
                id: "rev-1",
                proposalId: "prop",
                ordinal: 1,
                actorId: "contributor",
                agendaId: "a",
                summary: "x",
                body: "x",
                evidenceIds: ["v"],
                createdAt: 0
            }
        ];
        expect(recordProposalRevision(state, input())).toMatchObject({
            kind: "rejected",
            error: { code: "INVALID_ARGUMENT" }
        });
    });
    it.each([undefined, "rev-other"] as const)("rejects predecessor %s", (predecessor) => {
        const state = proposalState();
        if (predecessor === "rev-other")
            state.proposals = [
                {
                    id: "rev-other",
                    proposalId: "other",
                    ordinal: 1,
                    actorId: "contributor",
                    agendaId: "a",
                    summary: "x",
                    body: "x",
                    evidenceIds: ["v"],
                    createdAt: 0
                }
            ];
        const result = recordProposalRevision(
            state,
            input({ revisionId: "rev-2", supersedesRevisionId: predecessor ?? "rev-1" })
        );
        expect(result).toMatchObject({ kind: "rejected", error: { code: "PRECONDITION_FAILED" } });
    });
    it.each(["paused"] as const)("rejects %s lifecycle", (status) => {
        expect(recordProposalRevision(validState(status), input())).toMatchObject({
            kind: "rejected",
            error: { code: "INVALID_STATE" }
        });
    });
    it.each(["terminal"] as const)("rejects %s lifecycle as terminal", (status) => {
        expect(recordProposalRevision(validState(status), input())).toMatchObject({
            kind: "rejected",
            error: { code: "MEETING_TERMINAL" }
        });
    });
    it("keeps authorization and shape ahead of lifecycle", () => {
        expect(
            recordProposalRevision(
                validState("paused"),
                input({ actor: { kind: "identity", id: "manager" } })
            )
        ).toMatchObject({ error: { code: "UNAUTHORIZED" } });
        expect(
            recordProposalRevision(validState("paused"), input({ revisionId: "" }))
        ).toMatchObject({ error: { code: "INVALID_ARGUMENT" } });
    });
});
