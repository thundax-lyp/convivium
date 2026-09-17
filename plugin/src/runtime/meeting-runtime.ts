import type { MeetingAgentModelOverrides } from "@/role-composition/model-options.js";
import type { MeetingAgentDefinitionV1 } from "@/role-composition/model.js";
import { resolveMeetingRoles, RoleCompositionError } from "@/role-composition/resolve.js";
import { validateSharedRoleCapabilities } from "@/role-composition/dsh-capabilities.js";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { SessionId } from "@deepseek-ai/dsh-session";
import {
    createMeetingV1,
    createMeetingState,
    createContributionState,
    type CanonicalIdAllocator,
    type CreateContinuationSpec,
    type MeetingLimits,
    type MeetingState
} from "@/domain/index.js";
import {
    encodeMeetingIdentitySessionLabelV1,
    interruptAndDrainOwnedSessions,
    encodeMeetingSessionLabel,
    startMeetingIdentitySessionV1,
    startManagerSession,
    startParticipantSession
} from "@/dsh/index.js";
import type { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import { DomainRepositoryRegistry } from "@/repository/domain/domain-repository-registry.js";
import type { DomainMeetingRepository } from "@/repository/domain/domain-meeting-repository.js";
import type {
    CommandAuthorization,
    CreateMeetingInput,
    DomainEventInput,
    JsonObject
} from "@/repository/types.js";
import type { MeetingRepositoryPort as MeetingRepositoryType } from "@/repository/meeting-repository-port.js";
import type { RepositoryAuthorizationValidator } from "@/repository/types.js";
import type { CreateMeetingInputV1 } from "@/protocol/index.js";
import type { MeetingCommandResultV1 } from "@/protocol/index.js";
import type { JsonValue } from "@/repository/domain/canonical-json.js";
import type {
    CreateMeetingCommandV1,
    MeetingCreationCoordinatorV1
} from "@/runtime/application-service/meeting-command-v1.js";

export interface MeetingRepositoryOpenInput {
    readonly registry: Promise<DomainRepositoryRegistry>;
    readonly meetingId: string;
    readonly create?: CreateMeetingInput;
}
export type MeetingRepositoryRuntime = MeetingRepositoryType;
export type { RepositoryAuthorizationValidator };
export type { DomainEventInput, JsonObject };

export async function openMeetingRepository(
    input: MeetingRepositoryOpenInput
): Promise<DomainMeetingRepository> {
    return (await input.registry).openMeeting({
        meetingId: input.meetingId,
        ...(input.create === undefined ? {} : { create: input.create })
    });
}

export interface PreparedMeetingCreation {
    readonly state: ReturnType<typeof createMeetingState>;
    readonly createInput: CreateMeetingInput;
}

const retiredCreationLimits = [
    "maxTurns",
    "maxSpeakersPerTurn",
    "maxConsecutiveSpeechesPerSpeaker"
] as const;

export function assertContributionCreationInput(input: CreateMeetingInputV1): void {
    const participantKeys = new Set(input.participants.map(({ participantKey }) => participantKey));
    if (input.participants.length < 2 || !participantKeys.has(input.evidenceReviewerKey)) {
        throw new TypeError("INVALID_CREATE_INPUT: evidenceReviewerKey must name a Participant.");
    }
    if (input.selectionMode !== undefined && input.selectionMode !== "manager") {
        throw new TypeError(
            "INVALID_CREATE_INPUT: only Manager contribution selection is supported."
        );
    }
    if (
        input.limits !== undefined &&
        retiredCreationLimits.some((key) => Object.prototype.hasOwnProperty.call(input.limits, key))
    ) {
        throw new TypeError("INVALID_CREATE_INPUT: Turn limits are not supported.");
    }
}

function jsonValue(value: unknown): JsonValue {
    if (
        value === null ||
        typeof value === "string" ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value))
    )
        return value;
    if (Array.isArray(value)) return value.map(jsonValue);
    if (value !== undefined && typeof value === "object") {
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null)
            throw new TypeError("Meeting state contains a non-plain object");
        const result: JsonObject = Object.create(null);
        for (const [key, item] of Object.entries(value)) {
            if (item !== undefined) result[key] = jsonValue(item);
        }
        return result;
    }
    throw new TypeError("Meeting state is not JSON-compatible");
}

