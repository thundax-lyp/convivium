import { DomainError, invalidStateTransition } from "./errors.js";
import {
    applyCompletionClaims,
    isObjectiveSatisfied,
    judgeTurnCompletion,
    type ApplyCompletionClaimsContext
} from "./completion.js";
import { cancelNonTerminalMeetingTasks, queueMeetingTasks } from "./meeting-task.js";
import { completedTaskSnapshots, consumeHandRaise } from "./hand-raise.js";
import {
    planManagerTurn,
    planRoundRobinTurn,
    type ManagerPlanIds,
    type ManagerPlanInput
} from "./planning.js";
import type {
    AttemptStatus,
    AttemptTransitionContext,
    ArchiveInput,
    ArchiveRecord,
    CompletionFact,
    DomainEffect,
    DomainEventType,
    MeetingState,
    MeetingStatus,
    MeetingTurn,
    ManagerPlanningAttempt,
    ManagerAttemptTransitionContext,
    SpeakerAttempt,
    SpeakerSubmissionContext,
    SpeakerStep,
    StepStatus,
    TransitionContext,
    TransitionResult,
    TurnStatus
} from "./model.js";

export interface StartManagerPlanningContext {
    meetingId: string;
    planningAttemptId: string;
    deliveryId: string;
    reason: ManagerPlanningAttempt["reason"];
    now: number;
}

export interface SubmitManagerPlanContext {
    meetingId: string;
    planningAttemptId: string;
    deliveryId: string;
    observedMeetingVersion: number;
    dispatchableParticipantIds: readonly string[];
    now: number;
}

export interface SubmitSpeakerAdvanceContext extends SpeakerSubmissionContext {
    now: number;
    nextPlanningAttemptId: string;
    nextPlanningDeliveryId: string;
    completion?: Omit<ApplyCompletionClaimsContext, "participantId" | "now">;
}

const meetingTransitions: Readonly<Record<MeetingStatus, readonly MeetingStatus[]>> = {
    created: ["running", "paused", "cancelled", "failed"],
    running: [
        "waiting",
        "paused",
        "converging",
        "completed",
        "partial",
        "no_consensus",
        "cancelled",
        "failed"
    ],
    waiting: ["running", "paused", "completed", "partial", "no_consensus", "cancelled", "failed"],
    paused: ["running", "waiting", "completed", "partial", "no_consensus", "cancelled", "failed"],
    converging: ["running", "completed", "partial", "no_consensus", "cancelled", "failed"],
    completed: ["archiving"],
    partial: ["archiving"],
    no_consensus: ["archiving"],
    cancelled: ["archiving"],
    failed: ["archiving"],
    archiving: ["archived"],
    archived: []
};

const turnTransitions: Readonly<Record<TurnStatus, readonly TurnStatus[]>> = {
    planned: ["running", "cancelled", "failed"],
    running: ["completed", "truncated", "cancelled", "failed"],
    completed: [],
    truncated: [],
    cancelled: [],
    failed: []
};

const stepTransitions: Readonly<Record<StepStatus, readonly StepStatus[]>> = {
    pending: ["assigned", "skipped"],
    assigned: ["running", "revoked", "failed"],
    running: ["submitted", "revoked", "failed"],
    submitted: [],
    skipped: [],
    revoked: [],
    failed: []
};

const attemptTransitions: Readonly<Record<AttemptStatus, readonly AttemptStatus[]>> = {
    assigned: ["running", "revoked", "failed"],
    running: ["submitted", "revoked", "failed"],
    submitted: [],
    revoked: [],
    failed: []
};

const managerAttemptTransitions: Readonly<
    Record<ManagerPlanningAttempt["status"], readonly ManagerPlanningAttempt["status"][]>
> = {
    pending: ["running", "revoked", "failed"],
    running: ["submitted", "revoked", "failed"],
    submitted: [],
    revoked: [],
    failed: []
};

function event(type: DomainEventType, payload: Record<string, unknown>): DomainEffect {
    return { events: [{ type, payload }] };
}

function meetingEventType(from: MeetingStatus, to: MeetingStatus): DomainEventType {
    if (to === "paused") return "meeting.paused";
    if (to === "waiting") return "meeting.waiting";
    if (to === "running") {
        if (from === "created") return "meeting.started";
        return from === "paused" ? "meeting.resumed" : "meeting.replanned";
    }
    if (to === "converging") return "meeting.replanned";
    if (["completed", "partial", "no_consensus", "cancelled", "failed"].includes(to))
        return "meeting.ended";
    if (to === "archiving") return "meeting.archiving";
    if (to === "archived") return "meeting.archived";
    return "meeting.created";
}

function turnEventType(to: TurnStatus): DomainEventType {
    return to === "running" ? "turn.started" : (`turn.${to}` as DomainEventType);
}

function stepEventType(to: StepStatus): DomainEventType {
    if (to === "assigned") return "speaker.assigned";
    if (to === "running") return "speaker.started";
    return `speaker.${to}` as DomainEventType;
}

function attemptEventType(to: AttemptStatus): DomainEventType {
    return to === "running"
        ? "speaker_attempt.started"
        : (`speaker_attempt.${to}` as DomainEventType);
}

function managerPlanEventType(status: ManagerPlanningAttempt["status"]): DomainEventType {
    return status === "running"
        ? "manager_plan.started"
        : (`manager_plan.${status}` as DomainEventType);
}

function isArchiveInput(archive: TransitionContext["archive"]): archive is ArchiveInput {
    return Boolean(archive && "package" in archive);
}

