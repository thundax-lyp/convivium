import { DomainError } from "../errors.js";
import type { ArchiveInput, ArchiveRecord, MeetingState } from "../model.js";
import { terminationReferencesBelongToMeeting } from "./meeting-guards.js";

export function sameTermination(
    left: MeetingState["termination"],
    right: MeetingState["termination"]
): boolean {
    const sameReferences = (leftIds: readonly string[], rightIds: readonly string[]) => {
        if (leftIds.length !== rightIds.length) return false;
        const counts = new Map<string, number>();
        for (const id of leftIds) counts.set(id, (counts.get(id) ?? 0) + 1);
        for (const id of rightIds) {
            const count = counts.get(id) ?? 0;
            if (count === 0) return false;
            counts.set(id, count - 1);
        }
        return true;
    };
    return (
        left !== undefined &&
        right !== undefined &&
        left.code === right.code &&
        left.reason === right.reason &&
        sameReferences(left.decisionIds, right.decisionIds) &&
        sameReferences(left.unresolvedQuestionIds, right.unresolvedQuestionIds) &&
        sameReferences(left.dissentingPositionIds, right.dissentingPositionIds) &&
        sameReferences(left.blockingAgendaItemIds, right.blockingAgendaItemIds) &&
        left.finalMessage === right.finalMessage &&
        left.endedAt === right.endedAt
    );
}

export function snapshotArchive(input: ArchiveInput): ArchiveRecord {
    return {
        package: structuredClone(input.package),
        archivedAt: input.archivedAt
    };
}