function jsonObject(value: unknown): JsonObject {
    const normalized = jsonValue(value);
    if (normalized !== null && typeof normalized === "object" && !Array.isArray(normalized))
        return normalized;
    throw new TypeError("Meeting state must be a JSON object");
}

export function prepareMeetingCreation(
    input: CreateMeetingInputV1,
    meetingId: string,
    authorization: CommandAuthorization,
    options: {
        readonly now: number;
        readonly promptVersion?: string;
        readonly speakerAttemptTimeoutMs?: number;
        readonly continuation?: CreateContinuationSpec;
    }
): PreparedMeetingCreation {
    assertContributionCreationInput(input);
    const allocator: CanonicalIdAllocator = {
        allocate: (kind, key) => `${kind}-${key}`
    };
    const state = createMeetingState(
        {
            meetingId,
            teamId: input.teamId,
            topic: input.topic,
            objective: input.objective,
            promptVersion: options.promptVersion ?? "v1",
            objectiveContract: input.objectiveContract,
            agenda: input.agenda,
            participants: input.participants.map((participant) => ({
                key: participant.participantKey,
                sourceMemberName: participant.sourceMemberName,
                displayName: participant.displayName,
                role: participant.role
            })),
            continuation: options.continuation,
            selectionMode: input.selectionMode,
            limits: limits(input, options.speakerAttemptTimeoutMs),
            createdAt: options.now
        },
        allocator
    );
    state.contributions = createContributionState(
        `participant-${input.evidenceReviewerKey}`,
        options.now
    );
    state.limits.maxTotalMessages = input.limits?.maxTotalMessages ?? 32;
    state.limits.maxDurationMs = input.limits?.maxDurationMs ?? 1800000;
    state.selectionMode = "manager";
    return {
        state,
        createInput: authorizationInput(
            input,
            authorization,
            meetingId,
            jsonObject(state),
            options.now
        )
    };
}

export interface MeetingCreationRuntimeDependencies {
    readonly agentModelOverrides?: MeetingAgentModelOverrides;
    readonly agentDefinitions?: readonly MeetingAgentDefinitionV1[];
    readonly repository: Pick<
        MeetingRepositoryType,
        | "meetingId"
        | "create"
        | "completeCreate"
        | "updateBootstrap"
        | "recordSessionOwnership"
        | "updateCreateResult"
        | "recover"
    >;
    readonly continuable: Pick<SubagentRuntime, "startContinuable">;
    readonly parent: Agent;
    readonly provider: string;
    readonly authorization: CommandAuthorization;
    readonly allocateSessionId: (role: "manager" | "participant", key: string) => SessionId;
    readonly cleanup?: (ownerships: readonly { sessionId: SessionId }[]) => Promise<void>;
    readonly promptVersion?: string;
    readonly speakerAttemptTimeoutMs?: number;
    readonly continuation?: CreateContinuationSpec;
    readonly prepared?: PreparedMeetingCreation;
    readonly signal: AbortSignal;
    readonly now?: () => number;
}

const defaultLimits: MeetingLimits = {
    maxTurns: 10,
    maxSpeakersPerTurn: 5,
    maxTotalMessages: 100,
    maxConsecutiveSpeechesPerSpeaker: 2,
    maxConsecutiveAttemptFailuresPerParticipant: 3,
    maxDeliveryRetries: 5,
    maxStalls: 3,
    maxReplans: 1,
    speakerAttemptTimeoutMs: 10 * 60_000,
    mailHandlingTimeoutMs: 2 * 60_000
};

function limits(input: CreateMeetingInputV1, speakerAttemptTimeoutMs?: number): MeetingLimits {
    return {
        ...defaultLimits,
        ...(speakerAttemptTimeoutMs === undefined ? {} : { speakerAttemptTimeoutMs }),
        ...(input.limits ?? {})
    };
}

function requestHash(input: CreateMeetingInputV1): string {
    return JSON.stringify(input);
}

function authorizationInput(
    input: CreateMeetingInputV1,
    authorization: CommandAuthorization,
    meetingId: string,
    initialState: Record<string, unknown>,
    now: number
): CreateMeetingInput {
    return {
        requestId: input.requestId,
        authorization,
        requestHash: requestHash(input),
        initialState: initialState as JsonObject,
        createResult: {
            meetingId,
            meetingVersion: 0,
            status: "created",
            participants: input.participants.map(({ participantKey }) => ({
                participantKey,
                participantId: `participant-${participantKey}`
            }))
        },
        createdAt: now
    };
}

