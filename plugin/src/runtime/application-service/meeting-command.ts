import {
    runMeetingActionTransition,
    TransitionRejected,
    type CommandTransition
} from "./meeting-action-transition.js";
import {
    captainActorIdFor,
    type IdentityAdmissionResultContext,
    type MeetingState
} from "@/domain/index.js";
import {
    MeetingCommandSchema,
    type MeetingAction,
    type MeetingCommandResult,
    type MeetingCommand
} from "@/protocol/index.js";
import { readMeetingRoleCatalog, type RoleCatalogPort } from "@/dsh/index.js";
import type { DomainRepositoryRegistry } from "@/repository/domain/domain-repository-registry.js";
import { meetingIdFor } from "@/repository/domain/keys.js";
import { RepositoryError } from "@/repository/errors.js";
import type {
    CommandAuthorization,
    CommittedFactRecord,
    JsonObject,
    OutboxInput,
    RepositoryCommand,
    SessionOwnership,
    TransitionResult
} from "@/repository/types.js";

export const LOCAL_CONTROLLER_PRINCIPAL_ID = "local-controller";
export const RUNTIME_RECOVERY_PRINCIPAL_ID = "runtime-recovery";
export const DEADLINE_HANDLER_PRINCIPAL_ID = "deadline-handler";

export interface CallerBinding {
    channel:
        | "dsh_tool"
        | "loopback_remote"
        | "skill_invocation"
        | "runtime_recovery"
        | "deadline_handler";
    principalId: string;
    sessionBindingId?: string;
}

export interface MeetingCommandExecutionContext {
    caller: CallerBinding;
    archiveEffect?: { effectId: string; archiveId: string };
    identityAdmissionResult?: IdentityAdmissionResultContext;
}

export type CreateMeetingCommand = Omit<MeetingCommand, "action"> & {
    action: Extract<MeetingAction, { kind: "create_meeting" }>;
};

export interface MeetingCreationCoordinator {
    create(
        command: CreateMeetingCommand,
        context: MeetingCommandExecutionContext,
        meetingId: string,
        now: number,
        signal: AbortSignal
    ): Promise<MeetingCommandResult>;
}

export interface ResolvedCallerScope {
    caller: CallerBinding;
    meetingId: string;
    identityId?: string;
    role: "captain" | "manager" | "evidence_reviewer" | "participant" | "runtime";
    ownership?: SessionOwnership;
}

export type ResolveCallerScope = (input: {
    meetingId: string;
    caller: CallerBinding;
}) => Promise<ResolvedCallerScope | undefined>;

export interface MeetingCommandApplication {
    execute(
        command: MeetingCommand,
        context: MeetingCommandExecutionContext,
        signal: AbortSignal
    ): Promise<MeetingCommandResult>;
}

export interface MeetingCommandApplicationDependencies {
    creation: MeetingCreationCoordinator;
    registry: DomainRepositoryRegistry<MeetingState>;
    ids: { nextId(kind: string): string };
    clock: { now(): number };
    resolveCallerScope: ResolveCallerScope;
    catalog?: RoleCatalogPort;
}

const rejected = (
    code: string,
    message: string,
    targetKind?: string,
    targetId?: string
): MeetingCommandResult => ({
    kind: "rejected",
    error: {
        code: code as never,
        message,
        ...(targetKind === undefined ? {} : { targetKind }),
        ...(targetId === undefined ? {} : { targetId })
    }
});

function sameCaller(left: CallerBinding, right: CallerBinding): boolean {
    return (
        left.channel === right.channel &&
        left.principalId === right.principalId &&
        left.sessionBindingId === right.sessionBindingId
    );
}

function authorizedRole(action: MeetingAction["kind"], scope: ResolvedCallerScope): boolean {
    if (
        [
            "activate_agenda",
            "dispose_agenda_candidate",
            "resolve_question",
            "dispose_issue",
            "abort_round",
            "decide",
            "change_decision",
            "dispose_risk",
            "record_completion_fact",
            "change_completion_fact",
            "pause_meeting",
            "resume_meeting",
            "end_meeting"
        ].includes(action)
    )
        return scope.role === "captain";
    if (
        action === "record_review_delivery" ||
        action === "claim_evidence_review" ||
        action === "fail_evidence_validation" ||
        action === "start_archive" ||
        action === "record_archive_session_result" ||
        action === "record_identity_admission_result"
    )
        return scope.role === "runtime";
    if (
        [
            "submit_manager_plan",
            "open_round",
            "dispose_hand_raise",
            "publish_round",
            "recommend_identity"
        ].includes(action)
    )
        return scope.role === "manager";
    if (action === "submit_evidence_review") return scope.role === "evidence_reviewer";
    if (action === "close_contribution")
        return scope.role === "participant" || scope.role === "runtime";
    return scope.role === "participant";
}

