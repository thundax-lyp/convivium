import type { ArchivePackage, MeetingState } from "../domain/model.js";

export function materializeArchivePackage(
    state: MeetingState,
    materializedAt: number
): ArchivePackage {
    if (state.termination === undefined) {
        throw new TypeError("Archive materialization requires a committed termination.");
    }
    return structuredClone({
        schemaVersion: 1 as const,
        meetingId: state.id,
        teamId: state.teamId,
        objectiveContract: state.objectiveContract,
        finalSummary: state.termination.finalMessage,
        artifactRefs: state.artifactRefs,
        acceptedDecisions: state.decisions.filter((decision) => decision.status === "accepted"),
        proposals: state.proposals,
        completionFacts: state.completionFacts,
        agenda: state.agenda,
        issues: state.issues.map(({ status, rationale, ...issue }) => ({
            ...issue,
            status,
            ...(rationale === undefined ? {} : { rationale })
        })),
        unresolvedQuestions: state.openQuestions
            .filter((question) => question.status === "open" || question.status === "deferred")
            .map(({ askedBy, agendaItemId, ...question }) => ({
                ...question,
                ...(askedBy === undefined ? {} : { askedBy }),
                ...(agendaItemId === undefined ? {} : { agendaItemId })
            })),
        parkingLot: state.agendaCandidates.map(({ id, title, reason, status }) => ({
            id,
            title,
            reason,
            status
        })),
        formalTranscript: state.transcript,
        participantProvenance: state.participants.map((participant) => ({
            participantId: participant.id,
            displayName: participant.displayName,
            ...(participant.role === undefined ? {} : { role: participant.role })
        })),
        termination: state.termination,
        endedAt: state.termination.endedAt,
        materializedAt
    });
}