export async function createMeetingRuntime(
    input: CreateMeetingInputV1,
    dependencies: MeetingCreationRuntimeDependencies
) {
    const now = dependencies.now?.() ?? Date.now();
    const meetingId = dependencies.repository.meetingId;
    const prepared =
        dependencies.prepared ??
        prepareMeetingCreation(input, meetingId, dependencies.authorization, {
            now,
            promptVersion: dependencies.promptVersion,
            speakerAttemptTimeoutMs: dependencies.speakerAttemptTimeoutMs,
            continuation: dependencies.continuation
        });
    const { state, createInput } = prepared;
    const bootstrap = await dependencies.repository.create(createInput);
    if (bootstrap.status === "creation_failed") {
        if (bootstrap.failureCode === "RoleCompositionError") throw new RoleCompositionError();
        throw new Error("Meeting creation previously failed.");
    }
    const ownerships: { sessionId: SessionId }[] = [];
    try {
        const roles = await resolveMeetingRoles(
            {
                agentModelOverrides: dependencies.agentModelOverrides,
                definitions:
                    dependencies.agentDefinitions === undefined
                        ? []
                        : dependencies.agentDefinitions,
                managerAgentDefinitionId: input.managerAgentDefinitionId,
                participants: input.participants
            },
            (selected) =>
                validateSharedRoleCapabilities(dependencies.parent, selected, dependencies.signal)
        );
        const participantCompositions = new Map(
            createInput.createResult?.participants?.map(({ participantKey, participantId }) => [
                participantId,
                roles.participants[participantKey]
            ])
        );
        const managerId = dependencies.allocateSessionId("manager", "manager");
        const managerLabel = encodeMeetingSessionLabel({
            role: "manager",
            teamId: input.teamId,
            meetingId
        });
        await dependencies.repository.recordSessionOwnership({
            ...(roles.manager === undefined
                ? {}
                : { agentDefinition: roles.manager.agentDefinition }),
            sessionId: managerId,
            parentSessionId: String(dependencies.parent.id),
            sessionLabel: managerLabel,
            provider: dependencies.provider,
            role: "manager",
            lifecycleStatus: "provisioning",
            capabilityStatus: "active"
        });
        ownerships.push({ sessionId: managerId });
        const manager = await startManagerSession({
            composition: roles.manager,
            runtime: dependencies.continuable,
            provider: dependencies.provider,
            parent: dependencies.parent,
            childId: managerId,
            teamId: input.teamId,
            meetingId,
            signal: dependencies.signal
        });
        await dependencies.repository.recordSessionOwnership({
            ...(roles.manager === undefined
                ? {}
                : { agentDefinition: roles.manager.agentDefinition }),
            sessionId: managerId,
            parentSessionId: String(dependencies.parent.id),
            sessionLabel: managerLabel,
            provider: dependencies.provider,
            initialMessageId: String(manager.messageId),
            role: "manager",
            lifecycleStatus: "active",
            capabilityStatus: "active"
        });

        for (const participant of state.participants) {
            const composition = participantCompositions.get(participant.id);
            const participantId = dependencies.allocateSessionId("participant", participant.id);
            const participantLabel = encodeMeetingSessionLabel({
                role: "participant",
                teamId: input.teamId,
                meetingId,
                participantId: participant.id
            });
            await dependencies.repository.recordSessionOwnership({
                ...(composition === undefined
                    ? {}
                    : { agentDefinition: composition.agentDefinition }),
                sessionId: participantId,
                parentSessionId: String(dependencies.parent.id),
                sessionLabel: participantLabel,
                provider: dependencies.provider,
                role: "participant",
                participantId: participant.id,
                lifecycleStatus: "provisioning",
                capabilityStatus: "active"
            });
            ownerships.push({ sessionId: participantId });
            const started = await startParticipantSession({
                composition,
                runtime: dependencies.continuable,
                provider: dependencies.provider,
                parent: dependencies.parent,
                childId: participantId,
                teamId: input.teamId,
                meetingId,
                participantId: participant.id,
                signal: dependencies.signal
            });
            await dependencies.repository.recordSessionOwnership({
                ...(composition === undefined
                    ? {}
                    : { agentDefinition: composition.agentDefinition }),
                sessionId: participantId,
                parentSessionId: String(dependencies.parent.id),
                sessionLabel: participantLabel,
                provider: dependencies.provider,
                initialMessageId: String(started.messageId),
                role: "participant",
                participantId: participant.id,
                lifecycleStatus: "active",
                capabilityStatus: "active"
            });
        }
        return await dependencies.repository.completeCreate(createInput);
    } catch (error) {
        const bootstrap = await dependencies.repository.updateBootstrap({
            status: "creation_failed",
            failureCode: error instanceof Error ? error.name : "SESSION_CREATION_FAILED",
            now
        });
        if (bootstrap.status === "ready")
            return dependencies.repository.completeCreate(createInput);
        if (dependencies.cleanup) await dependencies.cleanup(ownerships);
        throw error;
    }
}

