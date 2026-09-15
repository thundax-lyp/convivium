import { DomainError } from "@/domain/errors.js";
import type { DomainCompletionClaims } from "@/domain/completion.js";
import type {
    ContributionActor,
    DomainContributionCommand,
    ContributionTask
} from "@/domain/contribution.js";
import { assertContributionEvidenceMessages } from "@/domain/contribution.js";
import { contributionWorkComplete } from "@/domain/contribution.js";
import { isObjectiveSatisfied } from "@/domain/completion.js";
import { blockingPositions, currentProposals } from "@/domain/proposal-state.js";
import { transitionMeeting } from "./meeting.js";
import { executionTerminalStatuses } from "./termination.js";
import type { MeetingState, TransitionResult } from "@/domain/model.js";
import { applyPublicSubmission, assertPublicMinutes } from "./public-submission.js";

export interface ContributionTransitionContext {
    now: number;
    actor: ContributionActor;
    newContributionId: string;
    newEvidenceId: string;
    completionFactId: (kind: string, index: number) => string;
}

export function transitionContributionLifecycle(
    state: MeetingState,
    action: "pause" | "resume" | "end" | "recover" | "tick",
    now: number
): TransitionResult<MeetingState> {
    if (state.contributions === undefined) return { state, effect: { events: [] } };
    if (action === "recover") {
        if (!["running", "waiting"].includes(state.status))
            return { state, effect: { events: [] } };
        const checked = transitionContributionLifecycle(state, "tick", now);
        if (executionTerminalStatuses.includes(checked.state.status)) return checked;
        const contributions = {
            ...checked.state.contributions!,
            tasks: { ...checked.state.contributions!.tasks }
        };
        const events = [...checked.effect.events];
        for (const task of Object.values(contributions.tasks)) {
            if (!activeContribution(task)) continue;
            const next = { ...task, generation: task.generation + 1, updatedAt: now };
            contributions.tasks[task.id] = next;
            events.push({
                type: "contribution.controlled",
                payload: {
                    contributionId: task.id,
                    generation: next.generation,
                    actor: "runtime",
                    at: now,
                    action: "resume",
                    reason: "runtime_recovery"
                }
            });
        }
        if (
            contributions.managerDeadlineAt > now &&
            !events.some((event) => event.type === "contribution.manager_notified")
        ) {
            contributions.managerNoticeSeq += 1;
            events.push({
                type: "contribution.manager_notified",
                payload: {
                    noticeSeq: contributions.managerNoticeSeq,
                    contextThroughSeq: checked.state.messageSeq,
                    actor: "runtime",
                    at: now
                }
            });
        }
        return events.length === 0
            ? checked
            : {
                  state: {
                      ...checked.state,
                      contributions,
                      version: state.version + 1,
                      updatedAt: now,
                      eventSeq: state.eventSeq + events.length
                  },
                  effect: { events }
              };
    }
    if (action === "tick" || action === "resume") {
        if (action === "tick" && !["running", "waiting"].includes(state.status))
            return { state, effect: { events: [] } };
        const progress = evaluateContributionProgress(state, now);
        if (executionTerminalStatuses.includes(progress.state.status)) return progress;
        if (action === "tick") {
            let next = progress.state;
            const events = [...progress.effect.events];
            for (const task of Object.values(next.contributions!.tasks)) {
                if (!activeContribution(task) || task.deadlineAt > now) continue;
                const stage =
                    task.phase === "published"
                        ? "evidence"
                        : task.phase === "boundary_review"
                          ? "boundary"
                          : "prepare";
                const tasks = {
                    ...next.contributions!.tasks,
                    [task.id]: {
                        ...task,
                        generation: task.generation + 1,
                        updatedAt: now,
                        reason: "deadline_expired",
                        ...(task.phase === "published"
                            ? { reviewStatus: "captain_action" as const }
                            : { phase: "captain_action" as const })
                    }
                };
                next = { ...next, contributions: { ...next.contributions!, tasks } };
                events.push({
                    type: "contribution.expired",
                    payload: {
                        contributionId: task.id,
                        generation: task.generation + 1,
                        actor: "runtime",
                        at: now,
                        stage
                    }
                });
            }
            if (events.some((event) => event.type === "contribution.expired")) {
                const notice = notifyContributionManager(next, now);
                next = notice.state;
                events.push(...notice.effect.events);
            } else if (
                !Object.values(next.contributions!.tasks).some(activeContribution) &&
                next.contributions!.managerDeadlineAt <= now &&
                !(next.status === "waiting" && next.waitState?.reason === "captain_action")
            ) {
                const waiting = contributionWaiting(next, now);
                next = waiting.state;
                events.push(...waiting.effect.events);
            }
            return events.length === 0
                ? { state, effect: { events: [] } }
                : {
                      state: {
                          ...next,
                          version: state.version + 1,
                          updatedAt: now,
                          eventSeq: state.eventSeq + events.length
                      },
                      effect: { events }
                  };
        }
        state = progress.state;
        const resumed = resumeContributionStages(state, now);
        return {
            state: resumed.state,
            effect: { events: [...progress.effect.events, ...resumed.effect.events] }
        };
    }
    if (action === "pause") {
        const tasks = { ...state.contributions.tasks };
        const events: TransitionResult<MeetingState>["effect"]["events"] = [];
        for (const task of Object.values(tasks)) {
            if (!activeContribution(task)) continue;
            tasks[task.id] = {
                ...task,
                generation: task.generation + 1,
                pausedRemainingMs: Math.max(0, task.deadlineAt - now),
                updatedAt: now
            };
            events.push({
                type: "contribution.controlled",
                payload: {
                    contributionId: task.id,
                    generation: task.generation + 1,
                    actor: "runtime",
                    at: now,
                    action: "pause",
                    reason: "meeting_paused"
                }
            });
        }
        return {
            state: {
                ...state,
                contributions: {
                    ...state.contributions,
                    tasks,
                    managerPausedRemainingMs: Math.max(
                        0,
                        state.contributions.managerDeadlineAt - now
                    )
                }
            },
            effect: { events }
        };
    }
    const tasks = { ...state.contributions.tasks };
    const events: TransitionResult<MeetingState>["effect"]["events"] = [];
    for (const task of Object.values(tasks)) {
        if (
            task.phase === "cancelled" ||
            (task.phase === "published" &&
                !["pending", "captain_action"].includes(task.reviewStatus))
        )
            continue;
        const next: ContributionTask = {
            ...task,
            generation: task.generation + 1,
            updatedAt: now,
            reason: "meeting_ended",
            ...(task.phase === "published"
                ? { reviewStatus: "captain_action" as const }
                : { phase: "cancelled" as const })
        };
        delete next.pausedRemainingMs;
        tasks[task.id] = next;
        events.push({
            type: "contribution.controlled",
            payload: {
                contributionId: task.id,
                generation: next.generation,
                actor: "runtime",
                at: now,
                action: "end",
                reason: "meeting_ended"
            }
        });
    }
    return {
        state: { ...state, contributions: { ...state.contributions, tasks } },
        effect: { events }
    };
}