export function assertArchivePackageMatchesMeeting(state: MeetingState, input: ArchiveInput): void {
    const archivePackage = input.package;
    if (
        archivePackage.meetingId !== state.id ||
        archivePackage.teamId !== state.teamId ||
        !sameTermination(state.termination, archivePackage.termination)
    ) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `archive facts do not belong to meeting ${state.id}`,
            {
                entityType: "meeting",
                entityId: state.id,
                to: "archiving",
                meetingVersion: state.version
            }
        );
    }
    if (!terminationReferencesBelongToMeeting(state, archivePackage.termination)) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `archive references facts outside meeting ${state.id}`,
            {
                entityType: "meeting",
                entityId: state.id,
                to: "archiving",
                meetingVersion: state.version
            }
        );
    }
    const decisionById = new Map(state.decisions.map((decision) => [decision.id, decision]));
    const agendaIds = new Set(state.agenda.map((item) => item.id));
    const issueIds = new Set(state.issues.map((issue) => issue.id));
    const questionIds = new Set(state.openQuestions.map((question) => question.id));
    const participantIds = new Set(state.participants.map((participant) => participant.id));
    const transcriptIds = new Set(state.transcript.map((message) => message.id));
    const artifactById = new Map(
        state.artifactRefs.map((artifact) => [artifact.artifactId, artifact])
    );
    const proposalKey = (proposal: { id: string; revision: number }) =>
        `${proposal.id}\0${proposal.revision}`;
    const proposalByRevision = new Map(
        state.proposals.map((proposal) => [proposalKey(proposal), proposal])
    );
    const completionSubjectIds = new Set([
        ...state.objectiveContract.requiredOutputs.map((output) => output.id),
        ...state.objectiveContract.acceptanceCriteria.map((criterion) => criterion.id),
        ...agendaIds,
        ...issueIds,
        ...state.completionFacts.map((fact) => fact.subjectId)
    ]);
    const sourceMessageById = new Map(state.transcript.map((message) => [message.id, message]));
    const sourceCompletionById = new Map(state.completionFacts.map((fact) => [fact.id, fact]));
    const archiveIds = (values: readonly { id: string }[]) => new Set(values.map(({ id }) => id));
    const containsEvery = (sourceIds: readonly string[], archivedIds: Set<string>) =>
        sourceIds.every((id) => archivedIds.has(id));
    const acceptedDecisionIds = state.decisions
        .filter((decision) => decision.status === "accepted")
        .map((decision) => decision.id);
    const unresolvedQuestionIds = state.openQuestions
        .filter((question) => question.status === "open" || question.status === "deferred")
        .map((question) => question.id);
    if (
        JSON.stringify(archivePackage.objectiveContract) !==
            JSON.stringify(state.objectiveContract) ||
        !containsEvery(
            state.artifactRefs.map((artifact) => artifact.artifactId),
            new Set(archivePackage.artifactRefs.map((artifact) => artifact.artifactId))
        ) ||
        !containsEvery(acceptedDecisionIds, archiveIds(archivePackage.acceptedDecisions)) ||
        !containsEvery(
            state.proposals.map(proposalKey),
            new Set(archivePackage.proposals.map(proposalKey))
        ) ||
        !containsEvery(
            state.completionFacts.map((fact) => fact.id),
            archiveIds(archivePackage.completionFacts)
        ) ||
        !containsEvery(
            state.agenda.map((item) => item.id),
            archiveIds(archivePackage.agenda)
        ) ||
        !containsEvery(
            state.issues.map((issue) => issue.id),
            archiveIds(archivePackage.issues)
        ) ||
        !containsEvery(unresolvedQuestionIds, archiveIds(archivePackage.unresolvedQuestions)) ||
        !containsEvery(
            state.transcript.map((message) => message.id),
            archiveIds(archivePackage.formalTranscript)
        ) ||
        !containsEvery(
            state.participants.map((participant) => participant.id),
            new Set(
                archivePackage.participantProvenance.map((participant) => participant.participantId)
            )
        ) ||
        archivePackage.artifactRefs.some((artifact) => {
            const source = artifactById.get(artifact.artifactId);
            return (
                !source ||
                source.title !== artifact.title ||
                source.version !== artifact.version ||
                source.checksum !== artifact.checksum
            );
        }) ||
        archivePackage.acceptedDecisions.some(
            (decision) =>
                (decision.agendaItemId !== undefined && !agendaIds.has(decision.agendaItemId)) ||
                !decisionById.has(decision.id) ||
                decisionById.get(decision.id)?.proposalId !== decision.proposalId ||
                decisionById.get(decision.id)?.proposalRevision !== decision.proposalRevision ||
                decisionById.get(decision.id)?.status !== decision.status ||
                (decisionById.get(decision.id)?.agendaItemId !== undefined &&
                    decisionById.get(decision.id)?.agendaItemId !== decision.agendaItemId) ||
                (decisionById.get(decision.id)?.statement !== undefined &&
                    decisionById.get(decision.id)?.statement !== decision.statement) ||
                (decisionById.get(decision.id)?.rationale !== undefined &&
                    decisionById.get(decision.id)?.rationale !== decision.rationale) ||
                (decisionById.get(decision.id)?.acceptedBy !== undefined &&
                    JSON.stringify(decisionById.get(decision.id)?.acceptedBy) !==
                        JSON.stringify(decision.acceptedBy)) ||
                (decisionById.get(decision.id)?.dissentingPositionIds !== undefined &&
                    JSON.stringify(decisionById.get(decision.id)?.dissentingPositionIds) !==
                        JSON.stringify(decision.dissentingPositionIds)) ||
                (decision.acceptedBy?.some((id) => !participantIds.has(id)) ?? false) ||
                (decision.dissentingPositionIds?.some(
                    (id) =>
                        !state.proposals.some((proposal) =>
                            proposal.positions?.some((position) => position.id === id)
                        )
                ) ??
                    false)
        ) ||
        archivePackage.proposals.some((proposal) => {
            const source = proposalByRevision.get(proposalKey(proposal));
            return (
                !source ||
                !agendaIds.has(proposal.agendaItemId) ||
                source.status !== proposal.status ||
                source.agendaItemId !== proposal.agendaItemId ||
                source.title !== proposal.title ||
                source.description !== proposal.description ||
                proposal.positions.some(
                    (position) =>
                        !participantIds.has(position.participantId) ||
                        position.proposalRevision !== proposal.revision ||
                        !source.positions.some(
                            (sourcePosition) =>
                                sourcePosition.id === position.id &&
                                sourcePosition.participantId === position.participantId
                        )
                )
            );
        }) ||
        archivePackage.completionFacts.some(
            (fact) =>
                !completionSubjectIds.has(fact.subjectId) ||
                !(
                    participantIds.has(fact.assertedBy) ||
                    (fact.authority === "captain" &&
                        fact.assertedBy.startsWith("captain:") &&
                        sourceCompletionById.get(fact.id)?.authority === "captain" &&
                        sourceCompletionById.get(fact.id)?.assertedBy === fact.assertedBy)
                ) ||
                (sourceCompletionById.get(fact.id)?.subjectId !== undefined &&
                    sourceCompletionById.get(fact.id)?.subjectId !== fact.subjectId) ||
                (sourceCompletionById.get(fact.id)?.result !== undefined &&
                    sourceCompletionById.get(fact.id)?.result !== fact.result) ||
                (sourceCompletionById.get(fact.id)?.status !== undefined &&
                    sourceCompletionById.get(fact.id)?.status !== fact.status) ||
                fact.evidenceMessageIds.some((id) => !transcriptIds.has(id))
        ) ||
        archivePackage.agenda.some(
            (item) =>
                !agendaIds.has(item.id) ||
                state.agenda.find((source) => source.id === item.id)?.status !== item.status ||
                (item.owner !== undefined && !participantIds.has(item.owner)) ||
                item.requiredParticipants.some((id) => !participantIds.has(id))
        ) ||
        archivePackage.issues.some(
            (issue) =>
                !issueIds.has(issue.id) ||
                state.issues.find((source) => source.id === issue.id)?.title !== issue.title ||
                state.issues.find((source) => source.id === issue.id)?.description !==
                    issue.description ||
                (state.issues.find((source) => source.id === issue.id)?.rationale !== undefined &&
                    state.issues.find((source) => source.id === issue.id)?.rationale !==
                        issue.rationale) ||
                (issue.ownerId !== undefined && !participantIds.has(issue.ownerId))
        ) ||
        archivePackage.unresolvedQuestions.some(
            (question) =>
                !questionIds.has(question.id) ||
                (question.agendaItemId !== undefined && !agendaIds.has(question.agendaItemId)) ||
                (question.askedBy !== undefined && !participantIds.has(question.askedBy)) ||
                state.openQuestions.find((source) => source.id === question.id)?.text !==
                    question.text ||
                state.openQuestions.find((source) => source.id === question.id)?.status !==
                    question.status ||
                (state.openQuestions.find((source) => source.id === question.id)?.askedBy !==
                    undefined &&
                    state.openQuestions.find((source) => source.id === question.id)?.askedBy !==
                        question.askedBy) ||
                (state.openQuestions.find((source) => source.id === question.id)?.agendaItemId !==
                    undefined &&
                    state.openQuestions.find((source) => source.id === question.id)
                        ?.agendaItemId !== question.agendaItemId) ||
                (question.directedTo !== undefined && !participantIds.has(question.directedTo)) ||
                (question.answerMessageId !== undefined &&
                    !transcriptIds.has(question.answerMessageId))
        ) ||
        archivePackage.formalTranscript.some((message) => {
            const source = sourceMessageById.get(message.id);
            return (
                !source ||
                !agendaIds.has(message.agendaItemId) ||
                source.seq !== message.seq ||
                source.turnId !== message.turnId ||
                source.stepId !== message.stepId ||
                source.speaker !== message.speaker ||
                source.agendaItemId !== message.agendaItemId ||
                source.content !== message.content ||
                (source.kind !== undefined && source.kind !== message.kind) ||
                (source.createdAt !== undefined && source.createdAt !== message.createdAt)
            );
        }) ||
        archivePackage.participantProvenance.some(
            (participant) => !participantIds.has(participant.participantId)
        )
    ) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `archive references facts outside meeting ${state.id}`,
            {
                entityType: "meeting",
                entityId: state.id,
                to: "archiving",
                meetingVersion: state.version
            }
        );
    }
}