export interface TargetMeetingCreationDependenciesV1 {
    readonly registry: DomainRepositoryRegistry<MeetingState>;
    readonly definitions: readonly MeetingAgentDefinitionV1[];
    readonly agentModelOverrides?: MeetingAgentModelOverrides;
    readonly continuable: Pick<
        SubagentRuntime,
        "startContinuable" | "interrupt" | "drainContinuableChildren"
    >;
    readonly provider: string;
    readonly ids: { nextId(kind: string): string };
}

function targetCreateState(
    command: CreateMeetingCommandV1,
    meetingId: string,
    now: number,
    identities: readonly {
        id: string;
        ownershipId: string;
        definitionHash: string;
        source: CreateMeetingCommandV1["action"]["identities"][number];
    }[]
): MeetingState {
    const byKey = new Map(
        identities.map((identity) => [identity.source.identityKey, identity] as const)
    );
    const action = command.action;
    const manager = byKey.get(action.managerIdentityKey)!;
    const reviewer = byKey.get(action.evidenceReviewerIdentityKey)!;
    return {
        id: meetingId,
        version: 1,
        createdAt: now,
        updatedAt: now,
        ...(action.continuation === undefined
            ? {}
            : {
                  continuation: {
                      ...action.continuation,
                      importedAt: now,
                      importedBy: manager.id
                  }
              }),
        objective: {
            statement: action.objective.statement,
            requiredOutputs: action.objective.requiredOutputs.map((item) => ({
                ...item,
                status: "pending" as const
            })),
            acceptanceCriteria: action.objective.acceptanceCriteria.map((item) => ({
                ...item,
                status: "pending" as const
            })),
            hardConstraints: action.objective.hardConstraints.map((item) => ({
                ...item,
                status: "pending" as const
            })),
            acceptableRiskLevel: action.objective.acceptableRiskLevel
        },
        lifecycle: { status: "running", changedAt: now, changedBy: manager.id },
        identities: identities.map(({ id, ownershipId, definitionHash, source }) => ({
            id,
            displayName: source.displayName,
            roles: source.roles,
            agendaResponsibilityIds: source.agendaResponsibilityIds,
            riskAuthority: source.riskAuthority,
            required: source.required,
            definitionId: source.definitionId!,
            definitionVersion: source.definitionVersion!,
            definitionHash,
            sessionOwnershipId: ownershipId
        })),
        identityRecommendations: [],
        agenda: action.initialAgenda.map((agenda) => ({
            id: agenda.id,
            title: agenda.title,
            question: agenda.question,
            status: agenda.id === action.initialActiveAgendaId ? "active" : "pending",
            requiredOutputIds: agenda.requiredOutputIds,
            ...(agenda.ownerIdentityKey === undefined
                ? {}
                : { ownerId: byKey.get(agenda.ownerIdentityKey)!.id })
        })),
        agendaCandidates: [],
        rounds: [],
        opportunityRequests: [],
        pendingHandRaises: [],
        contributions: [],
        evidenceReviewerId: reviewer.id,
        completionDeclarations: [],
        evidencePackages: [],
        registrations: [],
        reviews: [],
        reviewDeliveries: [],
        publications: [],
        messages: [],
        proposals: [],
        positions: [],
        decisionCandidates: [],
        decisions: [],
        questions: [],
        issues: [],
        riskDispositions: [],
        tasks: [],
        managerPlans: [],
        privateMails: [],
        completionFacts: [],
        limits: { ...action.limits, responseDeadlineMs: 60000 }
    };
}