function revokeActiveAttempts(
    state: MeetingState,
    emitTurnLifecycleEvent = false
): {
    currentTurn: MeetingTurn | undefined;
    manager: MeetingState["manager"];
    events: DomainEffect["events"];
} {
    const events: DomainEffect["events"] = [];
    const currentTurn = state.currentTurn
        ? {
              ...state.currentTurn,
              status:
                  state.currentTurn.status === "planned"
                      ? ("cancelled" as const)
                      : state.currentTurn.status === "running"
                        ? ("truncated" as const)
                        : state.currentTurn.status,
              steps: state.currentTurn.steps.map((step) => {
                  const attempt = step.attempt;
                  if (!attempt || !["assigned", "running"].includes(attempt.status)) return step;
                  events.push({
                      type: "speaker_attempt.revoked",
                      payload: { attemptId: attempt.attemptId, meetingId: state.id }
                  });
                  return {
                      ...step,
                      status: ["assigned", "running"].includes(step.status)
                          ? ("revoked" as const)
                          : step.status,
                      attempt: { ...attempt, status: "revoked" as const }
                  };
              })
          }
        : undefined;
    if (
        emitTurnLifecycleEvent &&
        state.currentTurn !== undefined &&
        (state.currentTurn.status === "planned" || state.currentTurn.status === "running")
    ) {
        events.push({
            type: state.currentTurn.status === "planned" ? "turn.cancelled" : "turn.truncated",
            payload: {
                meetingId: state.id,
                turnId: state.currentTurn.id,
                meetingVersion: state.version + 1
            }
        });
    }
    const planningAttempt = state.manager.currentPlanningAttempt;
    const activePlanning =
        planningAttempt && ["pending", "running"].includes(planningAttempt.status);
    const manager = activePlanning
        ? {
              ...state.manager,
              status: "idle" as const,
              currentPlanningAttempt: { ...planningAttempt, status: "revoked" as const }
          }
        : state.manager;
    if (activePlanning) {
        events.push({
            type: "manager_plan.revoked",
            payload: { planningAttemptId: planningAttempt.id, meetingId: state.id }
        });
    }
    return { currentTurn, manager, events };
}

function assertTransition<T extends string>(
    entityType: "meeting" | "turn" | "step" | "attempt" | "manager_attempt",
    entityId: string,
    from: T,
    to: T,
    transitions: Readonly<Record<T, readonly T[]>>,
    meetingVersion: number
): void {
    if (!transitions[from].includes(to))
        throw invalidStateTransition(entityType, entityId, from, to, meetingVersion);
}

function requireReason(context: TransitionContext, state: MeetingState, to: MeetingStatus): string {
    if (!context.reason?.trim()) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `meeting ${state.id} requires a reason for ${to}`,
            {
                entityType: "meeting",
                entityId: state.id,
                to,
                meetingVersion: state.version
            }
        );
    }
    return context.reason;
}

function sameTermination(
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

const terminationCodesByStatus: Readonly<Record<MeetingStatus, readonly string[]>> = {
    created: [],
    running: [],
    waiting: [],
    paused: [],
    converging: [],
    completed: ["objective_satisfied"],
    partial: ["captain_accepted", "max_turns", "message_limit", "time_limit"],
    no_consensus: ["no_consensus"],
    cancelled: ["user_cancelled"],
    failed: ["all_participants_unavailable", "internal_error"],
    archiving: [],
    archived: []
};

function snapshotArchive(input: ArchiveInput): ArchiveRecord {
    return {
        package: structuredClone(input.package),
        archivedAt: input.archivedAt
    };
}

function assertArchivePackageMatchesMeeting(state: MeetingState, input: ArchiveInput): void {
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
    const proposalById = new Map(state.proposals.map((proposal) => [proposal.id, proposal]));
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
            state.proposals.map((proposal) => proposal.id),
            archiveIds(archivePackage.proposals)
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
        archivePackage.proposals.some(
            (proposal) =>
                !agendaIds.has(proposal.agendaItemId) ||
                proposalById.get(proposal.id)?.revision !== proposal.revision ||
                proposalById.get(proposal.id)?.status !== proposal.status ||
                (proposalById.get(proposal.id)?.agendaItemId !== undefined &&
                    proposalById.get(proposal.id)?.agendaItemId !== proposal.agendaItemId) ||
                proposalById.get(proposal.id)?.title !== proposal.title ||
                (proposalById.get(proposal.id)?.description !== undefined &&
                    proposalById.get(proposal.id)?.description !== proposal.description) ||
                proposal.positions.some(
                    (position) =>
                        !participantIds.has(position.participantId) ||
                        position.proposalRevision !== proposal.revision ||
                        (proposalById.get(proposal.id)?.positions !== undefined &&
                            !proposalById
                                .get(proposal.id)
                                ?.positions?.some(
                                    (source) =>
                                        source.id === position.id &&
                                        source.participantId === position.participantId
                                ))
                )
        ) ||
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

function assertCompletionReady(state: MeetingState, to: MeetingStatus): void {
    if (to !== "completed") return;
    if (!isObjectiveSatisfied(state)) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `meeting ${state.id} is not ready to complete`,
            { entityType: "meeting", entityId: state.id, to, meetingVersion: state.version }
        );
    }
}

function terminationReferencesBelongToMeeting(
    state: MeetingState,
    termination: MeetingState["termination"]
): boolean {
    return Boolean(
        termination &&
        termination.decisionIds.every((id) =>
            state.decisions.some((decision) => decision.id === id)
        ) &&
        termination.unresolvedQuestionIds.every((id) =>
            state.openQuestions.some((question) => question.id === id)
        ) &&
        termination.blockingAgendaItemIds.every((id) =>
            state.agenda.some((item) => item.id === id)
        ) &&
        termination.dissentingPositionIds.every((id) =>
            state.proposals.some((proposal) =>
                proposal.positions?.some((position) => position.id === id)
            )
        )
    );
}

