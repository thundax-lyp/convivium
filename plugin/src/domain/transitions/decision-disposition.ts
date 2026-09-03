import { DomainError } from "../errors.js";
import type { CompletionFact, MeetingState, TransitionResult } from "../model.js";
import { acceptDecisionCandidate } from "./decision-acceptance.js";

export type DisposeDecisionInput =
    | Readonly<{
          meetingId: string;
          requestId: string;
          decisionId: string;
          action: "supersede";
          replacementCandidateId: string;
          actorBinding: string;
          reason: string;
          evidenceMessageIds: readonly string[];
          now: number;
      }>
    | Readonly<{
          meetingId: string;
          requestId: string;
          decisionId: string;
          action: "revoke";
          actorBinding: string;
          reason: string;
          evidenceMessageIds: readonly string[];
          now: number;
      }>;

const invalid = (message: string) => new DomainError("INVALID_ENTITY_STATE", message);
const terminal = new Set([
    "completed",
    "partial",
    "no_consensus",
    "cancelled",
    "failed",
    "archiving",
    "archived"
]);

function validateCommon(state: MeetingState, input: DisposeDecisionInput) {
    if (input.meetingId !== state.id) throw invalid("dispose command targets another meeting");
    if (!input.requestId.trim()) throw invalid("requestId must not be empty");
    if (terminal.has(state.status)) {
        throw new DomainError(
            state.status === "archived" ? "ARCHIVED_MEETING" : "IMMUTABLE_MEETING",
            "meeting is immutable"
        );
    }
    if (!input.reason.trim()) throw invalid("disposition reason must not be empty");
    const evidence = input.evidenceMessageIds.map((id) => id.trim());
    if (
        !evidence.length ||
        evidence.some((id) => !id) ||
        new Set(evidence).size !== evidence.length ||
        evidence.some((id) => !state.transcript.some((message) => message.id === id))
    )
        throw invalid("evidence is invalid");
    const decision = state.decisions.find((item) => item.id === input.decisionId);
    if (!decision) throw invalid("decision is missing");
    if (decision.status !== "accepted") throw invalid("decision is not accepted");
    return { decision, evidence };
}

export function disposeDecision(
    state: MeetingState,
    input: DisposeDecisionInput
): TransitionResult<MeetingState> {
    const { decision, evidence } = validateCommon(state, input);
    const factId = `completion-${input.requestId}-decision-${input.action === "supersede" ? "supersession" : "revocation"}`;
    if (state.completionFacts.some((fact) => fact.id === factId))
        throw invalid("decision disposition already exists");
    const baseFact: CompletionFact = {
        id: factId,
        kind: input.action === "supersede" ? "decision_supersession" : "decision_revocation",
        subjectId: decision.id,
        assertedBy: input.actorBinding,
        authority: "captain",
        result: input.action === "supersede" ? "superseded" : "revoked",
        status: "active",
        evidenceMessageIds: evidence,
        taskIds: [],
        reason: input.reason.trim(),
        createdAt: input.now
    };
    if (input.action === "revoke") {
        return {
            state: {
                ...state,
                decisions: state.decisions.map((item) =>
                    item.id === decision.id ? { ...item, status: "revoked" as const } : item
                ),
                completionFacts: [...state.completionFacts, baseFact],
                eventSeq: state.eventSeq + 1
            },
            effect: {
                events: [
                    {
                        type: "decision.revoked",
                        payload: {
                            decisionId: decision.id,
                            completionFactId: factId,
                            actorBinding: input.actorBinding
                        }
                    }
                ]
            }
        };
    }
    const accepted = acceptDecisionCandidate(state, {
        meetingId: input.meetingId,
        decisionCandidateId: input.replacementCandidateId,
        actorBinding: input.actorBinding,
        reason: input.reason,
        evidenceMessageIds: evidence,
        now: input.now
    });
    const replacement = accepted.state.decisions.at(-1);
    if (!replacement) throw invalid("replacement decision was not created");
    return {
        state: {
            ...accepted.state,
            decisions: accepted.state.decisions.map((item) =>
                item.id === decision.id
                    ? {
                          ...item,
                          status: "superseded" as const,
                          supersededByDecisionId: replacement.id
                      }
                    : item
            ),
            completionFacts: [...accepted.state.completionFacts, baseFact],
            eventSeq: accepted.state.eventSeq + 1
        },
        effect: {
            events: [
                ...accepted.effect.events,
                {
                    type: "decision.superseded",
                    payload: {
                        decisionId: decision.id,
                        supersededByDecisionId: replacement.id,
                        completionFactId: factId,
                        actorBinding: input.actorBinding
                    }
                }
            ]
        }
    };
}