function assertInitialTargetIdentities(
    command: CreateMeetingCommandV1,
    definitions: readonly MeetingAgentDefinitionV1[]
): void {
    const { action } = command;
    if (action.identities.length !== 8) throw new RoleCompositionError();
    const keys = new Set(action.identities.map((identity) => identity.identityKey));
    if (keys.size !== 8 || action.managerIdentityKey === action.evidenceReviewerIdentityKey)
        throw new RoleCompositionError();
    const agendas = new Set(action.initialAgenda.map((agenda) => agenda.id));
    if (
        agendas.size !== action.initialAgenda.length ||
        !agendas.has(action.initialActiveAgendaId) ||
        action.initialAgenda.length === 0
    )
        throw new RoleCompositionError();
    let managers = 0;
    let reviewers = 0;
    let contributors = 0;
    for (const identity of action.identities) {
        if (!identity.definitionId || !identity.definitionVersion) throw new RoleCompositionError();
        if (identity.agendaResponsibilityIds.some((id) => !agendas.has(id)))
            throw new RoleCompositionError();
        const definition = definitions.find(
            (item) =>
                item.agentDefinitionId === identity.definitionId &&
                item.definitionVersion === identity.definitionVersion
        );
        if (!definition) throw new RoleCompositionError();
        if (identity.roles.length !== 1) throw new RoleCompositionError();
        if (identity.roles[0] === "manager") {
            managers += 1;
            if (
                identity.identityKey !== action.managerIdentityKey ||
                definition.roleDefinitionId !== "meeting_manager"
            )
                throw new RoleCompositionError();
        } else if (identity.roles[0] === "evidence_reviewer") {
            reviewers += 1;
            if (
                identity.identityKey !== action.evidenceReviewerIdentityKey ||
                definition.roleDefinitionId !== "verification_reviewer"
            )
                throw new RoleCompositionError();
        } else if (identity.roles[0] === "contributor") {
            contributors += 1;
            if (
                definition.roleDefinitionId === "meeting_manager" ||
                definition.roleDefinitionId === "verification_reviewer"
            )
                throw new RoleCompositionError();
        } else throw new RoleCompositionError();
    }
    if (managers !== 1 || reviewers !== 1 || contributors !== 6) throw new RoleCompositionError();
    for (const agenda of action.initialAgenda)
        if (agenda.ownerIdentityKey !== undefined && !keys.has(agenda.ownerIdentityKey))
            throw new RoleCompositionError();
}