function activeContribution(task: ContributionTask): boolean {
    return (
        ["preparing", "returned", "boundary_review"].includes(task.phase) ||
        (task.phase === "published" && task.reviewStatus === "pending")
    );
}

function unfinishedResearch(task: ContributionTask): boolean {
    return (
        task.phase !== "cancelled" &&
        (task.phase !== "published" || ["pending", "captain_action"].includes(task.reviewStatus))
    );
}

function pendingReviewFor(state: MeetingState, participantId: string): boolean {
    return (
        state.contributions?.reviewerId === participantId &&
        Object.values(state.contributions.tasks).some(
            (task) =>
                task.phase === "published" &&
                ["pending", "captain_action"].includes(task.reviewStatus)
        )
    );
}

function reviewerResearchActive(state: MeetingState): boolean {
    return Object.values(state.contributions!.tasks).some(
        (task) => task.participantId === state.contributions!.reviewerId && unfinishedResearch(task)
    );
}

function readableEvidence(state: MeetingState, participantId: string, key: string): boolean {
    const evidence = state.contributions!.evidence[key];
    if (evidence === undefined) return false;
    if (evidence.submittedBy === participantId) return true;
    const visible = new Set<string>();
    const visit = (candidate: string): void => {
        if (visible.has(candidate)) return;
        visible.add(candidate);
        state.contributions!.evidence[candidate]?.code?.patchEvidenceKeys.forEach(visit);
    };
    for (const task of Object.values(state.contributions!.tasks)) {
        if (task.phase !== "published") continue;
        task.drafts[String(task.currentDraftRevision)]?.citations.forEach((citation) =>
            visit(citation.evidenceKey)
        );
    }
    return visible.has(key);
}

function assertReadableEvidenceClosure(
    state: MeetingState,
    participantId: string,
    key: string,
    reviewerId?: string
): void {
    const visited = new Set<string>();
    const visit = (candidate: string): void => {
        if (visited.has(candidate)) return;
        visited.add(candidate);
        if (!readableEvidence(state, participantId, candidate))
            throw new DomainError(
                "UNAUTHORIZED_CALLER",
                "Contribution evidence is not available to this caller."
            );
        if (state.contributions!.evidence[candidate]!.submittedBy === reviewerId)
            throw new DomainError(
                "INVALID_STATE_TRANSITION",
                "Reviewer cannot audit their own evidence."
            );
        state.contributions!.evidence[candidate]!.code?.patchEvidenceKeys.forEach(visit);
    };
    visit(key);
}

