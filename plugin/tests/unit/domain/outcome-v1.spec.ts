import { describe, expect, it } from "vitest";
import { recordProposalRevisionV1 } from "@/domain/transitions/outcome-v1.js";
import type { MeetingState } from "@/domain/meeting-state-v1.js";

describe("outcome proposal revisions", () => {
    it("rejects an invalid snapshot without changing its reference", () => {
        const state = {} as MeetingState;
        const result = recordProposalRevisionV1(state, {
            revisionId: "r1",
            proposalId: "p1",
            agendaId: "a1",
            summary: "s",
            body: "b",
            evidenceIds: ["e1"],
            actor: { kind: "identity", id: "i1" },
            now: 1
        });
        expect(result.kind).toBe("rejected");
        expect(result.state).toBe(state);
    });
});