export function transitionMeeting(
    state: MeetingState,
    to: MeetingStatus,
    context: TransitionContext
): TransitionResult<MeetingState> {
    assertTransition("meeting", state.id, state.status, to, meetingTransitions, state.version);

    const isExecutionTerminal = [
        "completed",
        "partial",
        "no_consensus",
        "cancelled",
        "failed"
    ].includes(to);

    if (context.termination && !isExecutionTerminal) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `termination is only valid for execution terminal states`,
            {
                entityType: "meeting",
                entityId: state.id,
                to,
                meetingVersion: state.version
            }
        );
    }

    if (context.archive && to !== "archiving" && to !== "archived") {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `archive is only valid when materializing or finalizing archived`,
            {
                entityType: "meeting",
                entityId: state.id,
                to,
                meetingVersion: state.version
            }
        );
    }

    if (isExecutionTerminal) {
        if (!context.termination) {
            throw new DomainError(
                "MISSING_TERMINATION",
                `meeting ${state.id} requires termination details`,
                {
                    entityType: "meeting",
                    entityId: state.id,
                    to,
                    meetingVersion: state.version
                }
            );
        }
        if (!terminationCodesByStatus[to].includes(context.termination.code)) {
            throw new DomainError(
                "INVALID_ENTITY_STATE",
                `termination code ${context.termination.code} does not match ${to}`,
                { entityType: "meeting", entityId: state.id, to, meetingVersion: state.version }
            );
        }
        if (!terminationReferencesBelongToMeeting(state, context.termination)) {
            throw new DomainError(
                "INVALID_ENTITY_STATE",
                `termination references facts outside meeting ${state.id}`,
                { entityType: "meeting", entityId: state.id, to, meetingVersion: state.version }
            );
        }
        assertCompletionReady(state, to);
    }

    if (to === "paused") {
        requireReason(context, state, to);
        if (!context.pause) {
            throw new DomainError(
                "INVALID_ENTITY_STATE",
                `meeting ${state.id} requires pause actor metadata`,
                { entityType: "meeting", entityId: state.id, to, meetingVersion: state.version }
            );
        }
    }
    const pause = context.pause;

    if (
        to === "archiving" &&
        (!isArchiveInput(context.archive) || context.archive.archivedAt !== undefined)
    ) {
        throw new DomainError(
            "MISSING_ARCHIVE",
            `meeting ${state.id} requires a materialized archive`,
            { entityType: "meeting", entityId: state.id, to, meetingVersion: state.version }
        );
    }
    if (to === "archiving" && isArchiveInput(context.archive)) {
        assertArchivePackageMatchesMeeting(state, context.archive);
    }

    if (
        to === "archived" &&
        (!state.archive?.package || context.archive?.archivedAt === undefined)
    ) {
        throw new DomainError(
            "MISSING_ARCHIVE",
            `meeting ${state.id} requires a materialized archive`,
            {
                entityType: "meeting",
                entityId: state.id,
                to,
                meetingVersion: state.version
            }
        );
    }

    if (to === "archived") {
        const archivePackage = isArchiveInput(context.archive)
            ? context.archive.package
            : state.archive?.package;
        if (
            archivePackage?.meetingId !== state.id ||
            archivePackage.teamId !== state.teamId ||
            !sameTermination(state.termination, archivePackage.termination)
        ) {
            throw new DomainError(
                "INVALID_ENTITY_STATE",
                `archive facts do not belong to meeting ${state.id}`,
                {
                    entityType: "meeting",
                    entityId: state.id,
                    to,
                    meetingVersion: state.version
                }
            );
        }
    }

    if (to === "waiting" && (!context.wait || !context.wait.reason.trim())) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `meeting ${state.id} requires wait metadata`,
            { entityType: "meeting", entityId: state.id, to, meetingVersion: state.version }
        );
    }
    const resumingFromPause = state.status === "paused" && (to === "running" || to === "waiting");
    const lifecycleCleanup =
        to === "paused" || to === "archiving" || isExecutionTerminal
            ? revokeActiveAttempts(state, isExecutionTerminal || to === "archiving")
            : undefined;
    const next: MeetingState = {
        ...state,
        status: to,
        version: state.version + 1,
        updatedAt: context.now,
        ...(to === "paused"
            ? {
                  pausedFromStatus: state.status as "created" | "running" | "waiting",
                  pauseReason: context.reason,
                  pausedAt: pause?.at,
                  pausedBy: pause ? { ...pause.by } : undefined
              }
            : {}),
        ...(context.termination ? { termination: structuredClone(context.termination) } : {}),
        ...(lifecycleCleanup
            ? { currentTurn: lifecycleCleanup.currentTurn, manager: lifecycleCleanup.manager }
            : {}),
        ...(resumingFromPause
            ? {
                  currentTurn: undefined,
                  manager: {
                      ...state.manager,
                      status: "idle" as const,
                      currentPlanningAttempt: undefined
                  }
              }
            : {}),
        ...(isExecutionTerminal ? { currentTurn: undefined } : {}),
        ...(to === "waiting" && context.wait
            ? { waitState: structuredClone(context.wait) }
            : { waitState: undefined }),
        ...(to === "archiving" && isArchiveInput(context.archive)
            ? { archive: snapshotArchive(context.archive) }
            : {}),
        ...(to === "archived" && state.archive?.package
            ? {
                  archive: {
                      package: state.archive.package,
                      archivedAt: context.archive?.archivedAt
                  }
              }
            : {})
    };

    return {
        state: next,
        effect: {
            events: [
                {
                    type: meetingEventType(state.status, to),
                    payload: {
                        meetingId: state.id,
                        from: state.status,
                        to,
                        meetingVersion: next.version,
                        reason: context.reason
                    }
                },
                ...(lifecycleCleanup?.events ?? [])
            ]
        }
    };
}

export interface EndMeetingTransitionContext {
    meetingId: string;
    captainBinding: string;
    outcome: "completed" | "partial" | "no_consensus" | "cancelled";
    reason: string;
    acceptedDecisionIds: readonly string[];
    deferredAgendaItemIds: readonly string[];
    waivers: readonly {
        subjectId: string;
        kind: "required_review" | "agenda_item";
        reason: string;
    }[];
    now: number;
    factId: (index: number) => string;
}

const executionTerminalStatuses: readonly MeetingStatus[] = [
    "completed",
    "partial",
    "no_consensus",
    "cancelled",
    "failed",
    "archiving",
    "archived"
];