function notifyContributionManager(
    state: MeetingState,
    now: number
): TransitionResult<MeetingState> {
    const noticeSeq = state.contributions!.managerNoticeSeq + 1;
    return {
        state: {
            ...state,
            contributions: {
                ...state.contributions!,
                managerNoticeSeq: noticeSeq,
                managerDeadlineAt: now + 600_000
            }
        },
        effect: {
            events: [
                {
                    type: "contribution.manager_notified",
                    payload: {
                        noticeSeq,
                        contextThroughSeq: state.messageSeq,
                        actor: "runtime",
                        at: now
                    }
                }
            ]
        }
    };
}

function contributionWaiting(state: MeetingState, now: number): TransitionResult<MeetingState> {
    if (state.status === "waiting" && state.waitState?.reason === "captain_action")
        return { state, effect: { events: [] } };
    if (state.status === "waiting") {
        return {
            state: {
                ...state,
                version: state.version + 1,
                updatedAt: now,
                waitState: {
                    reason: "captain_action",
                    waitingSince: now,
                    taskIds: [],
                    participantIds: [],
                    ...(state.activeAgendaItemId === undefined
                        ? {}
                        : { resumeAgendaItemId: state.activeAgendaItemId })
                }
            },
            effect: {
                events: [
                    {
                        type: "meeting.waiting",
                        payload: {
                            meetingId: state.id,
                            from: "waiting",
                            to: "waiting",
                            meetingVersion: state.version + 1,
                            reason: "captain_action"
                        }
                    }
                ]
            }
        };
    }
    return transitionMeeting(state, "waiting", {
        now,
        wait: {
            reason: "captain_action",
            waitingSince: now,
            taskIds: [],
            participantIds: [],
            ...(state.activeAgendaItemId === undefined
                ? {}
                : { resumeAgendaItemId: state.activeAgendaItemId })
        }
    });
}

function resumeContributionStages(
    state: MeetingState,
    now: number
): TransitionResult<MeetingState> {
    const contributions = { ...state.contributions!, tasks: { ...state.contributions!.tasks } };
    const events: TransitionResult<MeetingState>["effect"]["events"] = [];
    for (const task of Object.values(contributions.tasks)) {
        if (!activeContribution(task)) continue;
        const next = {
            ...task,
            generation: task.generation + 1,
            deadlineAt: now + (task.pausedRemainingMs ?? Math.max(0, task.deadlineAt - now)),
            updatedAt: now
        };
        delete next.pausedRemainingMs;
        contributions.tasks[task.id] = next;
        events.push({
            type: "contribution.controlled",
            payload: {
                contributionId: task.id,
                generation: next.generation,
                actor: "runtime",
                at: now,
                action: "resume",
                reason: "meeting_resumed"
            }
        });
    }
    contributions.managerDeadlineAt =
        now +
        (contributions.managerPausedRemainingMs ??
            Math.max(0, contributions.managerDeadlineAt - now));
    delete contributions.managerPausedRemainingMs;
    const notice = notifyContributionManager({ ...state, contributions }, now);
    notice.state.contributions!.managerDeadlineAt = contributions.managerDeadlineAt;
    return { state: notice.state, effect: { events: [...events, ...notice.effect.events] } };
}

export function failContributionDelivery(
    state: MeetingState,
    input: (
        | { kind: "task"; contributionId: string; generation: number }
        | { kind: "manager"; noticeSeq: number }
    ) & { reason: string; now: number }
): TransitionResult<MeetingState> {
    if (state.contributions === undefined || !["running", "waiting"].includes(state.status))
        return { state, effect: { events: [] } };
    if (input.kind === "manager")
        return input.noticeSeq === state.contributions.managerNoticeSeq
            ? contributionWaiting(state, input.now)
            : { state, effect: { events: [] } };
    const task = state.contributions.tasks[input.contributionId];
    if (task === undefined || task.generation !== input.generation || !activeContribution(task))
        return { state, effect: { events: [] } };
    const next = {
        ...task,
        generation: task.generation + 1,
        updatedAt: input.now,
        reason: input.reason,
        ...(task.phase === "published"
            ? { reviewStatus: "captain_action" as const }
            : { phase: "captain_action" as const })
    };
    const notice = notifyContributionManager(
        {
            ...state,
            contributions: {
                ...state.contributions,
                tasks: { ...state.contributions.tasks, [task.id]: next }
            }
        },
        input.now
    );
    const events = [
        {
            type: "contribution.controlled" as const,
            payload: {
                contributionId: task.id,
                generation: next.generation,
                actor: "runtime",
                at: input.now,
                action: "delivery_failed",
                reason: input.reason
            }
        },
        ...notice.effect.events
    ];
    return {
        state: {
            ...notice.state,
            version: state.version + 1,
            updatedAt: input.now,
            eventSeq: state.eventSeq + events.length
        },
        effect: { events }
    };
}

