import {
    closeContributionV1,
    completeMeetingArchiveV1,
    disposeHandRaiseV1,
    endMeetingV1,
    openRoundV1,
    publishRoundV1,
    raiseHandV1,
    recommendIdentityV1,
    recordIdentityAdmissionResultV1,
    recordReviewDeliveryV1,
    startMeetingArchiveV1,
    submitEvidenceV1,
    submitReviewBatchV1,
    transitionMeetingStateV1,
    type MeetingState,
    type MeetingTransitionResultV1,
    type IdentityAdmissionResultContextV1
} from "@/domain/index.js";
import {
    MeetingCommandV1Schema,
    type MeetingActionV1,
    type MeetingCommandResultV1,
    type MeetingCommandV1
} from "@/protocol/index.js";
import { readMeetingRoleCatalogV1, type RoleCatalogPortV1 } from "@/dsh/index.js";
import type { DomainRepositoryRegistry } from "@/repository/domain/domain-repository-registry.js";
import { meetingIdFor } from "@/repository/domain/keys.js";
import { RepositoryError } from "@/repository/errors.js";
import type {
    CommandAuthorization,
    CommittedFactRecordV1,
    JsonObject,
    OutboxInput,
    SessionOwnership
} from "@/repository/types.js";
import type { Agent } from "@deepseek-ai/dsh-agent";

export const LOCAL_CONTROLLER_PRINCIPAL_ID = "local-controller";
export const RUNTIME_RECOVERY_PRINCIPAL_ID = "runtime-recovery";
export const DEADLINE_HANDLER_PRINCIPAL_ID = "deadline-handler";

export interface CallerBindingV1 {
    channel: "dsh_tool" | "loopback_remote" | "runtime_recovery" | "deadline_handler";
    principalId: string;
    sessionBindingId?: string;
}

export interface MeetingCommandExecutionContextV1 {
    caller: CallerBindingV1;
    /** Trusted Captain parent injected by the create tool; never decoded from command input. */
    captainParent?: Agent;
    archiveEffect?: { effectId: string; archiveId: string };
    identityAdmissionResult?: IdentityAdmissionResultContextV1;
}

export type CreateMeetingCommandV1 = Omit<MeetingCommandV1, "action"> & {
    action: Extract<MeetingActionV1, { kind: "create_meeting" }>;
};

export interface MeetingCreationCoordinatorV1 {
    create(
        command: CreateMeetingCommandV1,
        context: MeetingCommandExecutionContextV1,
        meetingId: string,
        now: number,
        signal: AbortSignal
    ): Promise<MeetingCommandResultV1>;
}

export interface ResolvedCallerScopeV1 {
    caller: CallerBindingV1;
    meetingId: string;
    identityId?: string;
    role: "local" | "manager" | "evidence_reviewer" | "participant" | "runtime";
    ownership?: SessionOwnership;
}

export type ResolveCallerScopeV1 = (input: {
    meetingId: string;
    caller: CallerBindingV1;
}) => Promise<ResolvedCallerScopeV1 | undefined>;

export interface MeetingCommandApplicationV1 {
    execute(
        command: MeetingCommandV1,
        context: MeetingCommandExecutionContextV1,
        signal: AbortSignal
    ): Promise<MeetingCommandResultV1>;
}

export interface MeetingCommandApplicationDependenciesV1 {
    creation: MeetingCreationCoordinatorV1;
    registry: DomainRepositoryRegistry<MeetingState>;
    ids: { nextId(kind: string): string };
    clock: { now(): number };
    resolveCallerScope: ResolveCallerScopeV1;
    catalog?: RoleCatalogPortV1;
}

class TransitionRejected extends Error {
    constructor(
        readonly code: string,
        message: string,
        readonly targetKind?: string,
        readonly targetId?: string
    ) {
        super(message);
    }
}

const rejected = (
    code: string,
    message: string,
    targetKind?: string,
    targetId?: string
): MeetingCommandResultV1 => ({
    kind: "rejected",
    error: {
        code: code as never,
        message,
        ...(targetKind === undefined ? {} : { targetKind }),
        ...(targetId === undefined ? {} : { targetId })
    }
});

