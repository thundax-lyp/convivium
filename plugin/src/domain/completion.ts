import { DomainError } from "./errors.js";
import type { CompletionFact, DomainEffect, MeetingState, TransitionResult } from "./model.js";
import { executionTerminalStatuses } from "./transitions/termination.js";

export type TurnCompletionKind = "completed" | "partial" | "continue";

export interface TurnCompletionJudgment {
    kind: TurnCompletionKind;
    reason: "objective_satisfied" | "max_turns" | "message_limit" | "time_limit" | "continue";
}

export interface DomainEvidenceClaim {
    subjectId: string;
    evidenceMessageIds: readonly string[];
    taskIds: readonly string[];
}

export interface DomainCompletionClaims {
    outputClaims?: readonly DomainEvidenceClaim[];
    criterionClaims?: readonly DomainEvidenceClaim[];
    agendaResolution?: {
        agendaItemId: string;
        resolution: string;
        evidenceMessageIds: readonly string[];
    };
    review?: {
        outputId: string;
        result: "approved" | "changes_required";
        reason: string;
        evidenceMessageIds: readonly string[];
    };
    questionResolutions?: readonly { questionId: string; answerMessageId: string }[];
    riskAcceptance?: {
        issueId: string;
        decision: "accept" | "reject";
        reason: string;
        evidenceMessageIds: readonly string[];
    };
}

export interface ApplyCompletionClaimsContext {
    participantId: string;
    claims: DomainCompletionClaims;
    authorizedTaskIds: readonly string[];
    now: number;
    factId: (kind: CompletionFact["kind"], index: number) => string;
    riskAuthority?: boolean;
    assertedBy?: string;
}

function isCaptainRiskDisposition(context: ApplyCompletionClaimsContext): boolean {
    return (
        context.riskAuthority === true &&
        context.claims.riskAcceptance !== undefined &&
        (context.claims.outputClaims?.length ?? 0) === 0 &&
        (context.claims.criterionClaims?.length ?? 0) === 0 &&
        context.claims.agendaResolution === undefined &&
        context.claims.review === undefined &&
        (context.claims.questionResolutions?.length ?? 0) === 0
    );
}

function invalidClaim(state: MeetingState, message: string): never {
    throw new DomainError("INVALID_ENTITY_STATE", message, {
        entityType: "completion_claim",
        entityId: state.id,
        meetingVersion: state.version
    });
}

function assertEvidence(
    state: MeetingState,
    evidenceMessageIds: readonly string[],
    taskIds: readonly string[],
    authorizedTaskIds: ReadonlySet<string>
): void {
    if (evidenceMessageIds.length === 0 && taskIds.length === 0) {
        invalidClaim(state, "completion claim requires evidence");
    }
    const messageIds = new Set(state.transcript.map((message) => message.id));
    if (evidenceMessageIds.some((id) => !messageIds.has(id))) {
        invalidClaim(state, "completion claim references an unknown meeting message");
    }
    if (taskIds.some((id) => !authorizedTaskIds.has(id))) {
        invalidClaim(state, "completion claim references unauthorized task evidence");
    }
}

function replaceFact(facts: readonly CompletionFact[], next: CompletionFact): CompletionFact[] {
    return [
        ...facts.map((existing) =>
            existing.status === "active" &&
            existing.kind === next.kind &&
            existing.subjectId === next.subjectId &&
            existing.assertedBy === next.assertedBy
                ? { ...existing, status: "superseded" as const }
                : existing
        ),
        next
    ];
}

function fact(
    context: ApplyCompletionClaimsContext,
    kind: CompletionFact["kind"],
    subjectId: string,
    result: CompletionFact["result"],
    evidenceMessageIds: readonly string[],
    taskIds: readonly string[],
    index: number,
    options: { authority?: string; reason?: string } = {}
): CompletionFact {
    return {
        id: context.factId(kind, index),
        kind,
        subjectId,
        assertedBy: context.assertedBy ?? context.participantId,
        ...(options.authority === undefined ? {} : { authority: options.authority }),
        result,
        evidenceMessageIds: [...evidenceMessageIds],
        taskIds: [...taskIds],
        ...(options.reason === undefined ? {} : { reason: options.reason }),
        status: "active",
        createdAt: context.now
    };
}

export function isObjectiveSatisfied(state: MeetingState): boolean {
    return (
        state.objectiveContract.requiredOutputs.every((output) => output.status === "accepted") &&
        state.objectiveContract.acceptanceCriteria.every((criterion) => criterion.satisfied) &&
        state.objectiveContract.requiredReviewers.every((reviewerId) =>
            state.completionFacts.some(
                (completionFact) =>
                    completionFact.kind === "review" &&
                    completionFact.assertedBy === reviewerId &&
                    completionFact.status === "active" &&
                    completionFact.result === "approved"
            )
        ) &&
        state.agenda.every((item) => item.status === "resolved" || item.status === "deferred") &&
        state.issues.every(
            (issue) =>
                !issue.blocking ||
                ["resolved", "deferred", "accepted_risk", "out_of_scope"].includes(issue.status)
        ) &&
        state.openQuestions.every((question) => !question.blocking || question.status !== "open")
    );
}