export function endMeeting(
    state: MeetingState,
    context: EndMeetingTransitionContext
): TransitionResult<MeetingState> {
    if (context.meetingId !== state.id) {
        throw new DomainError("INVALID_ENTITY_STATE", "end command targets another meeting", {
            entityType: "meeting",
            entityId: context.meetingId,
            meetingVersion: state.version
        });
    }
    if (executionTerminalStatuses.includes(state.status)) {
        throw new DomainError("IMMUTABLE_MEETING", `meeting ${state.id} is immutable`, {
            entityType: "meeting",
            entityId: state.id,
            meetingVersion: state.version
        });
    }
    if (!context.reason.trim()) {
        throw new DomainError("INVALID_ENTITY_STATE", "end command requires a reason", {
            entityType: "meeting",
            entityId: state.id,
            meetingVersion: state.version
        });
    }
    if (
        new Set(context.acceptedDecisionIds).size !== context.acceptedDecisionIds.length ||
        context.acceptedDecisionIds.some(
            (id) =>
                !state.decisions.some(
                    (decision) => decision.id === id && decision.status === "accepted"
                )
        )
    ) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            "end command references an invalid decision",
            {
                entityType: "meeting",
                entityId: state.id,
                meetingVersion: state.version
            }
        );
    }
    if (
        new Set(context.deferredAgendaItemIds).size !== context.deferredAgendaItemIds.length ||
        context.deferredAgendaItemIds.some((id) => !state.agenda.some((item) => item.id === id))
    ) {
        throw new DomainError("INVALID_ENTITY_STATE", "end command references an invalid agenda", {
            entityType: "meeting",
            entityId: state.id,
            meetingVersion: state.version
        });
    }
    if (
        context.outcome !== "partial" &&
        (context.deferredAgendaItemIds.length > 0 || context.waivers.length > 0)
    ) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            "only a partial outcome may defer agenda or waive requirements",
            { entityType: "meeting", entityId: state.id, meetingVersion: state.version }
        );
    }

    let completionFacts = [...state.completionFacts];
    const agenda = state.agenda.map((item) =>
        context.deferredAgendaItemIds.includes(item.id)
            ? { ...item, status: "deferred" as const }
            : item
    );
    const waiverFacts: CompletionFact[] = [];
    const waiverKeys = new Set<string>();
    for (const [index, waiver] of context.waivers.entries()) {
        const key = `${waiver.kind}:${waiver.subjectId}`;
        const validSubject =
            waiver.kind === "required_review"
                ? state.objectiveContract.requiredReviewers.includes(waiver.subjectId)
                : state.agenda.some((item) => item.id === waiver.subjectId);
        if (!waiver.reason.trim() || !validSubject || waiverKeys.has(key)) {
            throw new DomainError(
                "INVALID_ENTITY_STATE",
                "end command contains an invalid waiver",
                {
                    entityType: "meeting",
                    entityId: state.id,
                    meetingVersion: state.version
                }
            );
        }
        waiverKeys.add(key);
        const waiverFact: CompletionFact = {
            id: context.factId(index),
            kind: "waiver",
            subjectId: waiver.subjectId,
            assertedBy: context.captainBinding,
            authority: "captain",
            result: "waived",
            evidenceMessageIds: [],
            taskIds: [],
            reason: waiver.reason,
            status: "active",
            createdAt: context.now
        };
        completionFacts = [
            ...completionFacts.map((existing) =>
                existing.status === "active" &&
                existing.kind === "waiver" &&
                existing.subjectId === waiver.subjectId
                    ? { ...existing, status: "superseded" as const }
                    : existing
            ),
            waiverFact
        ];
        waiverFacts.push(waiverFact);
    }

    const prepared: MeetingState = { ...state, agenda, completionFacts };
    const dissentingPositionIds = prepared.proposals.flatMap((proposal) =>
        proposal.positions
            .filter(({ position }) => ["object", "needs_revision", "abstain"].includes(position))
            .map(({ id }) => id)
    );
    const blockingAgendaItemIds = prepared.agenda
        .filter((item) => item.status === "blocked")
        .map((item) => item.id);
    const unresolvedQuestionIds = prepared.openQuestions
        .filter((question) => question.status === "open" || question.status === "deferred")
        .map((question) => question.id);
    if (
        context.outcome === "no_consensus" &&
        dissentingPositionIds.length === 0 &&
        blockingAgendaItemIds.length === 0 &&
        unresolvedQuestionIds.length === 0
    ) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            "no-consensus outcome requires unresolved or dissenting facts",
            { entityType: "meeting", entityId: state.id, meetingVersion: state.version }
        );
    }

    const code = {
        completed: "objective_satisfied",
        partial: "captain_accepted",
        no_consensus: "no_consensus",
        cancelled: "user_cancelled"
    }[context.outcome] as NonNullable<MeetingState["termination"]>["code"];
    const ended = transitionMeeting(prepared, context.outcome, {
        now: context.now,
        reason: context.reason,
        termination: {
            code,
            reason: context.reason,
            decisionIds: [...context.acceptedDecisionIds],
            unresolvedQuestionIds,
            dissentingPositionIds,
            blockingAgendaItemIds,
            finalMessage: context.reason,
            endedAt: context.now
        }
    });
    const factEvents: DomainEffect["events"] = waiverFacts.map((waiverFact) => ({
        type: "completion_fact.added",
        payload: {
            meetingId: state.id,
            completionFactId: waiverFact.id,
            kind: waiverFact.kind,
            subjectId: waiverFact.subjectId,
            meetingVersion: ended.state.version
        }
    }));
    const cancelled = cancelNonTerminalMeetingTasks(ended.state, context.now);
    const events = [...factEvents, ...ended.effect.events, ...cancelled.effect.events];
    return {
        state: { ...cancelled.state, eventSeq: state.eventSeq + events.length },
        effect: { events }
    };
}

export function startManagerPlanning(
    state: MeetingState,
    context: StartManagerPlanningContext
): TransitionResult<MeetingState> {
    if (context.meetingId !== state.id) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `planning context does not belong to meeting ${state.id}`,
            { entityType: "meeting", entityId: state.id, meetingVersion: state.version }
        );
    }
    if (state.selectionMode !== "manager") {
        throw new DomainError(
            "UNSUPPORTED_CAPABILITY",
            `meeting ${state.id} does not use manager selection`,
            { entityType: "meeting", entityId: state.id, meetingVersion: state.version }
        );
    }
    if (state.currentTurn !== undefined || state.manager.currentPlanningAttempt !== undefined) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `meeting ${state.id} already has active execution state`,
            { entityType: "meeting", entityId: state.id, meetingVersion: state.version }
        );
    }
    const continuingRunningMeeting =
        state.status === "running" && state.handRaises.some((raise) => raise.status === "pending");
    if (!continuingRunningMeeting && state.status !== "created" && state.status !== "waiting") {
        throw invalidStateTransition("meeting", state.id, state.status, "running", state.version);
    }

    const meeting = continuingRunningMeeting
        ? {
              state: {
                  ...state,
                  version: state.version + 1,
                  updatedAt: context.now
              },
              effect: { events: [] as DomainEffect["events"] }
          }
        : transitionMeeting(state, "running", {
              now: context.now,
              reason: context.reason
          });
    const planningAttempt: ManagerPlanningAttempt = {
        id: context.planningAttemptId,
        meetingId: state.id,
        observedMeetingVersion: meeting.state.version,
        reason: context.reason,
        deliveryId: context.deliveryId,
        status: "running",
        createdAt: context.now
    };
    const nextState: MeetingState = {
        ...meeting.state,
        activeAgendaItemId: meeting.state.activeAgendaItemId ?? meeting.state.agenda[0]?.id,
        agenda: meeting.state.agenda.map((item, index) =>
            index === 0 && item.status === "pending"
                ? { ...item, status: "discussing" as const }
                : item
        ),
        manager: {
            ...meeting.state.manager,
            status: "planning",
            currentPlanningAttempt: planningAttempt
        },
        replanCount: meeting.state.replanCount + 1
    };
    return {
        state: nextState,
        effect: {
            events: [
                ...meeting.effect.events,
                {
                    type: "manager_plan.started",
                    payload: {
                        meetingId: state.id,
                        planningAttemptId: planningAttempt.id,
                        deliveryId: planningAttempt.deliveryId,
                        reason: planningAttempt.reason,
                        meetingVersion: nextState.version,
                        observedMeetingVersion: planningAttempt.observedMeetingVersion
                    }
                }
            ]
        }
    };
}