export function createMeetingCreationCoordinatorV1(
    dependencies: TargetMeetingCreationDependenciesV1
): MeetingCreationCoordinatorV1 {
    return {
        async create(command, context, meetingId, now, signal) {
            const parent = context.captainParent;
            if (!parent || context.caller.principalId !== String(parent.id))
                return {
                    kind: "rejected",
                    error: { code: "UNAUTHORIZED", message: "Trusted Captain parent is required" }
                };
            try {
                assertInitialTargetIdentities(command, dependencies.definitions);
                const roles = await resolveMeetingRoles(
                    {
                        definitions: dependencies.definitions,
                        agentModelOverrides: dependencies.agentModelOverrides,
                        managerAgentDefinitionId: command.action.identities.find((identity) =>
                            identity.roles.includes("manager")
                        )!.definitionId,
                        participants: command.action.identities
                            .filter((identity) => !identity.roles.includes("manager"))
                            .map((identity) => ({
                                participantKey: identity.identityKey,
                                agentDefinitionId: identity.definitionId
                            }))
                    },
                    (selected) => validateSharedRoleCapabilities(parent, selected, signal)
                );
                const identities = command.action.identities.map((source) => {
                    const composition = source.roles.includes("manager")
                        ? roles.manager!
                        : roles.participants[source.identityKey]!;
                    return {
                        source,
                        composition,
                        id: dependencies.ids.nextId("meeting_identity"),
                        ownershipId: dependencies.ids.nextId("session_ownership"),
                        childId: dependencies.ids.nextId("child_session") as SessionId,
                        definitionHash: composition.agentDefinition.definitionHash
                    };
                });
                const state = targetCreateState(command, meetingId, now, identities);
                const transition = createMeetingV1(state);
                if (transition.kind !== "accepted") throw new RoleCompositionError();
                const receiptId = dependencies.ids.nextId("receipt");
                const effects = transition.effectRequests.map((effect) => {
                    if (effect.kind !== "agent_notice") throw new RoleCompositionError();
                    return {
                        id: dependencies.ids.nextId("outbox"),
                        kind: "agent_notice" as const,
                        status: "queued" as const
                    };
                });
                const result = {
                    kind: "accepted" as const,
                    meetingId,
                    meetingVersion: 1,
                    committedVersion: 1,
                    receiptId,
                    factIds: [],
                    effects
                };
                const createInput: CreateMeetingInput<MeetingState> = {
                    requestId: command.requestId,
                    authorization: {
                        callerBinding: `dsh_tool:${context.caller.principalId}`,
                        capabilityId: context.caller.principalId
                    },
                    requestHash: JSON.stringify(command.action),
                    initialState: state,
                    createResult: result,
                    outbox: transition.effectRequests.map((effect, index) => ({
                        id: effects[index]!.id,
                        deliveryId: effects[index]!.id,
                        kind: "dispatch",
                        payload: effect as JsonObject,
                        availableAt: now
                    })),
                    createdAt: now
                };
                const repository = await dependencies.registry.openMeeting({
                    meetingId,
                    create: createInput
                });
                const recovered = await repository.recover();
                if (recovered.bootstrap.status === "ready")
                    return recovered.bootstrap.createResult as unknown as MeetingCommandResultV1;
                const owned = [] as Awaited<ReturnType<typeof repository.recordSessionOwnership>>[];
                try {
                    for (const identity of identities) {
                        const role: "manager" | "evidence_reviewer" | "participant" =
                            identity.source.roles[0] === "contributor"
                                ? "participant"
                                : (identity.source.roles[0] as "manager" | "evidence_reviewer");
                        const sessionLabel = encodeMeetingIdentitySessionLabelV1({
                            role,
                            meetingId,
                            identityId: identity.id
                        });
                        const base = {
                            id: identity.ownershipId,
                            meetingId,
                            identityId: identity.id,
                            agentDefinition: identity.composition.agentDefinition,
                            sessionId: String(identity.childId),
                            parentSessionId: String(parent.id),
                            sessionLabel,
                            provider: dependencies.provider,
                            role
                        };
                        owned.push(
                            await repository.recordSessionOwnership(
                                {
                                    ...base,
                                    lifecycleStatus: "provisioning",
                                    capabilityStatus: "active"
                                },
                                now
                            )
                        );
                        const started = await startMeetingIdentitySessionV1({
                            composition: identity.composition,
                            runtime: dependencies.continuable,
                            provider: dependencies.provider,
                            parent,
                            childId: identity.childId,
                            role,
                            meetingId,
                            identityId: identity.id,
                            signal
                        });
                        owned[owned.length - 1] = await repository.recordSessionOwnership(
                            {
                                ...base,
                                initialMessageId: String(started.messageId),
                                lifecycleStatus: "active",
                                capabilityStatus: "active"
                            },
                            now
                        );
                    }
                    const committed = await repository.completeCreate(createInput);
                    return committed.result as unknown as MeetingCommandResultV1;
                } catch (error) {
                    await repository.updateBootstrap({
                        status: "creation_failed",
                        failureCode:
                            error instanceof Error ? error.name : "SESSION_CREATION_FAILED",
                        now
                    });
                    const revoked = [];
                    for (const ownership of owned) {
                        revoked.push(
                            await repository.recordSessionOwnership(
                                {
                                    ...ownership,
                                    lifecycleStatus: "closed",
                                    capabilityStatus: "revoked"
                                },
                                now
                            )
                        );
                    }
                    await interruptAndDrainOwnedSessions({
                        runtime: dependencies.continuable,
                        parent,
                        ownerships: revoked
                    });
                    throw error;
                }
            } catch (error) {
                if (error instanceof RoleCompositionError)
                    return {
                        kind: "rejected",
                        error: {
                            code: "PRECONDITION_FAILED",
                            message: "Initial Meeting role composition is unavailable"
                        }
                    };
                throw error;
            }
        }
    };
}