export function applyCompletionClaims(
    state: MeetingState,
    context: ApplyCompletionClaimsContext
): TransitionResult<MeetingState> {
    if (state.status === "archived") {
        throw new DomainError(
            "ARCHIVED_MEETING",
            "completion claims cannot modify an archived meeting"
        );
    }
    if (executionTerminalStatuses.includes(state.status)) {
        throw new DomainError(
            "IMMUTABLE_MEETING",
            "completion claims cannot modify an immutable meeting"
        );
    }
    if (
        !state.participants.some((participant) => participant.id === context.participantId) &&
        !isCaptainRiskDisposition(context)
    ) {
        invalidClaim(state, "completion claim caller is not a meeting participant");
    }

    const authorizedTaskIds = new Set(context.authorizedTaskIds);
    let completionFacts = [...state.completionFacts];
    const objectiveContract = structuredClone(state.objectiveContract);
    const agenda = state.agenda.map((item) => ({ ...item }));
    const issues = state.issues.map((issue) => ({ ...issue }));
    const openQuestions = state.openQuestions.map((question) => ({ ...question }));
    const createdFacts: CompletionFact[] = [];
    const questionEvents: DomainEffect["events"] = [];
    let factIndex = 0;

    const addFact = (next: CompletionFact) => {
        completionFacts = replaceFact(completionFacts, next);
        createdFacts.push(next);
    };

    for (const claim of context.claims.outputClaims ?? []) {
        assertEvidence(state, claim.evidenceMessageIds, claim.taskIds, authorizedTaskIds);
        const output = objectiveContract.requiredOutputs.find(({ id }) => id === claim.subjectId);
        if (output === undefined) invalidClaim(state, `unknown required output ${claim.subjectId}`);
        output.status = "accepted";
        addFact(
            fact(
                context,
                "output_evidence",
                claim.subjectId,
                "supported",
                claim.evidenceMessageIds,
                claim.taskIds,
                factIndex++
            )
        );
    }

    for (const claim of context.claims.criterionClaims ?? []) {
        assertEvidence(state, claim.evidenceMessageIds, claim.taskIds, authorizedTaskIds);
        const criterion = objectiveContract.acceptanceCriteria.find(
            ({ id }) => id === claim.subjectId
        );
        if (criterion === undefined) invalidClaim(state, `unknown criterion ${claim.subjectId}`);
        criterion.satisfied = true;
        addFact(
            fact(
                context,
                "criterion_evidence",
                claim.subjectId,
                "supported",
                claim.evidenceMessageIds,
                claim.taskIds,
                factIndex++
            )
        );
    }

    const review = context.claims.review;
    if (review !== undefined) {
        assertEvidence(state, review.evidenceMessageIds, [], authorizedTaskIds);
        const output = objectiveContract.requiredOutputs.find(({ id }) => id === review.outputId);
        if (output === undefined) invalidClaim(state, `unknown review output ${review.outputId}`);
        if (!objectiveContract.requiredReviewers.includes(context.participantId)) {
            invalidClaim(state, "completion review caller is not a required reviewer");
        }
        if (review.result === "changes_required") {
            output.status = "pending";
            completionFacts = completionFacts.map((existing) =>
                existing.status === "active" &&
                existing.kind === "output_evidence" &&
                existing.subjectId === review.outputId
                    ? { ...existing, status: "superseded" as const }
                    : existing
            );
        }
        addFact(
            fact(
                context,
                "review",
                review.outputId,
                review.result,
                review.evidenceMessageIds,
                [],
                factIndex++,
                { authority: "required_reviewer", reason: review.reason }
            )
        );
    }

    for (const claim of context.claims.questionResolutions ?? []) {
        const question = openQuestions.find(({ id }) => id === claim.questionId);
        if (question === undefined) {
            invalidClaim(state, "question resolution references an unknown question");
        }
        if (question.status !== "open" || question.answerMessageId !== undefined) {
            invalidClaim(state, "question is not open for resolution");
        }
        const answer = state.transcript.find(({ id }) => id === claim.answerMessageId);
        if (answer === undefined || answer.speaker !== context.participantId) {
            invalidClaim(state, "question resolution must reference the caller's meeting answer");
        }
        question.status = "answered";
        question.answerMessageId = claim.answerMessageId;
        questionEvents.push({
            type: "question.answered",
            payload: {
                meetingId: state.id,
                questionId: question.id,
                answerMessageId: claim.answerMessageId,
                answeredBy: context.participantId,
                meetingVersion: state.version
            }
        });
        addFact(
            fact(
                context,
                "question_resolution",
                claim.questionId,
                "resolved",
                [claim.answerMessageId],
                [],
                factIndex++
            )
        );
    }

    const agendaResolution = context.claims.agendaResolution;
    if (agendaResolution !== undefined) {
        assertEvidence(state, agendaResolution.evidenceMessageIds, [], authorizedTaskIds);
        const item = agenda.find(({ id }) => id === agendaResolution.agendaItemId);
        if (item === undefined)
            invalidClaim(state, `unknown agenda ${agendaResolution.agendaItemId}`);
        const completionIds = new Set([
            ...objectiveContract.requiredOutputs
                .filter(({ status }) => status === "accepted")
                .map(({ id }) => id),
            ...objectiveContract.acceptanceCriteria
                .filter(({ satisfied }) => satisfied)
                .map(({ id }) => id)
        ]);
        if (item.completionCriteria.some((id) => !completionIds.has(id))) {
            invalidClaim(state, "agenda completion criteria are not satisfied");
        }
        if (
            issues.some(
                (issue) =>
                    issue.agendaItemId === item.id &&
                    issue.blocking &&
                    !["resolved", "deferred", "accepted_risk", "out_of_scope"].includes(
                        issue.status
                    )
            )
        ) {
            invalidClaim(state, "agenda has an unresolved blocking issue");
        }
        item.status = "resolved";
        item.resolution = agendaResolution.resolution;
        addFact(
            fact(
                context,
                "agenda_resolution",
                item.id,
                "resolved",
                agendaResolution.evidenceMessageIds,
                [],
                factIndex++,
                { reason: agendaResolution.resolution }
            )
        );
    }

    const riskAcceptance = context.claims.riskAcceptance;
    if (riskAcceptance !== undefined) {
        assertEvidence(state, riskAcceptance.evidenceMessageIds, [], authorizedTaskIds);
        if (
            !riskAcceptance.reason.trim() ||
            new Set(riskAcceptance.evidenceMessageIds).size !==
                riskAcceptance.evidenceMessageIds.length ||
            riskAcceptance.evidenceMessageIds.some((id) => !id.trim())
        )
            invalidClaim(state, "risk disposition evidence or reason is invalid");
        const issue = issues.find(({ id }) => id === riskAcceptance.issueId);
        if (issue === undefined) invalidClaim(state, `unknown issue ${riskAcceptance.issueId}`);
        if (
            !context.riskAuthority &&
            !objectiveContract.riskAcceptanceAuthority.includes(context.participantId)
        ) {
            invalidClaim(state, "completion risk caller lacks risk acceptance authority");
        }
        if (!["open", "accepted_risk"].includes(issue.status)) {
            invalidClaim(state, "risk issue is not disposable");
        }
        const ranks = { low: 1, medium: 2, high: 3 } as const;
        if (
            issue.riskLevel === undefined ||
            ranks[issue.riskLevel] > ranks[objectiveContract.acceptableRiskLevel] ||
            issue.violatedConstraintIds.length > 0
        ) {
            invalidClaim(state, "risk exceeds the objective acceptance boundary");
        }
        completionFacts = completionFacts.map((existing) =>
            existing.kind === "risk_acceptance" &&
            existing.subjectId === issue.id &&
            existing.status === "active"
                ? { ...existing, status: "superseded" as const }
                : existing
        );
        if (riskAcceptance.decision === "accept") {
            issue.status = "accepted_risk";
            issue.disposition = "accepted_risk";
            issue.blocking = false;
            issue.rationale = riskAcceptance.reason.trim();
        } else {
            issue.status = "open";
            issue.disposition = "blocking";
            issue.blocking = true;
            issue.rationale = riskAcceptance.reason.trim();
        }
        addFact(
            fact(
                context,
                "risk_acceptance",
                issue.id,
                riskAcceptance.decision === "accept" ? "accepted" : "rejected",
                riskAcceptance.evidenceMessageIds,
                [],
                factIndex,
                {
                    authority: context.riskAuthority ? "captain" : "risk_acceptance_authority",
                    reason: riskAcceptance.reason
                }
            )
        );
    }

    const events: DomainEffect["events"] = [
        ...questionEvents,
        ...createdFacts.map((completionFact): DomainEffect["events"][number] => ({
            type: "completion_fact.added" as const,
            payload: {
                meetingId: state.id,
                completionFactId: completionFact.id,
                kind: completionFact.kind,
                subjectId: completionFact.subjectId,
                meetingVersion: state.version
            }
        }))
    ];

    return {
        state: {
            ...state,
            objectiveContract,
            agenda,
            issues,
            openQuestions,
            completionFacts,
            eventSeq: state.eventSeq + events.length
        },
        effect: { events }
    };
}

export function judgeTurnCompletion(state: MeetingState, now: number): TurnCompletionJudgment {
    if (isObjectiveSatisfied(state)) return { kind: "completed", reason: "objective_satisfied" };
    if (state.turnSeq >= state.limits.maxTurns) return { kind: "partial", reason: "max_turns" };
    if (state.messageSeq >= state.limits.maxTotalMessages)
        return { kind: "partial", reason: "message_limit" };
    if (
        state.limits.maxDurationMs !== undefined &&
        now - state.createdAt >= state.limits.maxDurationMs
    ) {
        return { kind: "partial", reason: "time_limit" };
    }
    return { kind: "continue", reason: "continue" };
}