export function submitManagerPlan(
    state: MeetingState,
    input: ManagerPlanInput,
    context: SubmitManagerPlanContext,
    ids: ManagerPlanIds
): TransitionResult<MeetingState> {
    const planningAttempt = state.manager.currentPlanningAttempt;
    if (
        context.meetingId !== state.id ||
        context.planningAttemptId !== planningAttempt?.id ||
        context.deliveryId !== planningAttempt?.deliveryId ||
        context.observedMeetingVersion !== state.version ||
        planningAttempt?.observedMeetingVersion !== state.version ||
        planningAttempt.status !== "running"
    ) {
        throw new DomainError(
            "STALE_MANAGER_ATTEMPT",
            `manager planning attempt is stale in meeting ${state.id}`,
            {
                entityType: "manager_attempt",
                entityId: context.planningAttemptId,
                meetingVersion: state.version
            }
        );
    }
    const activeAgenda = state.agenda.find((item) => item.id === state.activeAgendaItemId);
    const dispatchable = new Set(context.dispatchableParticipantIds);
    const unavailableRequired = (activeAgenda?.requiredParticipants ?? []).filter(
        (participantId) => !dispatchable.has(participantId)
    );
    if (unavailableRequired.length > 0) {
        const nextVersion = state.version + 1;
        const nextState: MeetingState = {
            ...state,
            status: "waiting",
            version: nextVersion,
            updatedAt: context.now,
            manager: {
                ...state.manager,
                status: "idle",
                currentPlanningAttempt: { ...planningAttempt, status: "failed" }
            },
            waitState: {
                reason: "required speaker unavailable",
                taskIds: [],
                participantIds: unavailableRequired,
                resumeAgendaItemId: state.activeAgendaItemId
            }
        };
        return {
            state: nextState,
            effect: {
                events: [
                    {
                        type: "manager_plan.failed",
                        payload: {
                            meetingId: state.id,
                            planningAttemptId: planningAttempt.id,
                            from: planningAttempt.status,
                            to: "failed",
                            meetingVersion: nextVersion,
                            reason: "required_speaker_unavailable"
                        }
                    },
                    {
                        type: "meeting.waiting",
                        payload: {
                            meetingId: state.id,
                            from: state.status,
                            to: "waiting",
                            meetingVersion: nextVersion,
                            reason: "required speaker unavailable"
                        }
                    }
                ]
            }
        };
    }

    const selectedUnavailable = input.steps
        .map((step) => step.participantId)
        .filter((participantId) => !dispatchable.has(participantId));
    if (selectedUnavailable.length > 0) {
        throw new DomainError(
            "MANAGER_PLAN_INVALID",
            `manager plan selects unavailable participant ${selectedUnavailable[0]}`,
            {
                entityType: "manager_attempt",
                entityId: planningAttempt.id,
                meetingVersion: state.version
            }
        );
    }
    const planned = planManagerTurn(state, input, ids, context.now);
    const submitted = transitionManagerAttempt(planningAttempt, "submitted", state.version, {
        attemptId: context.planningAttemptId,
        meetingId: context.meetingId,
        deliveryId: context.deliveryId
    });
    const firstStep = planned.steps[0]!;
    const firstAttempt = {
        attemptId: `${planned.id}-attempt-0`,
        participantId: firstStep.speaker,
        meetingId: state.id,
        turnId: planned.id,
        stepId: firstStep.id,
        deliveryId: `${planned.id}-delivery-0`,
        contextFromSeq: 0,
        contextThroughSeq: state.messageSeq,
        taskSnapshots: completedTaskSnapshots(state, firstStep.speaker, context.now),
        assignedAt: context.now,
        status: "running" as const,
        deliveryStatus: "pending" as const
    };
    const runningTurn: MeetingTurn = {
        ...planned,
        status: "running",
        steps: planned.steps.map((step, index) =>
            index === 0 ? { ...step, status: "running", attempt: firstAttempt } : step
        )
    };
    const selectedRaise = state.handRaises.find(
        (raise) => raise.status === "pending" && raise.participant === firstStep.speaker
    );
    const consumed =
        selectedRaise === undefined
            ? { state, effect: { events: [] } }
            : consumeHandRaise(state, selectedRaise.id);
    const nextState: MeetingState = {
        ...consumed.state,
        version: state.version + 1,
        updatedAt: context.now,
        manager: { ...state.manager, status: "idle", currentPlanningAttempt: undefined },
        currentTurn: runningTurn,
        turnSeq: runningTurn.seq,
        participants: state.participants.map((participant) =>
            participant.id === firstStep.speaker
                ? { ...participant, status: "speaking" as const }
                : participant
        )
    };
    const meetingVersion = nextState.version;
    return {
        state: nextState,
        effect: {
            events: [
                ...submitted.effect.events.map((item) => ({
                    ...item,
                    payload: { ...item.payload, meetingVersion }
                })),
                { type: "turn.planned", payload: { turnId: planned.id, meetingVersion } },
                { type: "turn.started", payload: { turnId: planned.id, meetingVersion } },
                {
                    type: "speaker.assigned",
                    payload: {
                        meetingId: state.id,
                        turnId: planned.id,
                        stepId: firstStep.id,
                        participantId: firstStep.speaker,
                        attemptId: firstAttempt.attemptId,
                        deliveryId: firstAttempt.deliveryId,
                        meetingVersion
                    }
                },
                {
                    type: "speaker.started",
                    payload: { stepId: firstStep.id, meetingVersion }
                },
                {
                    type: "speaker_attempt.started",
                    payload: { attemptId: firstAttempt.attemptId, meetingVersion }
                }
            ]
        }
    };
}