export function evaluateContributionProgress(
    state: MeetingState,
    now: number
): TransitionResult<MeetingState> {
    if (
        state.contributions === undefined ||
        state.status === "created" ||
        state.status === "paused" ||
        executionTerminalStatuses.includes(state.status)
    )
        return { state, effect: { events: [] } };
    const code =
        isObjectiveSatisfied(state) && contributionWorkComplete(state)
            ? "objective_satisfied"
            : state.messageSeq >= state.limits.maxTotalMessages
              ? "message_limit"
              : state.limits.maxDurationMs !== undefined &&
                  now - state.createdAt >= state.limits.maxDurationMs
                ? "time_limit"
                : undefined;
    if (code === undefined) {
        const current = state.agenda.find((item) => item.id === state.activeAgendaItemId);
        const next = state.agenda.find((item) => item.status === "pending");
        if (
            current === undefined ||
            !["resolved", "deferred"].includes(current.status) ||
            next === undefined ||
            Object.values(state.contributions.tasks).some(
                (task) =>
                    task.agendaItemId === current.id &&
                    task.requiredForCompletion &&
                    (task.phase !== "published" ||
                        (task.requiresEvidenceReview && task.reviewStatus !== "complete"))
            )
        )
            return { state, effect: { events: [] } };
        const tasks = { ...state.contributions.tasks };
        const events: TransitionResult<MeetingState>["effect"]["events"] = [];
        for (const task of Object.values(tasks)) {
            if (
                task.agendaItemId !== current.id ||
                task.requiredForCompletion ||
                ["published", "cancelled"].includes(task.phase)
            )
                continue;
            tasks[task.id] = {
                ...task,
                phase: "cancelled",
                generation: task.generation + 1,
                reason: "agenda_advanced",
                updatedAt: now
            };
            events.push({
                type: "contribution.controlled",
                payload: {
                    contributionId: task.id,
                    generation: task.generation + 1,
                    actor: "runtime",
                    at: now,
                    action: "cancel",
                    reason: "agenda_advanced"
                }
            });
        }
        const noticeSeq = state.contributions.managerNoticeSeq + 1;
        events.push(
            {
                type: "contribution.agenda_advanced",
                payload: {
                    fromAgendaItemId: current.id,
                    toAgendaItemId: next.id,
                    actor: "runtime",
                    at: now
                }
            },
            {
                type: "contribution.manager_notified",
                payload: {
                    noticeSeq,
                    contextThroughSeq: state.messageSeq,
                    actor: "runtime",
                    at: now
                }
            }
        );
        return {
            state: {
                ...state,
                version: state.version + 1,
                updatedAt: now,
                eventSeq: state.eventSeq + events.length,
                activeAgendaItemId: next.id,
                agenda: state.agenda.map((item) =>
                    item.id === next.id ? { ...item, status: "discussing" } : item
                ),
                contributions: {
                    ...state.contributions,
                    tasks,
                    managerNoticeSeq: noticeSeq,
                    managerDeadlineAt: now + 600_000
                }
            },
            effect: { events }
        };
    }
    return transitionMeeting(state, code === "objective_satisfied" ? "completed" : "partial", {
        now,
        reason: code,
        termination: {
            code,
            reason: code,
            finalMessage: code,
            endedAt: now,
            decisionIds: state.decisions
                .filter((v) => v.status === "accepted")
                .map((v) => v.id)
                .sort(),
            unresolvedQuestionIds: state.openQuestions
                .filter((v) => v.status === "open" || v.status === "deferred")
                .map((v) => v.id)
                .sort(),
            blockingAgendaItemIds: state.agenda
                .filter((v) => v.status === "blocked")
                .map((v) => v.id)
                .sort(),
            dissentingPositionIds: currentProposals(state)
                .flatMap((v) => blockingPositions(v).map((p) => p.id))
                .sort()
        }
    });
}

