import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { transitionMeetingState } from "@/domain/meeting-state-transitions.ts";
import { abortRound } from "@/domain/transitions/round.ts";
import {
    disposeRisk,
    recordCompletionFact,
    changeCompletionFact
} from "@/domain/transitions/outcome.ts";
import { completionReadyState, completionInput } from "./outcome-fixtures.ts";
import { state } from "./meeting-state-transitions-fixtures.ts";

const captain = (id: string) => ({
    kind: "captain_user" as const,
    id: `captain_actor-${createHash("sha256")
        .update(JSON.stringify([id, "captain_actor", "captain"]))
        .digest("hex")
        .slice(0, 32)}`
});

describe("external Captain control", () => {
    it.each([
        {
            kind: "activate_agenda",
            agendaId: "missing",
            previousDisposition: "completed",
            reason: "next"
        },
        {
            kind: "dispose_agenda_candidate",
            candidateId: "missing",
            disposition: "parked",
            reason: "later"
        },
        {
            kind: "resolve_question",
            questionId: "missing",
            status: "deferred",
            rationale: "later",
            evidenceIds: ["v"]
        },
        {
            kind: "dispose_issue",
            issueId: "missing",
            status: "deferred",
            rationale: "later",
            evidenceIds: ["v"]
        }
    ])("authorizes the external user for $kind and rejects an identity", (action) => {
        const s = state();
        expect(transitionMeetingState(s, action, captain(s.id), 10, "fact")).toMatchObject({
            kind: "rejected",
            code: "NOT_FOUND"
        });
        expect(
            transitionMeetingState(s, action, { kind: "identity", id: "identity-1" }, 10, "fact")
        ).toMatchObject({ kind: "rejected", code: "UNAUTHORIZED" });
    });
    it("keeps completion facts controlled by the user outside the identity set", () => {
        const c = completionReadyState();
        c.objective.requiredOutputs.push({ id: "o2", text: "pending", status: "pending" });
        const f = recordCompletionFact(c, { ...completionInput(), actor: captain(c.id), now: 10 });
        expect(f.kind).toBe("accepted");
        if (f.kind !== "accepted") {
            return;
        }
        expect(
            changeCompletionFact(f.state, {
                factId: f.state.completionFacts[0]!.id,
                status: "revoked",
                rationale: "retract",
                actor: captain(c.id),
                now: 11
            }).kind
        ).toBe("accepted");
    });
    it("aborts rounds and disposes risk as the user, preserving contributor authority boundaries", () => {
        const s = completionReadyState();
        s.rounds[0].status = "open";
        delete s.rounds[0].publicationId;
        const aborted = abortRound(s, {
            roundId: "r",
            reason: "stop",
            actor: captain(s.id),
            now: 10
        });
        expect(aborted.kind).toBe("accepted");
        expect(
            abortRound(s, {
                roundId: "r",
                reason: "stop",
                actor: { kind: "identity", id: "contributor" },
                now: 10
            })
        ).toMatchObject({ kind: "rejected", error: { code: "UNAUTHORIZED" } });
        const risk = completionReadyState();
        risk.issues = [
            {
                id: "issue",
                actorId: "contributor",
                agendaId: "a",
                description: "risk",
                riskLevel: "medium",
                classification: "blocking",
                affectedOutputIds: ["o"],
                affectedCriterionIds: [],
                affectedConstraintIds: [],
                requiresEvidenceReview: true,
                blocking: true,
                status: "open",
                rationale: "why"
            }
        ];
        expect(
            disposeRisk(risk, {
                dispositionId: "risk",
                issueId: "issue",
                action: "accept",
                scope: "current",
                rationale: "bounded",
                evidenceIds: ["v"],
                actor: captain(risk.id),
                now: 10
            }).kind
        ).toBe("accepted");
    });
});