export function transitionTurn(
    turn: MeetingTurn,
    to: TurnStatus,
    meetingVersion: number
): TransitionResult<MeetingTurn> {
    assertTransition("turn", turn.id, turn.status, to, turnTransitions, meetingVersion);
    return {
        state: { ...turn, status: to },
        effect: event(turnEventType(to), {
            turnId: turn.id,
            from: turn.status,
            to,
            meetingVersion
        })
    };
}

export function transitionStep(
    step: SpeakerStep,
    to: StepStatus,
    meetingVersion: number
): TransitionResult<SpeakerStep> {
    assertTransition("step", step.id, step.status, to, stepTransitions, meetingVersion);
    return {
        state: { ...step, status: to },
        effect: event(stepEventType(to), {
            stepId: step.id,
            from: step.status,
            to,
            meetingVersion
        })
    };
}

export function transitionAttempt(
    attempt: SpeakerAttempt,
    to: AttemptStatus,
    meetingVersion: number,
    context: AttemptTransitionContext
): TransitionResult<SpeakerAttempt> {
    assertTransition(
        "attempt",
        attempt.attemptId,
        attempt.status,
        to,
        attemptTransitions,
        meetingVersion
    );
    if (
        attempt.attemptId !== context.attemptId ||
        attempt.participantId !== context.participantId ||
        attempt.meetingId !== context.meetingId ||
        attempt.turnId !== context.turnId ||
        attempt.stepId !== context.stepId ||
        attempt.deliveryId !== context.deliveryId
    ) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `attempt ${attempt.attemptId} context does not match its submission`,
            { entityType: "attempt", entityId: attempt.attemptId, meetingVersion }
        );
    }
    if (to === "submitted" && attempt.deliveryStatus === "failed") {
        throw new DomainError("INVALID_ENTITY_STATE", `failed delivery cannot be acknowledged`, {
            entityType: "attempt",
            entityId: attempt.attemptId,
            meetingVersion
        });
    }
    const acknowledged =
        to === "submitted" &&
        (attempt.deliveryStatus === "pending" || attempt.deliveryStatus === "accepted");
    return {
        state: {
            ...attempt,
            status: to,
            ...(acknowledged ? { deliveryStatus: "acknowledged" as const } : {})
        },
        effect: event(attemptEventType(to), {
            attemptId: attempt.attemptId,
            from: attempt.status,
            to,
            deliveryStatus: acknowledged ? "acknowledged" : attempt.deliveryStatus,
            meetingVersion
        })
    };
}

export function submitSpeakerAttempt(
    state: MeetingState,
    participantId: string,
    meetingVersion: number,
    context: SpeakerSubmissionContext
): TransitionResult<MeetingState> {
    if (executionTerminalStatuses.includes(state.status)) {
        throw new DomainError("IMMUTABLE_MEETING", `meeting ${state.id} is immutable`, {
            entityType: "meeting",
            entityId: state.id,
            meetingVersion: state.version
        });
    }
    const participant = state.participants.find(({ id }) => id === participantId);
    const turn = state.currentTurn;
    const step = turn?.steps[turn.currentStepIndex];
    const attempt = step?.attempt;
    if (
        meetingVersion !== state.version ||
        context.meetingId !== state.id ||
        !participant ||
        !turn ||
        turn.status !== "running" ||
        turn.agendaItemId !== context.agendaItemId ||
        !step ||
        step.status !== "running" ||
        !attempt ||
        attempt.attemptId !== context.attemptId ||
        attempt.participantId !== participantId
    ) {
        throw new DomainError(
            "STALE_ATTEMPT",
            `attempt ${context.attemptId} is not current in meeting ${state.id}`,
            { entityType: "attempt", entityId: context.attemptId, meetingVersion }
        );
    }
    if (state.transcript.some(({ id }) => id === context.message.id)) {
        throw new DomainError(
            "STALE_ATTEMPT",
            `message ${context.message.id} was already committed`,
            { entityType: "attempt", entityId: context.attemptId, meetingVersion }
        );
    }

    const attemptResult = transitionAttempt(attempt, "submitted", meetingVersion, context);
    const stepResult = transitionStep(
        { ...step, attempt: attemptResult.state },
        "submitted",
        meetingVersion
    );
    const steps = turn.steps.map((candidate, index) =>
        index === turn.currentStepIndex ? stepResult.state : candidate
    );
    const completed = steps.every(({ status }) =>
        ["submitted", "skipped", "revoked", "failed"].includes(status)
    );
    const currentTurn = {
        ...turn,
        steps,
        currentStepIndex: completed ? steps.length : turn.currentStepIndex + 1,
        ...(completed
            ? { status: "completed" as const, completedAt: context.message.createdAt }
            : {})
    };
    const message = {
        ...context.message,
        seq: state.messageSeq + 1,
        turnSeq: turn.seq,
        turnId: turn.id,
        stepId: step.id,
        attemptId: attempt.attemptId,
        speaker: participantId,
        agendaItemId: turn.agendaItemId
    };
    const events = [
        ...attemptResult.effect.events,
        ...stepResult.effect.events,
        {
            type: "message.added" as const,
            payload: {
                meetingId: state.id,
                messageId: message.id,
                attemptId: attempt.attemptId,
                meetingVersion: state.version + 1
            }
        },
        ...(completed
            ? [
                  {
                      type: "turn.completed" as const,
                      payload: {
                          turnId: turn.id,
                          meetingId: state.id,
                          meetingVersion: state.version + 1
                      }
                  },
                  {
                      type: "meeting.waiting" as const,
                      payload: {
                          meetingId: state.id,
                          from: state.status,
                          to: "waiting",
                          meetingVersion: state.version + 1,
                          reason: "turn completed"
                      }
                  }
              ]
            : [])
    ];
    return {
        state: {
            ...state,
            status: completed ? "waiting" : state.status,
            version: state.version + 1,
            updatedAt: context.message.createdAt,
            messageSeq: message.seq,
            eventSeq: state.eventSeq + events.length,
            transcript: [...state.transcript, message],
            participants: state.participants.map((candidate) =>
                candidate.id === participantId
                    ? {
                          ...candidate,
                          lastDeliveredSeq: Math.max(
                              candidate.lastDeliveredSeq,
                              attempt.contextThroughSeq
                          ),
                          lastAcknowledgedSeq: Math.max(
                              candidate.lastAcknowledgedSeq,
                              attempt.contextThroughSeq
                          ),
                          totalSpeeches: candidate.totalSpeeches + 1,
                          status: "available" as const
                      }
                    : candidate
            ),
            currentTurn,
            ...(completed
                ? {
                      waitState: {
                          reason: "turn completed",
                          taskIds: [],
                          participantIds: [],
                          resumeAgendaItemId: turn.agendaItemId
                      }
                  }
                : {})
        },
        effect: { events }
    };
}