function sameCaller(left: CallerBindingV1, right: CallerBindingV1): boolean {
    return (
        left.channel === right.channel &&
        left.principalId === right.principalId &&
        left.sessionBindingId === right.sessionBindingId
    );
}

function authorizedRole(action: MeetingActionV1["kind"], scope: ResolvedCallerScopeV1): boolean {
    if (["pause_meeting", "resume_meeting", "end_meeting"].includes(action))
        return scope.role === "local";
    if (
        action === "record_review_delivery" ||
        action === "start_archive" ||
        action === "record_archive_session_result" ||
        action === "record_identity_admission_result"
    )
        return scope.role === "runtime";
    if (
        ["open_round", "dispose_hand_raise", "publish_round", "recommend_identity"].includes(action)
    )
        return scope.role === "manager";
    if (action === "submit_review_batch") return scope.role === "evidence_reviewer";
    if (action === "close_contribution")
        return scope.role === "participant" || scope.role === "runtime";
    return scope.role === "participant";
}

function validScope(
    command: MeetingCommandV1,
    context: MeetingCommandExecutionContextV1,
    scope: ResolvedCallerScopeV1 | undefined
): scope is ResolvedCallerScopeV1 {
    if (
        !scope ||
        scope.meetingId !== command.meetingId ||
        !sameCaller(scope.caller, context.caller)
    )
        return false;
    if (context.caller.channel === "dsh_tool") {
        const ownership = scope.ownership;
        return (
            scope.identityId !== undefined &&
            ownership !== undefined &&
            ownership.id === context.caller.sessionBindingId &&
            ownership.meetingId === command.meetingId &&
            ownership.identityId === scope.identityId &&
            ownership.lifecycleStatus === "active" &&
            ownership.capabilityStatus === "active"
        );
    }
    if (context.caller.channel === "loopback_remote")
        return (
            scope.role === "local" &&
            context.caller.principalId === LOCAL_CONTROLLER_PRINCIPAL_ID &&
            context.caller.sessionBindingId === undefined
        );
    const principal =
        context.caller.channel === "runtime_recovery"
            ? RUNTIME_RECOVERY_PRINCIPAL_ID
            : DEADLINE_HANDLER_PRINCIPAL_ID;
    return (
        scope.role === "runtime" &&
        context.caller.principalId === principal &&
        context.caller.sessionBindingId === undefined
    );
}

function authorization(scope: ResolvedCallerScopeV1): CommandAuthorization {
    return {
        callerBinding: scope.caller.channel + ":" + scope.caller.principalId,
        capabilityId:
            scope.ownership?.id === undefined ? scope.caller.principalId : scope.ownership.id
    };
}

function outbox(
    requests: readonly object[],
    deps: MeetingCommandApplicationDependenciesV1,
    now: number
): OutboxInput[] {
    return requests.map((request) => {
        const id = deps.ids.nextId("outbox");
        return {
            id,
            deliveryId: id,
            kind: "dispatch",
            payload: request as JsonObject,
            availableAt: now
        };
    });
}

function mapRepositoryError(error: unknown): MeetingCommandResultV1 {
    if (!(error instanceof RepositoryError))
        return rejected("STORAGE_UNAVAILABLE", "Meeting storage is unavailable");
    const code = (() => {
        switch (error.code) {
            case "SCHEMA_VERSION_UNSUPPORTED":
                return "INCOMPATIBLE_VERSION";
            case "INVALID_INPUT":
                return "INVALID_ARGUMENT";
            case "CONSTRAINT_VIOLATION":
                return "PRECONDITION_FAILED";
            case "MEETING_EXISTS":
                return "IDEMPOTENCY_CONFLICT";
            case "MEETING_NOT_FOUND":
            case "VERSION_CONFLICT":
            case "IDEMPOTENCY_CONFLICT":
            case "RECOVERY_UNAVAILABLE":
            case "INVALID_STATE":
                return error.code;
            case "UNSUPPORTED_CAPABILITY":
            case "CORRUPT_DATABASE":
            case "LEASE_LOST":
            case "OUTBOX_NOT_FOUND":
            case "CLOSED":
                return "STORAGE_UNAVAILABLE";
        }
    })();
    return rejected(code, error.message);
}