function validScope(
    command: MeetingCommand,
    context: MeetingCommandExecutionContext,
    scope: ResolvedCallerScope | undefined
): scope is ResolvedCallerScope {
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
            scope.identityId === context.caller.principalId &&
            scope.role === ownership?.role &&
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
            scope.role === "captain" &&
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

function authorization(scope: ResolvedCallerScope): CommandAuthorization {
    return {
        callerBinding: scope.caller.channel + ":" + scope.caller.principalId,
        capabilityId:
            scope.ownership?.id === undefined ? scope.caller.principalId : scope.ownership.id
    };
}

function outbox(
    requests: readonly object[],
    deps: MeetingCommandApplicationDependencies,
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

function mapRepositoryError(error: unknown): MeetingCommandResult {
    if (error instanceof TransitionRejected)
        return rejected(error.code, error.message, error.targetKind, error.targetId);
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

type MeetingRepository = Awaited<ReturnType<DomainRepositoryRegistry<MeetingState>["openMeeting"]>>;

function actionAuthorizationFailure(
    command: MeetingCommand,
    context: MeetingCommandExecutionContext,
    scope: ResolvedCallerScope
): MeetingCommandResult | undefined {
    if (!authorizedRole(command.action.kind, scope))
        return rejected("UNAUTHORIZED", "Caller is not authorized for this action");
    if (
        [
            "record_review_delivery",
            "claim_evidence_review",
            "fail_evidence_validation",
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
        return rejected("UNAUTHORIZED", "Archive materialization requires its runtime effect");
    return undefined;
}

async function prepareIdentityCatalog(
    deps: MeetingCommandApplicationDependencies,
    repository: MeetingRepository,
    command: MeetingCommand,
    scope: ResolvedCallerScope
): Promise<{ definitionHash?: string; result?: MeetingCommandResult }> {
    if (command.action.kind !== "recommend_identity") return {};
    const replay = await repository.replayReceipt({
        requestId: command.requestId,
        commandKind: command.action.kind,
        authorization: authorization(scope),
        requestHash: JSON.stringify(command.action)
    });
    if (replay) return { result: replay.result as MeetingCommandResult };
    if (!deps.catalog || !scope.ownership)
        return {
            result: rejected("PRECONDITION_FAILED", "Meeting role catalog is unavailable")
        };
    const catalog = await readMeetingRoleCatalog(
        deps.catalog,
        command.meetingId,
        scope.ownership.sessionId
    );
    if (catalog.kind !== "available")
        return { result: rejected("PRECONDITION_FAILED", catalog.error.message) };
    const action = command.action;
    const candidate = catalog.snapshot.candidates.find(
        (item) => item.candidateId === action.candidateId
    );
    if (
        !candidate ||
        candidate.availability !== "available" ||
        candidate.definition.id !== action.definitionId ||
        candidate.definition.version !== action.definitionVersion ||
        catalog.snapshot.catalogId !== action.catalogId ||
        catalog.snapshot.catalogVersion !== action.catalogVersion
    )
        return { result: rejected("PRECONDITION_FAILED", "Catalog candidate does not match") };
    return { definitionHash: candidate.definitionHash };
}

function finalizeMeetingTransition(input: {
    transition: CommandTransition;
    deps: MeetingCommandApplicationDependencies;
    command: MeetingCommand;
    now: number;
    factId: string;
    receiptId: string;
    actorId: string;
    snapshotVersion: number;
}): {
    repositoryTransition: TransitionResult<MeetingCommandResult, MeetingState>;
    facts: readonly CommittedFactRecord<MeetingState>[];
} {
    const { transition, deps, command, now, factId, receiptId, actorId, snapshotVersion } = input;
    if (transition.kind === "rejected")
        throw new TransitionRejected(
            transition.error.code,
            transition.error.message,
            transition.error.targetKind,
            transition.error.targetId
        );
    const action = command.action;
    const effects =
        action.kind === "end_meeting" ? [] : outbox(transition.effectRequests, deps, now);
    if (action.kind === "end_meeting") {
        const archiveId = deps.ids.nextId("archive");
        effects.push({
            id: archiveId,
            deliveryId: archiveId,
            kind: "dispatch",
            payload: { kind: "archive", archiveId, meetingId: command.meetingId },
            availableAt: now
        });
    }
    const result: MeetingCommandResult = {
        kind: "accepted",
        meetingId: command.meetingId,
        committedVersion: snapshotVersion + 1,
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
                      const recommendation = transition.state.identityRecommendations.find(
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
    const payload = transition.factPayload;
    const factPayload: JsonObject =
        payload === undefined || payload.kind === "references"
            ? { kind: "references", relatedIds: [...transition.relatedIds] }
            : { ...payload, evidenceIds: [...payload.evidenceIds] };
    const facts: readonly CommittedFactRecord<MeetingState>[] = [
        {
            factId,
            kind: action.kind,
            actorId,
            occurredAt: now,
            meetingVersion: snapshotVersion + 1,
            relatedIds: transition.relatedIds,
            payload: factPayload,
            resultingState: transition.state
        }
    ];
    return {
        facts,
        repositoryTransition: {
            state: transition.state,
            result,
            events: [],
            outbox: effects
        }
    };
}

function createRepositoryCommand(input: {
    deps: MeetingCommandApplicationDependencies;
    command: MeetingCommand;
    context: MeetingCommandExecutionContext;
    scope: ResolvedCallerScope;
    now: number;
    catalogDefinitionHash?: string;
    committedFacts: readonly CommittedFactRecord<MeetingState>[];
}): RepositoryCommand<MeetingCommandResult, MeetingState> {
    const { deps, command, context, scope, now, catalogDefinitionHash, committedFacts } = input;
    const repositoryCommand: RepositoryCommand<MeetingCommandResult, MeetingState> = {
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
        transition: (snapshot, repositoryContext = {}) => {
            const factId = deps.ids.nextId("fact");
            const receiptId = deps.ids.nextId("receipt");
            const transition = runMeetingActionTransition({
                snapshot,
                repositoryContext,
                deps,
                command,
                context,
                scope,
                now,
                factId,
                catalogDefinitionHash,
                committedFacts
            });
            const finalized = finalizeMeetingTransition({
                transition,
                deps,
                command,
                now,
                factId,
                receiptId,
                actorId:
                    scope.role === "captain"
                        ? captainActorIdFor(command.meetingId)
                        : (scope.identityId ?? scope.caller.principalId),
                snapshotVersion: snapshot.version
            });
            repositoryCommand.facts = finalized.facts;
            return finalized.repositoryTransition;
        }
    };
    return repositoryCommand;
}

async function executeCreateMeeting(
    deps: MeetingCommandApplicationDependencies,
    command: CreateMeetingCommand,
    context: MeetingCommandExecutionContext,
    now: number,
    signal: AbortSignal
): Promise<MeetingCommandResult> {
    if (
        !["loopback_remote", "skill_invocation"].includes(context.caller.channel) ||
        context.caller.principalId !== LOCAL_CONTROLLER_PRINCIPAL_ID ||
        context.caller.sessionBindingId !== undefined
    )
        return rejected("UNAUTHORIZED", "Only the trusted local user may create a Meeting");
    try {
        return await deps.creation.create(
            command,
            context,
            meetingIdFor(command.requestId),
            now,
            signal
        );
    } catch (error) {
        return mapRepositoryError(error);
    }
}

async function executeExistingMeeting(
    deps: MeetingCommandApplicationDependencies,
    command: MeetingCommand,
    context: MeetingCommandExecutionContext,
    scope: ResolvedCallerScope,
    now: number
): Promise<MeetingCommandResult> {
    const authorizationFailure = actionAuthorizationFailure(command, context, scope);
    if (authorizationFailure) return authorizationFailure;
    try {
        const repository = await deps.registry.openMeeting({ meetingId: command.meetingId });
        const catalog = await prepareIdentityCatalog(deps, repository, command, scope);
        if (catalog.result) return catalog.result;
        const committedFacts =
            command.action.kind === "start_archive" ? await repository.readCommittedFacts() : [];
        const repositoryCommand = createRepositoryCommand({
            deps,
            command,
            context,
            scope,
            now,
            catalogDefinitionHash: catalog.definitionHash,
            committedFacts
        });
        const committed = await repository.execute(repositoryCommand);
        return committed.result;
    } catch (error) {
        if (error instanceof TransitionRejected)
            return rejected(error.code, error.message, error.targetKind, error.targetId);
        return mapRepositoryError(error);
    }
}

async function executeMeetingCommand(
    deps: MeetingCommandApplicationDependencies,
    rawCommand: MeetingCommand,
    context: MeetingCommandExecutionContext,
    signal: AbortSignal
): Promise<MeetingCommandResult> {
    const parsed = MeetingCommandSchema.safeParse(rawCommand);
    if (!parsed.success) return rejected("INVALID_ARGUMENT", "Invalid Meeting command");
    const command = parsed.data;
    signal.throwIfAborted();
    const now = deps.clock.now();
    if (command.action.kind === "create_meeting")
        return executeCreateMeeting(deps, command as CreateMeetingCommand, context, now, signal);
    const scope = await deps.resolveCallerScope({
        meetingId: command.meetingId,
        caller: context.caller
    });
    if (!validScope(command, context, scope))
        return rejected("UNAUTHORIZED", "Caller is not authorized for this action");
    return executeExistingMeeting(deps, command, context, scope, now);
}

export function createMeetingCommandApplication(
    deps: MeetingCommandApplicationDependencies
): MeetingCommandApplication {
    return {
        execute: (command, context, signal) => executeMeetingCommand(deps, command, context, signal)
    };
}