function assertCompletionEvidenceSupport(
    state: MeetingState,
    claims: DomainCompletionClaims
): void {
    for (const messageIds of [
        ...(claims.outputClaims ?? []).map((claim) => claim.evidenceMessageIds),
        ...(claims.criterionClaims ?? []).map((claim) => claim.evidenceMessageIds),
        ...(claims.agendaResolution === undefined
            ? []
            : [claims.agendaResolution.evidenceMessageIds]),
        ...(claims.review?.result === "approved" ? [claims.review.evidenceMessageIds] : [])
    ])
        assertContributionEvidenceMessages(state, messageIds);
}
export function applyContributionCommand(
    state: MeetingState,
    command: DomainContributionCommand,
    context: ContributionTransitionContext
): TransitionResult<MeetingState> {
    if (state.contributions === undefined)
        throw new DomainError("INVALID_STATE_TRANSITION", "Invalid contribution command.");
    if (!["running", "waiting"].includes(state.status))
        throw new DomainError(
            "INVALID_STATE_TRANSITION",
            "Meeting contributions are not writable."
        );
    if (command.action === "boundary_review") {
        if (context.actor.kind !== "manager")
            throw new DomainError(
                "INVALID_STATE_TRANSITION",
                "Only the Manager can review contributions."
            );
        const task = state.contributions.tasks[command.contributionId];
        const draft = task?.drafts[String(command.draftRevision)];
        if (
            task === undefined ||
            draft === undefined ||
            task.phase !== "boundary_review" ||
            task.generation !== command.generation ||
            task.currentDraftRevision !== command.draftRevision ||
            task.agendaItemId !== state.activeAgendaItemId ||
            task.deadlineAt <= context.now ||
            command.checkedThroughSeq !== state.messageSeq
        )
            throw new DomainError("STALE_ATTEMPT", "Contribution review is stale.");
        const review = {
            draftRevision: command.draftRevision,
            decision: command.decision,
            reason: command.reason,
            checkedThroughSeq: command.checkedThroughSeq,
            actor: "manager",
            reviewedAt: context.now
        };
        if (command.decision === "return") {
            const returnCount = task.returnCount + 1;
            const next = {
                ...task,
                generation: task.generation + 1,
                phase: returnCount > 2 ? ("captain_action" as const) : ("returned" as const),
                basedOnSeq: state.messageSeq,
                returnCount,
                deadlineAt: context.now + 600_000,
                updatedAt: context.now,
                reason: command.reason,
                boundaryReviews: [...task.boundaryReviews, review]
            };
            return {
                state: {
                    ...state,
                    contributions: {
                        ...state.contributions,
                        tasks: { ...state.contributions.tasks, [task.id]: next }
                    },
                    eventSeq: state.eventSeq + 1
                },
                effect: {
                    events: [
                        {
                            type: "contribution.boundary_reviewed",
                            payload: {
                                contributionId: task.id,
                                generation: task.generation,
                                draftRevision: command.draftRevision,
                                decision: "return",
                                actor: "manager",
                                at: context.now
                            }
                        }
                    ]
                }
            };
        }
        if (state.transcript.some(({ id }) => id === draft.message.id))
            throw new DomainError("STALE_ATTEMPT", "Contribution draft was already published.");
        if (task.requiresEvidenceReview && draft.citations.length === 0)
            throw new DomainError(
                "INVALID_STATE_TRANSITION",
                "Evidence-reviewed contributions require citations."
            );
        if (draft.claims.completion !== undefined)
            assertCompletionEvidenceSupport(state, draft.claims.completion);
        assertPublicMinutes(state, draft.message, 0, command.checkedThroughSeq);
        const message = {
            ...draft.message,
            seq: state.messageSeq + 1,
            contributionId: task.id,
            contributionRevision: draft.revision,
            speaker: task.participantId,
            agendaItemId: task.agendaItemId,
            createdAt: context.now
        };
        const published = applyPublicSubmission(
            {
                ...state,
                transcript: [...state.transcript, message],
                messageSeq: message.seq
            },
            task.participantId,
            {
                claims: draft.claims,
                authorizedTaskIds: [],
                completionFactId: context.completionFactId,
                agendaItemId: task.agendaItemId,
                message,
                now: context.now
            }
        );
        const next = {
            ...task,
            phase: "published" as const,
            deadlineAt: context.now + 600_000,
            updatedAt: context.now,
            messageId: message.id,
            reason: undefined,
            reviewStatus:
                task.requiresEvidenceReview && draft.citations.length > 0
                    ? ("pending" as const)
                    : ("not_required" as const),
            boundaryReviews: [...task.boundaryReviews, review]
        };
        const managerNoticeSeq = state.contributions.managerNoticeSeq + 1;
        const events = [
            {
                type: "contribution.boundary_reviewed" as const,
                payload: {
                    contributionId: task.id,
                    generation: task.generation,
                    draftRevision: command.draftRevision,
                    decision: "approve" as const,
                    actor: "manager",
                    at: context.now
                }
            },
            {
                type: "message.added" as const,
                payload: {
                    meetingId: state.id,
                    messageId: message.id,
                    meetingVersion: state.version + 1
                }
            },
            ...published.effect.events,
            {
                type: "contribution.manager_notified" as const,
                payload: {
                    noticeSeq: managerNoticeSeq,
                    contextThroughSeq: message.seq,
                    actor: "manager",
                    at: context.now
                }
            }
        ];
        return {
            state: {
                ...published.state,
                version: state.version + 1,
                updatedAt: context.now,
                eventSeq: state.eventSeq + events.length,
                contributions: {
                    ...state.contributions,
                    managerNoticeSeq,
                    managerDeadlineAt: context.now + 600_000,
                    tasks: { ...state.contributions.tasks, [task.id]: next }
                }
            },
            effect: { events }
        };
    }
    if (command.action === "evidence_review") {
        const task = state.contributions.tasks[command.contributionId];
        const draft = task?.drafts[String(command.draftRevision)];
        if (context.actor.kind !== "participant")
            throw new DomainError(
                "UNAUTHORIZED_CALLER",
                "Only the independent reviewer can review evidence."
            );
        const reviewerId = context.actor.participantId;
        if (reviewerId !== state.contributions.reviewerId)
            throw new DomainError(
                "UNAUTHORIZED_CALLER",
                "Only the independent reviewer can review evidence."
            );
        if (
            task === undefined ||
            draft === undefined ||
            task.phase !== "published" ||
            task.reviewStatus !== "pending" ||
            task.generation !== command.generation ||
            task.currentDraftRevision !== command.draftRevision ||
            task.deadlineAt <= context.now
        )
            throw new DomainError("STALE_ATTEMPT", "Contribution evidence review is stale.");
        if (task.participantId === reviewerId)
            throw new DomainError(
                "UNAUTHORIZED_CALLER",
                "Only the independent reviewer can review evidence."
            );
        const citations = new Set(
            draft.citations.map((citation) => `${citation.evidenceKey}\0${citation.claim}`)
        );
        const reviews = new Set(
            command.reviews.map((review) => `${review.evidenceKey}\0${review.claim}`)
        );
        if (
            command.reviews.length !== citations.size ||
            reviews.size !== command.reviews.length ||
            [...reviews].some((key) => !citations.has(key))
        )
            throw new DomainError(
                "INVALID_STATE_TRANSITION",
                "Evidence reviews must exactly cover contribution citations."
            );
        if (
            draft.citations.some(
                (citation) =>
                    state.contributions!.evidence[citation.evidenceKey]?.submittedBy === reviewerId
            )
        )
            throw new DomainError(
                "UNAUTHORIZED_CALLER",
                "Only the independent reviewer can review evidence."
            );
        for (const citation of draft.citations)
            assertReadableEvidenceClosure(state, reviewerId, citation.evidenceKey, reviewerId);
        const evidenceReviews = command.reviews.map((review) => ({
            ...review,
            draftRevision: command.draftRevision,
            actor: reviewerId,
            reviewedAt: context.now
        }));
        const next = {
            ...task,
            reviewStatus: "complete" as const,
            updatedAt: context.now,
            evidenceReviews: [...task.evidenceReviews, ...evidenceReviews]
        };
        const managerNoticeSeq = state.contributions.managerNoticeSeq + 1;
        return {
            state: {
                ...state,
                contributions: {
                    ...state.contributions,
                    managerNoticeSeq,
                    managerDeadlineAt: context.now + 600_000,
                    tasks: { ...state.contributions.tasks, [task.id]: next }
                },
                eventSeq: state.eventSeq + 2
            },
            effect: {
                events: [
                    {
                        type: "contribution.evidence_reviewed",
                        payload: {
                            contributionId: task.id,
                            generation: task.generation,
                            draftRevision: command.draftRevision,
                            verdicts: command.reviews.map((review) => review.verdict),
                            actor: reviewerId,
                            at: context.now
                        }
                    },
                    {
                        type: "contribution.manager_notified",
                        payload: {
                            noticeSeq: managerNoticeSeq,
                            contextThroughSeq: state.messageSeq,
                            actor: "manager",
                            at: context.now
                        }
                    }
                ]
            }
        };
    }
    if (command.action === "save_evidence" || command.action === "submit") {
        const task = state.contributions.tasks[command.contributionId];
        if (
            context.actor.kind !== "participant" ||
            context.actor.participantId !== task?.participantId ||
            task.generation !== command.generation ||
            task.deadlineAt <= context.now
        )
            throw new DomainError("STALE_ATTEMPT", "Contribution attempt is stale.");
        if (command.action === "save_evidence") {
            if (task.phase !== "preparing" && task.phase !== "returned")
                throw new DomainError(
                    "INVALID_STATE_TRANSITION",
                    "Evidence cannot be saved in this phase."
                );
            const evidenceId = command.evidenceId ?? context.newEvidenceId;
            const previous = Object.values(state.contributions.evidence).filter(
                (item) => item.evidenceId === evidenceId
            );
            if (previous.some((item) => item.submittedBy !== task.participantId))
                throw new DomainError(
                    "UNAUTHORIZED_CALLER",
                    "Only the material author can update evidence."
                );
            command.material.code?.patchEvidenceKeys.forEach((key) =>
                assertReadableEvidenceClosure(state, task.participantId, key)
            );
            const revision = previous.length + 1;
            if (command.expectedEvidenceRevision !== revision - 1)
                throw new DomainError("STALE_ATTEMPT", "Evidence revision is stale.");
            const evidence = {
                ...command.material,
                evidenceId,
                revision,
                key: `${evidenceId}:${revision}`,
                submittedBy: task.participantId,
                submittedAt: context.now
            };
            return {
                state: {
                    ...state,
                    contributions: {
                        ...state.contributions,
                        evidence: { ...state.contributions.evidence, [evidence.key]: evidence }
                    },
                    eventSeq: state.eventSeq + 1
                },
                effect: {
                    events: [
                        {
                            type: "contribution.evidence_saved",
                            payload: {
                                contributionId: task.id,
                                generation: task.generation,
                                evidenceKey: evidence.key,
                                actor: task.participantId,
                                at: context.now
                            }
                        }
                    ]
                }
            };
        }
        if (
            (task.phase !== "preparing" && task.phase !== "returned") ||
            task.currentDraftRevision !== command.expectedDraftRevision ||
            command.draft.revision !== command.expectedDraftRevision + 1
        )
            throw new DomainError("STALE_ATTEMPT", "Draft revision is stale.");
        if (
            command.draft.basedOnSeq < task.basedOnSeq ||
            command.draft.basedOnSeq > state.messageSeq
        )
            throw new DomainError(
                "INVALID_STATE_TRANSITION",
                "Draft Transcript basis is out of bounds."
            );
        for (const citation of command.draft.citations) {
            assertReadableEvidenceClosure(
                state,
                task.participantId,
                citation.evidenceKey,
                task.requiresEvidenceReview ? state.contributions.reviewerId : undefined
            );
        }
        if (command.draft.claims.completion !== undefined)
            assertCompletionEvidenceSupport(state, command.draft.claims.completion);
        const draft = { ...command.draft, citations: [...command.draft.citations] };
        const next = {
            ...task,
            phase: "boundary_review" as const,
            currentDraftRevision: draft.revision,
            drafts: { ...task.drafts, [String(draft.revision)]: draft },
            deadlineAt: context.now + 600000,
            updatedAt: context.now
        };
        const managerNoticeSeq = state.contributions.managerNoticeSeq + 1;
        return {
            state: {
                ...state,
                contributions: {
                    ...state.contributions,
                    managerNoticeSeq,
                    managerDeadlineAt: context.now + 600_000,
                    tasks: { ...state.contributions.tasks, [task.id]: next }
                },
                eventSeq: state.eventSeq + 2
            },
            effect: {
                events: [
                    {
                        type: "contribution.submitted",
                        payload: {
                            contributionId: task.id,
                            generation: task.generation,
                            draftRevision: draft.revision,
                            actor: task.participantId,
                            at: context.now
                        }
                    },
                    {
                        type: "contribution.manager_notified",
                        payload: {
                            noticeSeq: managerNoticeSeq,
                            contextThroughSeq: state.messageSeq,
                            actor: task.participantId,
                            at: context.now
                        }
                    }
                ]
            }
        };
    }
    if (
        command.action === "retry" ||
        command.action === "cancel" ||
        command.action === "notify_manager"
    ) {
        if (context.actor.kind !== "captain" && context.actor.kind !== "local_host")
            throw new DomainError(
                "UNAUTHORIZED_CALLER",
                "Only the Captain or local host can control contributions."
            );
        if (!command.reason.trim())
            throw new DomainError("INVALID_ARGUMENT", "Contribution control reason is required.");
        if (command.action === "notify_manager") {
            if (state.status !== "running" && state.status !== "waiting")
                throw new DomainError(
                    "INVALID_STATE_TRANSITION",
                    "Manager cannot be notified now."
                );
            const managerNoticeSeq = state.contributions.managerNoticeSeq + 1;
            return {
                state: {
                    ...state,
                    status: state.status === "waiting" ? "running" : state.status,
                    updatedAt: context.now,
                    contributions: {
                        ...state.contributions,
                        managerNoticeSeq,
                        managerDeadlineAt: context.now + 600_000
                    },
                    eventSeq: state.eventSeq + 1
                },
                effect: {
                    events: [
                        {
                            type: "contribution.manager_notified",
                            payload: {
                                noticeSeq: managerNoticeSeq,
                                contextThroughSeq: state.messageSeq,
                                actor: context.actor.kind,
                                at: context.now
                            }
                        }
                    ]
                }
            };
        }
        const task = state.contributions.tasks[command.contributionId];
        if (task === undefined || task.generation !== command.generation)
            throw new DomainError("STALE_ATTEMPT", "Contribution control is stale.");
        if (command.action === "cancel") {
            if (task.phase === "published")
                throw new DomainError(
                    "INVALID_STATE_TRANSITION",
                    "Published contributions cannot be cancelled."
                );
            const next = {
                ...task,
                generation: task.generation + 1,
                phase: "cancelled" as const,
                reason: command.reason,
                updatedAt: context.now
            };
            return controlledContribution(state, next, command.action, command.reason, context);
        }
        if (task.phase === "published") {
            if (task.reviewStatus !== "captain_action")
                throw new DomainError(
                    "INVALID_STATE_TRANSITION",
                    "Contribution cannot be retried."
                );
            if (reviewerResearchActive(state))
                throw new DomainError("INVALID_STATE_TRANSITION", "Reviewer has active research.");
            const next = {
                ...task,
                generation: task.generation + 1,
                reviewStatus: "pending" as const,
                deadlineAt: context.now + 600_000,
                reason: undefined,
                updatedAt: context.now
            };
            return controlledContribution(state, next, command.action, command.reason, context);
        }
        if (
            !["returned", "captain_action", "cancelled"].includes(task.phase) ||
            task.agendaItemId !== state.activeAgendaItemId ||
            pendingReviewFor(state, task.participantId) ||
            (task.requiresEvidenceReview &&
                (task.participantId === state.contributions.reviewerId ||
                    reviewerResearchActive(state))) ||
            Object.values(state.contributions.tasks).some(
                (candidate) =>
                    candidate.id !== task.id &&
                    candidate.participantId === task.participantId &&
                    unfinishedResearch(candidate)
            )
        )
            throw new DomainError("INVALID_STATE_TRANSITION", "Contribution cannot be retried.");
        const next = {
            ...task,
            generation: task.generation + 1,
            phase: "preparing" as const,
            basedOnSeq: state.messageSeq,
            returnCount: 0,
            deadlineAt: context.now + 600_000,
            reason: undefined,
            updatedAt: context.now
        };
        return controlledContribution(state, next, command.action, command.reason, context);
    }
    if (command.action !== "assign")
        throw new DomainError("INVALID_STATE_TRANSITION", "Invalid contribution command.");
    if (context.actor.kind !== "manager")
        throw new DomainError(
            "INVALID_STATE_TRANSITION",
            "Only the Manager can assign contributions."
        );
    if (
        !state.participants.some(({ id }) => id === command.participantId) ||
        state.activeAgendaItemId !== command.agendaItemId
    )
        throw new DomainError(
            "INVALID_ARGUMENT",
            "Contribution assignment does not belong to this meeting."
        );
    if (
        Object.values(state.contributions.tasks).some(
            (task) => task.participantId === command.participantId && unfinishedResearch(task)
        )
    )
        throw new DomainError(
            "INVALID_STATE_TRANSITION",
            "Participant already has an active contribution."
        );
    if (
        pendingReviewFor(state, command.participantId) ||
        (command.requiresEvidenceReview &&
            (command.participantId === state.contributions.reviewerId ||
                reviewerResearchActive(state)))
    )
        throw new DomainError(
            "INVALID_STATE_TRANSITION",
            "Reviewer research and evidence review must be independent."
        );
    const task: ContributionTask = {
        id: context.newContributionId,
        participantId: command.participantId,
        agendaItemId: command.agendaItemId,
        instruction: command.instruction,
        targetIds: [...command.targetIds],
        requiredForCompletion: command.requiredForCompletion,
        requiresEvidenceReview: command.requiresEvidenceReview,
        generation: 1,
        phase: "preparing",
        basedOnSeq: state.messageSeq,
        deadlineAt: context.now + 600000,
        createdAt: context.now,
        updatedAt: context.now,
        currentDraftRevision: 0,
        returnCount: 0,
        drafts: {},
        boundaryReviews: [],
        evidenceReviews: [],
        reviewStatus: "not_required"
    };
    return {
        state: {
            ...state,
            contributions: {
                ...state.contributions,
                managerDeadlineAt: context.now + 600_000,
                tasks: { ...state.contributions.tasks, [task.id]: task }
            },
            eventSeq: state.eventSeq + 1
        },
        effect: {
            events: [
                {
                    type: "contribution.assigned",
                    payload: {
                        contributionId: task.id,
                        generation: 1,
                        actor: "manager",
                        at: context.now
                    }
                }
            ]
        }
    };
}

function controlledContribution(
    state: MeetingState,
    task: ContributionTask,
    action: "retry" | "cancel",
    reason: string,
    context: ContributionTransitionContext
): TransitionResult<MeetingState> {
    const managerNoticeSeq = state.contributions!.managerNoticeSeq + 1;
    const events = [
        {
            type: "contribution.controlled" as const,
            payload: {
                contributionId: task.id,
                generation: task.generation,
                action,
                reason,
                actor: context.actor.kind,
                at: context.now
            }
        },
        {
            type: "contribution.manager_notified" as const,
            payload: {
                noticeSeq: managerNoticeSeq,
                contextThroughSeq: state.messageSeq,
                actor: context.actor.kind,
                at: context.now
            }
        }
    ];
    return {
        state: {
            ...state,
            updatedAt: context.now,
            contributions: {
                ...state.contributions!,
                managerNoticeSeq,
                managerDeadlineAt: context.now + 600_000,
                tasks: { ...state.contributions!.tasks, [task.id]: task }
            },
            eventSeq: state.eventSeq + events.length
        },
        effect: { events }
    };
}