export function createMeetingCommandApplicationV1(
    deps: MeetingCommandApplicationDependenciesV1
): MeetingCommandApplicationV1 {
    return {
        async execute(rawCommand, context, signal) {
            const parsed = MeetingCommandV1Schema.safeParse(rawCommand);
            if (!parsed.success) return rejected("INVALID_ARGUMENT", "Invalid Meeting command");
            const command = parsed.data;
            signal.throwIfAborted();
            const now = deps.clock.now();
            if (command.action.kind === "create_meeting") {
                if (
                    context.caller.channel !== "dsh_tool" ||
                    context.captainParent === undefined ||
                    context.caller.principalId !== String(context.captainParent.id) ||
                    context.caller.sessionBindingId !== undefined
                )
                    return rejected(
                        "UNAUTHORIZED",
                        "Only a trusted Captain tool caller may create a Meeting"
                    );
                const meetingId = meetingIdFor(command.requestId);
                try {
                    return await deps.creation.create(
                        command as CreateMeetingCommandV1,
                        context,
                        meetingId,
                        now,
                        signal
                    );
                } catch (error) {
                    return mapRepositoryError(error);
                }
            }
            const scope = await deps.resolveCallerScope({
                meetingId: command.meetingId,
                caller: context.caller
            });
            if (!validScope(command, context, scope) || !authorizedRole(command.action.kind, scope))
                return rejected("UNAUTHORIZED", "Caller is not authorized for this action");
            if (
                [
                    "record_review_delivery",
                    "start_archive",
                    "record_archive_session_result",
                    "record_identity_admission_result"
                ].includes(command.action.kind) &&
                (context.caller.channel !== "runtime_recovery" ||
                    context.caller.principalId !== RUNTIME_RECOVERY_PRINCIPAL_ID)
            )
                return rejected("UNAUTHORIZED", "Action requires the recovery runtime");
            if (
                command.action.kind === "close_contribution" &&
                ((command.action.exit === "withdrawn" && context.caller.channel !== "dsh_tool") ||
                    (command.action.exit !== "withdrawn" &&
                        (context.caller.channel !== "deadline_handler" ||
                            context.caller.principalId !== DEADLINE_HANDLER_PRINCIPAL_ID)))
            )
                return rejected("UNAUTHORIZED", "Contribution closure caller is not authorized");
            if (command.action.kind === "start_archive" && context.archiveEffect === undefined)
                return rejected(
                    "UNAUTHORIZED",
                    "Archive materialization requires its runtime effect"
                );
            try {
                const repository = await deps.registry.openMeeting({
                    meetingId: command.meetingId
                });
                let catalogDefinitionHash: string | undefined;
                if (command.action.kind === "recommend_identity") {
                    const replay = await repository.replayReceipt({
                        requestId: command.requestId,
                        commandKind: command.action.kind,
                        authorization: authorization(scope),
                        requestHash: JSON.stringify(command.action)
                    });
                    if (replay) return replay.result as MeetingCommandResultV1;
                    const identityAction = command.action;
                    if (!deps.catalog || !scope.ownership)
                        return rejected(
                            "PRECONDITION_FAILED",
                            "Meeting role catalog is unavailable"
                        );
                    const catalog = await readMeetingRoleCatalogV1(
                        deps.catalog,
                        command.meetingId,
                        scope.ownership.parentSessionId,
                        scope.ownership.sessionId
                    );
                    if (catalog.kind !== "available")
                        return rejected("PRECONDITION_FAILED", catalog.error.message);
                    const candidate = catalog.snapshot.candidates.find(
                        (item) => item.candidateId === identityAction.candidateId
                    );
                    if (
                        !candidate ||
                        candidate.availability !== "available" ||
                        candidate.definition.id !== identityAction.definitionId ||
                        candidate.definition.version !== identityAction.definitionVersion ||
                        catalog.snapshot.catalogId !== identityAction.catalogId ||
                        catalog.snapshot.catalogVersion !== identityAction.catalogVersion
                    )
                        return rejected("PRECONDITION_FAILED", "Catalog candidate does not match");
                    catalogDefinitionHash = candidate.definitionHash;
                }
                const committedFacts =
                    command.action.kind === "start_archive"
                        ? await repository.readCommittedFacts()
                        : [];
                const factId = deps.ids.nextId("fact");
                const receiptId = deps.ids.nextId("receipt");
                const generated = (kind: string) => deps.ids.nextId(kind);
                const repositoryCommand: Record<string, unknown> = {
                    requestId: command.requestId,
                    commandKind: command.action.kind,
                    authorization: authorization(scope),
                    requestHash: JSON.stringify(command.action),
                    expectedMeetingVersion: command.expectedMeetingVersion,
                    ...(command.action.kind === "record_archive_session_result"
                        ? {
                              archiveSessionResult: {
                                  sessionOwnershipId: command.action.sessionOwnershipId,
                                  status: command.action.status,
                                  ...(command.action.failureReason === undefined
                                      ? {}
                                      : { failureCode: command.action.failureReason })
                              }
                          }
                        : {}),
                    transition: (
                        snapshot: { state: MeetingState; version: number },
                        repositoryContext: {
                            allSessionOwnershipClosedAfterResult?: boolean;
                        } = {}
                    ) => {
                        let transition:
                            | MeetingTransitionResultV1
                            | {
                                  kind: "accepted";
                                  state: MeetingState;
                                  relatedIds: readonly string[];
                                  effectRequests: readonly {
                                      kind: "identity_provision";
                                      recommendationId: string;
                                      admissionId: string;
                                  }[];
                              };
                        const action = command.action;
                        const actorId = scope.identityId ?? scope.caller.principalId;
                        switch (action.kind) {
                            case "open_round":
                                transition = openRoundV1(snapshot.state, {
                                    roundId: generated("round"),
                                    agendaId: action.agendaId,
                                    managerId: actorId,
                                    now,
                                    ...(action.deadlineAt === undefined
                                        ? {}
                                        : { deadlineAt: action.deadlineAt })
                                });
                                break;
                            case "raise_hand":
                                transition = raiseHandV1(snapshot.state, {
                                    roundId: action.roundId,
                                    contributorId: actorId,
                                    purpose: action.purpose,
                                    now
                                });
                                break;
                            case "dispose_hand_raise":
                                transition = disposeHandRaiseV1(snapshot.state, {
                                    roundId: action.roundId,
                                    contributorId: action.contributorId,
                                    managerId: actorId,
                                    disposition: action.disposition,
                                    reason: action.reason,
                                    ...(action.disposition === "accepted"
                                        ? { contributionId: generated("contribution") }
                                        : {}),
                                    now
                                });
                                break;
                            case "submit_evidence":
                                transition = submitEvidenceV1(snapshot.state, {
                                    contributionId: action.contributionId,
                                    authorId: actorId,
                                    evidence: action.evidence,
                                    packageId: generated("evidence_package"),
                                    versionId: generated("evidence_version"),
                                    now
                                });
                                break;
                            case "close_contribution":
                                transition = closeContributionV1(snapshot.state, {
                                    contributionId: action.contributionId,
                                    actorId,
                                    actorKind:
                                        scope.caller.channel === "deadline_handler"
                                            ? "deadline_handler"
                                            : "author",
                                    exit: action.exit,
                                    reason: action.reason,
                                    now
                                });
                                break;
                            case "submit_review_batch":
                                transition = submitReviewBatchV1(snapshot.state, {
                                    reviewerId: actorId,
                                    reviews: action.reviews.map((review) => ({
                                        ...review,
                                        reviewId: generated("review")
                                    })),
                                    now
                                });
                                break;
                            case "record_review_delivery":
                                transition = recordReviewDeliveryV1(snapshot.state, {
                                    reviewId: action.reviewId,
                                    dispatcherId: actorId,
                                    deliveryId: generated("review_delivery"),
                                    status: action.status,
                                    ...(action.failureReason === undefined
                                        ? {}
                                        : { failureReason: action.failureReason }),
                                    now
                                });
                                break;
                            case "publish_round": {
                                const round = snapshot.state.rounds.find(
                                    (candidate) => candidate.id === action.roundId
                                );
                                const count =
                                    round?.contributionIds.filter((id) => {
                                        const contribution = snapshot.state.contributions.find(
                                            (candidate) => candidate.id === id
                                        );
                                        return contribution?.packageId !== undefined;
                                    }).length ?? 0;
                                transition = publishRoundV1(snapshot.state, {
                                    roundId: action.roundId,
                                    managerId: actorId,
                                    publicationId: generated("publication"),
                                    messageIds: Array.from({ length: count }, () =>
                                        generated("formal_message")
                                    ),
                                    now
                                });
                                break;
                            }
                            case "pause_meeting":
                            case "resume_meeting": {
                                const result = transitionMeetingStateV1(
                                    snapshot.state,
                                    action,
                                    { kind: "local_controller", id: actorId },
                                    now,
                                    factId
                                );
                                if (result.kind === "rejected")
                                    throw new TransitionRejected(result.code, result.code);
                                transition = {
                                    kind: "accepted",
                                    state: result.state,
                                    relatedIds: result.facts[0].relatedIds,
                                    effectRequests: []
                                };
                                break;
                            }
                            case "end_meeting":
                                transition = endMeetingV1(snapshot.state, {
                                    ...action,
                                    terminationId: generated("termination"),
                                    actorId,
                                    now
                                });
                                break;
                            case "start_archive":
                                transition = startMeetingArchiveV1(snapshot.state, {
                                    archiveId: context.archiveEffect!.archiveId,
                                    actorId,
                                    now,
                                    questionIssueDispositionFacts: committedFacts
                                        .filter(
                                            (fact) =>
                                                (fact.kind === "resolve_question" &&
                                                    fact.payload.kind === "question_disposition") ||
                                                (fact.kind === "dispose_issue" &&
                                                    fact.payload.kind === "issue_disposition")
                                        )
                                        .sort(
                                            (left, right) =>
                                                left.occurredAt - right.occurredAt ||
                                                left.factId.localeCompare(right.factId)
                                        )
                                        .map((fact) => ({
                                            factId: fact.factId,
                                            kind: fact.kind,
                                            actorId: fact.actorId,
                                            occurredAt: fact.occurredAt,
                                            relatedIds: fact.relatedIds,
                                            payload: fact.payload
                                        })) as never
                                });
                                break;
                            case "record_archive_session_result": {
                                transition =
                                    action.status === "closed" &&
                                    repositoryContext.allSessionOwnershipClosedAfterResult === true
                                        ? completeMeetingArchiveV1(snapshot.state, {
                                              actorId,
                                              now,
                                              allSessionOwnershipClosed: true
                                          })
                                        : {
                                              kind: "accepted",
                                              state: {
                                                  ...snapshot.state,
                                                  version: snapshot.state.version + 1,
                                                  updatedAt: now
                                              },
                                              relatedIds: [action.sessionOwnershipId],
                                              effectRequests: []
                                          };
                                break;
                            }
                            case "recommend_identity": {
                                const result = recommendIdentityV1(
                                    snapshot.state,
                                    action,
                                    actorId,
                                    {
                                        recommendationId: generated("identity_recommendation"),
                                        ...(action.decision === "admit"
                                            ? {
                                                  identityId: generated("meeting_identity"),
                                                  childSessionId: generated("child_session"),
                                                  definitionHash: catalogDefinitionHash
                                              }
                                            : {})
                                    },
                                    now
                                );
                                if (result.kind === "rejected")
                                    throw new TransitionRejected(
                                        result.errorCode,
                                        result.errorCode
                                    );
                                transition = {
                                    kind: "accepted",
                                    state: result.state,
                                    relatedIds: result.fact.relatedIds,
                                    effectRequests:
                                        result.effect === undefined ? [] : [result.effect]
                                };
                                break;
                            }
                            case "record_identity_admission_result": {
                                if (context.identityAdmissionResult === undefined)
                                    throw new TransitionRejected(
                                        "PRECONDITION_FAILED",
                                        "Identity admission result is required"
                                    );
                                const result = recordIdentityAdmissionResultV1(
                                    snapshot.state,
                                    action.recommendationId,
                                    context.identityAdmissionResult,
                                    now
                                );
                                if (result.kind === "rejected")
                                    throw new TransitionRejected(
                                        result.errorCode,
                                        result.errorCode
                                    );
                                transition = {
                                    kind: "accepted",
                                    state: result.state,
                                    relatedIds: result.fact.relatedIds,
                                    effectRequests: []
                                };
                                break;
                            }
                            case "create_meeting":
                                throw new TransitionRejected(
                                    "INVALID_ARGUMENT",
                                    "Create must use the creation coordinator"
                                );
                        }
                        if (transition.kind === "rejected")
                            throw new TransitionRejected(
                                transition.error.code,
                                transition.error.message,
                                transition.error.targetKind,
                                transition.error.targetId
                            );
                        const effects =
                            action.kind === "end_meeting"
                                ? []
                                : outbox(transition.effectRequests, deps, now);
                        if (action.kind === "end_meeting") {
                            const archiveId = generated("archive");
                            effects.push({
                                id: archiveId,
                                deliveryId: archiveId,
                                kind: "dispatch",
                                payload: {
                                    kind: "archive",
                                    archiveId,
                                    meetingId: command.meetingId
                                },
                                availableAt: now
                            });
                        }
                        const result: MeetingCommandResultV1 = {
                            kind: "accepted",
                            meetingId: command.meetingId,
                            committedVersion: snapshot.version + 1,
                            receiptId,
                            factIds: [factId],
                            relatedIds: [...transition.relatedIds],
                            effects: effects.map((effect) => ({
                                id: effect.id!,
                                kind: effect.payload.kind as never,
                                status: "queued"
                            })),
                            ...(action.kind === "recommend_identity"
                                ? {
                                      identityDecision: (() => {
                                          const recommendationId = transition.relatedIds[0]!;
                                          const recommendation =
                                              transition.state.identityRecommendations.find(
                                                  (candidate) => candidate.id === recommendationId
                                              )!;
                                          return {
                                              recommendationId,
                                              decision: recommendation.decision,
                                              status: recommendation.status,
                                              ...(recommendation.identityId === undefined
                                                  ? {}
                                                  : { identityId: recommendation.identityId }),
                                              ...(recommendation.failureCode === undefined
                                                  ? {}
                                                  : { failureCode: recommendation.failureCode })
                                          };
                                      })()
                                  }
                                : {})
                        };
                        const facts: readonly CommittedFactRecordV1<MeetingState>[] = [
                            {
                                factId,
                                kind: action.kind,
                                actorId,
                                occurredAt: now,
                                meetingVersion: snapshot.version + 1,
                                relatedIds: transition.relatedIds,
                                payload: {
                                    kind: "references",
                                    relatedIds: [...transition.relatedIds]
                                },
                                resultingState: transition.state
                            }
                        ];
                        Object.assign(repositoryCommand, { facts });
                        return {
                            state: transition.state,
                            result,
                            events: [],
                            outbox: effects
                        };
                    }
                };
                const committed = await repository.execute(repositoryCommand as never);
                return (committed as { result: MeetingCommandResultV1 }).result;
            } catch (error) {
                if (error instanceof TransitionRejected)
                    return rejected(error.code, error.message, error.targetKind, error.targetId);
                return mapRepositoryError(error);
            }
        }
    };
}

export type { CommandAuthorization };