export function submitSpeakerAndAdvanceMeeting(
    state: MeetingState,
    participantId: string,
    context: SubmitSpeakerAdvanceContext
): TransitionResult<MeetingState> {
    const speakerSubmission = submitSpeakerAttempt(state, participantId, state.version, context);
    const omittedTask = (speakerSubmission.state.meetingTasks ?? []).find(
        (task) =>
            task.status === "requested" &&
            task.participantId === participantId &&
            task.originatingSpeakerAttemptId === context.attemptId &&
            !context.message.taskIds.includes(task.meetingTaskId)
    );
    if (omittedTask !== undefined) {
        throw new DomainError(
            "INVALID_STATE_TRANSITION",
            `requested MeetingTask ${omittedTask.meetingTaskId} must be included in the originating turn submission`
        );
    }
    const completion = context.completion
        ? applyCompletionClaims(speakerSubmission.state, {
              ...context.completion,
              participantId,
              now: context.now
          })
        : undefined;
    const completedSubmission = completion
        ? {
              state: completion.state,
              effect: {
                  events: [...speakerSubmission.effect.events, ...completion.effect.events]
              }
          }
        : speakerSubmission;
    const queued = context.message.taskIds.length
        ? queueMeetingTasks(
              completedSubmission.state,
              context.message.taskIds,
              participantId,
              context.attemptId,
              context.now
          )
        : { state: completedSubmission.state, effect: { events: [] } };
    const submitted: TransitionResult<MeetingState> = {
        state: queued.state,
        effect: { events: [...completedSubmission.effect.events, ...queued.effect.events] }
    };
    const version = submitted.state.version;
    const turn = submitted.state.currentTurn;
    if (turn === undefined) return submitted;

    let nextState = submitted.state;
    let events = submitted.effect.events.filter((item) => item.type !== "meeting.waiting");
    const result = (): TransitionResult<MeetingState> => ({
        state: { ...nextState, eventSeq: state.eventSeq + events.length },
        effect: { events }
    });
    const nextStep = turn.steps[turn.currentStepIndex];
    const limitReached =
        submitted.state.turnSeq >= submitted.state.limits.maxTurns ||
        submitted.state.messageSeq >= submitted.state.limits.maxTotalMessages ||
        (submitted.state.limits.maxDurationMs !== undefined &&
            context.now - submitted.state.createdAt >= submitted.state.limits.maxDurationMs);
    const blockingTaskIds = (submitted.state.meetingTasks ?? [])
        .filter(
            (task) =>
                task.status === "queued" &&
                task.blocking &&
                task.originatingSpeakerAttemptId === context.attemptId
        )
        .map((task) => task.meetingTaskId);
    if (blockingTaskIds.length > 0 && !limitReached) {
        nextState = {
            ...submitted.state,
            status: "waiting",
            waitState: {
                reason: "blocking MeetingTask queued",
                taskIds: blockingTaskIds,
                participantIds: [participantId],
                resumeAgendaItemId: context.agendaItemId
            }
        };
        events = [
            ...events,
            {
                type: "meeting.waiting",
                payload: {
                    meetingId: state.id,
                    from: submitted.state.status,
                    to: "waiting",
                    meetingVersion: version,
                    reason: "blocking MeetingTask queued"
                }
            }
        ];
        return result();
    }
    if (turn.status === "running" && nextStep !== undefined) {
        if (!limitReached) {
            const attempt = {
                attemptId: `${turn.id}-attempt-${turn.currentStepIndex}`,
                participantId: nextStep.speaker,
                meetingId: state.id,
                turnId: turn.id,
                stepId: nextStep.id,
                deliveryId: `${turn.id}-delivery-${turn.currentStepIndex}`,
                contextFromSeq: 0,
                contextThroughSeq: submitted.state.messageSeq,
                taskSnapshots: completedTaskSnapshots(
                    submitted.state,
                    nextStep.speaker,
                    context.now
                ),
                assignedAt: context.now,
                status: "running" as const,
                deliveryStatus: "pending" as const
            };
            nextState = {
                ...submitted.state,
                currentTurn: {
                    ...turn,
                    steps: turn.steps.map((step, index) =>
                        index === turn.currentStepIndex
                            ? { ...step, status: "running" as const, attempt }
                            : step
                    )
                },
                participants: submitted.state.participants.map((participant) =>
                    participant.id === nextStep.speaker
                        ? { ...participant, status: "speaking" as const }
                        : participant
                )
            };
            events = [
                ...events,
                {
                    type: "speaker.assigned",
                    payload: {
                        meetingId: state.id,
                        turnId: turn.id,
                        stepId: nextStep.id,
                        participantId: nextStep.speaker,
                        attemptId: attempt.attemptId,
                        deliveryId: attempt.deliveryId,
                        meetingVersion: version
                    }
                },
                {
                    type: "speaker.started",
                    payload: { stepId: nextStep.id, meetingVersion: version }
                },
                {
                    type: "speaker_attempt.started",
                    payload: { attemptId: attempt.attemptId, meetingVersion: version }
                }
            ];
            return result();
        }

        const skippedSteps = turn.steps.map((step, index) =>
            index >= turn.currentStepIndex && step.status === "pending"
                ? { ...step, status: "skipped" as const }
                : step
        );
        nextState = {
            ...submitted.state,
            currentTurn: {
                ...turn,
                status: "truncated",
                currentStepIndex: skippedSteps.length,
                steps: skippedSteps,
                completedAt: context.now
            }
        };
        events = [
            ...events,
            ...skippedSteps.slice(turn.currentStepIndex).map((step) => ({
                type: "speaker.skipped" as const,
                payload: { stepId: step.id, meetingVersion: version }
            })),
            { type: "turn.truncated", payload: { turnId: turn.id, meetingVersion: version } }
        ];
    }

    if (
        nextState.currentTurn?.status !== "completed" &&
        nextState.currentTurn?.status !== "truncated"
    ) {
        return result();
    }
    const judgment = judgeTurnCompletion(nextState, context.now);
    if (judgment.kind === "completed") {
        nextState = {
            ...nextState,
            status: "converging",
            currentTurn: undefined,
            waitState: undefined
        };
        events = [
            ...events,
            {
                type: "meeting.replanned",
                payload: {
                    meetingId: state.id,
                    from: state.status,
                    to: "converging",
                    meetingVersion: version,
                    reason: judgment.reason
                }
            }
        ];
        return result();
    }
    if (judgment.kind === "partial") {
        const terminalStatus = "partial";
        const terminationCode = judgment.reason as "max_turns" | "message_limit" | "time_limit";
        const cancelled = cancelNonTerminalMeetingTasks(nextState, context.now);
        nextState = {
            ...cancelled.state,
            status: terminalStatus,
            currentTurn: undefined,
            termination: {
                code: terminationCode,
                reason: judgment.reason,
                decisionIds: [],
                unresolvedQuestionIds: nextState.openQuestions
                    .filter(
                        (question) => question.status === "open" || question.status === "deferred"
                    )
                    .map((question) => question.id),
                dissentingPositionIds: [],
                blockingAgendaItemIds: nextState.agenda
                    .filter((item) => item.status === "blocked")
                    .map((item) => item.id),
                finalMessage: judgment.reason,
                endedAt: context.now
            },
            waitState: undefined
        };
        events = [
            ...events,
            ...cancelled.effect.events,
            {
                type: "meeting.ended",
                payload: {
                    meetingId: state.id,
                    from: state.status,
                    to: terminalStatus,
                    meetingVersion: version,
                    reason: judgment.reason
                }
            }
        ];
        return result();
    }

    if (nextState.selectionMode === "round_robin") {
        const planned = planRoundRobinTurn(
            { ...nextState, currentTurn: undefined },
            {
                turnId: `turn-${nextState.turnSeq + 1}`,
                stepId: (_nextParticipantId, index) => `step-turn-${nextState.turnSeq + 1}-${index}`
            },
            context.now
        );
        const firstStep = planned.steps[0]!;
        const selectedRaise = nextState.handRaises.find(
            (raise) => raise.status === "pending" && raise.participant === firstStep.speaker
        );
        const consumed =
            selectedRaise === undefined
                ? { state: nextState, effect: { events: [] } }
                : consumeHandRaise(nextState, selectedRaise.id);
        const firstAttempt: SpeakerAttempt = {
            attemptId: `${planned.id}-attempt-0`,
            participantId: firstStep.speaker,
            meetingId: state.id,
            turnId: planned.id,
            stepId: firstStep.id,
            deliveryId: `${planned.id}-delivery-0`,
            contextFromSeq: 0,
            contextThroughSeq: nextState.messageSeq,
            taskSnapshots: completedTaskSnapshots(nextState, firstStep.speaker, context.now),
            assignedAt: context.now,
            status: "running",
            deliveryStatus: "pending"
        };
        const runningTurn: MeetingTurn = {
            ...planned,
            status: "running",
            steps: planned.steps.map((step, index) =>
                index === 0 ? { ...step, status: "running", attempt: firstAttempt } : step
            )
        };
        nextState = {
            ...consumed.state,
            currentTurn: runningTurn,
            turnSeq: runningTurn.seq,
            status: "running",
            waitState: undefined,
            manager: {
                ...nextState.manager,
                status: "idle",
                currentPlanningAttempt: undefined
            },
            participants: nextState.participants.map((participant) =>
                participant.id === firstStep.speaker
                    ? { ...participant, status: "speaking" }
                    : participant
            )
        };
        events = [
            ...events,
            { type: "turn.planned", payload: { turnId: planned.id, meetingVersion: version } },
            { type: "turn.started", payload: { turnId: planned.id, meetingVersion: version } },
            {
                type: "speaker.assigned",
                payload: {
                    meetingId: state.id,
                    turnId: planned.id,
                    stepId: firstStep.id,
                    participantId: firstStep.speaker,
                    attemptId: firstAttempt.attemptId,
                    deliveryId: firstAttempt.deliveryId,
                    meetingVersion: version
                }
            },
            {
                type: "speaker.started",
                payload: { stepId: firstStep.id, meetingVersion: version }
            },
            {
                type: "speaker_attempt.started",
                payload: { attemptId: firstAttempt.attemptId, meetingVersion: version }
            }
        ];
        return result();
    }

    const planningAttempt: ManagerPlanningAttempt = {
        id: context.nextPlanningAttemptId,
        meetingId: state.id,
        observedMeetingVersion: version,
        reason: "next_turn",
        deliveryId: context.nextPlanningDeliveryId,
        status: "running",
        createdAt: context.now
    };
    nextState = {
        ...nextState,
        currentTurn: undefined,
        status: "running",
        waitState: undefined,
        replanCount: nextState.replanCount + 1,
        manager: {
            ...nextState.manager,
            status: "planning",
            currentPlanningAttempt: planningAttempt
        }
    };
    events = [
        ...events,
        {
            type: "manager_plan.started",
            payload: {
                meetingId: state.id,
                planningAttemptId: planningAttempt.id,
                deliveryId: planningAttempt.deliveryId,
                reason: planningAttempt.reason,
                meetingVersion: version,
                observedMeetingVersion: version
            }
        }
    ];
    return result();
}

export function transitionManagerAttempt(
    attempt: ManagerPlanningAttempt,
    to: ManagerPlanningAttempt["status"],
    meetingVersion: number,
    context: ManagerAttemptTransitionContext
): TransitionResult<ManagerPlanningAttempt> {
    assertTransition(
        "manager_attempt",
        attempt.id,
        attempt.status,
        to,
        managerAttemptTransitions,
        meetingVersion
    );
    if (
        attempt.id !== context.attemptId ||
        attempt.meetingId !== context.meetingId ||
        attempt.deliveryId !== context.deliveryId ||
        (to === "submitted" && attempt.observedMeetingVersion !== meetingVersion)
    ) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `manager attempt ${attempt.id} is stale or bound to another context`,
            { entityType: "manager_attempt", entityId: attempt.id, meetingVersion }
        );
    }
    return {
        state: { ...attempt, status: to },
        effect: event(managerPlanEventType(to), {
            planningAttemptId: attempt.id,
            from: attempt.status,
            to,
            meetingVersion
        })
    };
}
