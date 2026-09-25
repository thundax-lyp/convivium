import { captainActorIdFor } from "@/domain/index.js";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-agent-default-model";
import { SessionPersistenceNotFoundError } from "@deepseek-ai/dsh-session-persistence";
import {
    resolveEffectiveAgentOptions,
    type MeetingAgentModelOverrides
} from "@/role-composition/model-options.js";
import type { MeetingAgentDefinition, PreparedDescriptor } from "@/role-composition/model.js";
import { definitionHash, RoleCompositionError } from "@/role-composition/resolve.js";
import { preflightMeetingIdentity } from "@/role-composition/dsh-capabilities.js";
import { createMeeting, type MeetingState } from "@/domain/index.js";
import { encodeMeetingIdentitySessionLabel, type MeetingAgentOwner } from "@/dsh/index.js";
import type { DomainRepositoryRegistry } from "@/repository/domain/domain-repository-registry.js";
import { RepositoryError } from "@/repository/errors.js";
import type { CreateMeetingInput, JsonObject, SessionOwnership } from "@/repository/types.js";
import { MeetingCommandResultSchema } from "@/protocol/index.js";
import { encodeCanonicalJson, sha256Hex } from "@/repository/domain/canonical-json.js";
import {
    LOCAL_CONTROLLER_PRINCIPAL_ID,
    type CreateMeetingCommand,
    type MeetingCreationCoordinator
} from "@/runtime/application-service/meeting-command.js";

export interface TargetMeetingCreationDependencies {
    readonly registry: DomainRepositoryRegistry<MeetingState>;
    readonly definitions: readonly MeetingAgentDefinition[];
    readonly agentModelOverrides?: MeetingAgentModelOverrides;
    readonly ctx: Context;
    readonly owner: MeetingAgentOwner;
    readonly packageRoot: string;
    readonly cwd: string;
}
const targetCreateState = (
    command: CreateMeetingCommand,
    meetingId: string,
    now: number,
    identities: readonly {
        id: string;
        ownershipId: string;
        definitionHash: string;
        source: CreateMeetingCommand["action"]["identities"][number];
    }[]
): MeetingState => {
    const byKey = new Map(
        identities.map((identity) => [identity.source.identityKey, identity] as const)
    );
    const action = command.action;
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
                      importedBy: captainActorIdFor(meetingId)
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
        lifecycle: { status: "running", changedAt: now, changedBy: captainActorIdFor(meetingId) },
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
        reviewClaims: [],
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
};

const assertInitialTargetIdentities = (
    command: CreateMeetingCommand,
    definitions: readonly MeetingAgentDefinition[]
): void => {
    const { action } = command;
    if (action.identities.length !== 7) throw new RoleCompositionError();
    const keys = new Set(action.identities.map((identity) => identity.identityKey));
    if (keys.size !== 7 || action.managerIdentityKey === action.evidenceReviewerIdentityKey)
        throw new RoleCompositionError();
    const agendas = new Set(action.initialAgenda.map((agenda) => agenda.id));
    if (
        agendas.size !== action.initialAgenda.length ||
        !agendas.has(action.initialActiveAgendaId) ||
        action.initialAgenda.length === 0
    )
        throw new RoleCompositionError();
    const selectedRoles = new Set<string>();
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
        if (!definition || selectedRoles.has(definition.roleDefinitionId))
            throw new RoleCompositionError();
        selectedRoles.add(definition.roleDefinitionId);
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
    if (managers !== 1 || reviewers !== 1 || contributors !== 5) throw new RoleCompositionError();
    for (const agenda of action.initialAgenda)
        if (agenda.ownerIdentityKey !== undefined && !keys.has(agenda.ownerIdentityKey))
            throw new RoleCompositionError();
};

const serializeMeetingCreation = (
    coordinator: MeetingCreationCoordinator
): MeetingCreationCoordinator => {
    const pending = new Map<string, Promise<unknown>>();
    return {
        create(command, context, meetingId, now, signal) {
            const previous = pending.get(meetingId) ?? Promise.resolve();
            const attempt = previous
                .catch(() => {})
                .then(() => coordinator.create(command, context, meetingId, now, signal));
            pending.set(meetingId, attempt);
            const release = () => {
                if (pending.get(meetingId) === attempt) pending.delete(meetingId);
            };
            void attempt.then(release, release);
            return attempt;
        }
    };
};

export const createMeetingCreationCoordinator = (
    dependencies: TargetMeetingCreationDependencies
): MeetingCreationCoordinator => {
    const inputOwnership = ({
        createdAt: _created,
        updatedAt: _updated,
        ...input
    }: SessionOwnership) => input;
    const stableId = (kind: string, meetingId: string, key: string) =>
        `${kind}-${sha256Hex(encodeCanonicalJson([meetingId, kind, key])).slice(0, 32)}`;
    const coordinator: MeetingCreationCoordinator = {
        async create(command, context, meetingId, now, signal) {
            if (
                context.caller.channel !== "loopback_remote" ||
                context.caller.principalId !== LOCAL_CONTROLLER_PRINCIPAL_ID ||
                context.caller.sessionBindingId !== undefined
            )
                return {
                    kind: "rejected",
                    error: { code: "UNAUTHORIZED", message: "Trusted local user is required" }
                };
            const authorization = {
                callerBinding: "loopback_remote:local-controller",
                capabilityId: LOCAL_CONTROLLER_PRINCIPAL_ID
            };
            const requestHash = JSON.stringify(command.action);
            let repository;
            let recovered;
            try {
                repository = await dependencies.registry.openMeeting({ meetingId });
                recovered = await repository.recover();
            } catch (error) {
                if (!(error instanceof RepositoryError) || error.code !== "MEETING_NOT_FOUND")
                    throw error;
            }
            if (recovered) {
                if (
                    recovered.bootstrap.createRequestId !== command.requestId ||
                    recovered.bootstrap.requestHash !== requestHash
                )
                    throw new RepositoryError(
                        "IDEMPOTENCY_CONFLICT",
                        false,
                        meetingId,
                        "Create request conflicts with original binding"
                    );
                if (recovered.bootstrap.status === "ready")
                    return MeetingCommandResultSchema.parse(recovered.bootstrap.createResult);
                if (recovered.bootstrap.status === "creation_failed")
                    throw new RepositoryError(
                        "INVALID_STATE",
                        false,
                        meetingId,
                        "Meeting creation has failed"
                    );
            }
            try {
                assertInitialTargetIdentities(command, dependencies.definitions);
            } catch (error) {
                if (!(error instanceof RoleCompositionError)) throw error;
                return {
                    kind: "rejected",
                    error: {
                        code: "PRECONDITION_FAILED",
                        message: "Initial Meeting role composition is unavailable"
                    }
                };
            }
            const selection = recovered
                ? undefined
                : dependencies.ctx.agentDefaultModel.currentSelection();
            const identities = command.action.identities.map((source) => {
                const id = stableId("meeting_identity", meetingId, source.identityKey);
                const definition = dependencies.definitions.find(
                    (d) =>
                        d.agentDefinitionId === source.definitionId &&
                        d.definitionVersion === source.definitionVersion
                )!;
                return {
                    source,
                    id,
                    definition,
                    definitionHash: definitionHash(definition),
                    ownershipId: stableId("session_ownership", meetingId, id),
                    sessionId: stableId("meeting_agent_session", meetingId, id)
                };
            });
            const descriptors: PreparedDescriptor[] = [];
            for (const identity of identities) {
                if (recovered) {
                    const descriptor = recovered.preparedDescriptors.find(
                        (d) => d.identityId === identity.id
                    );
                    if (!descriptor)
                        throw new RepositoryError(
                            "RECOVERY_UNAVAILABLE",
                            false,
                            meetingId,
                            "Original descriptor is missing"
                        );
                    descriptors.push(descriptor);
                } else {
                    const preflight = await preflightMeetingIdentity({
                        ctx: dependencies.ctx,
                        cwd: dependencies.cwd,
                        packageRoot: dependencies.packageRoot,
                        meetingId,
                        identityId: identity.id,
                        sessionId: identity.sessionId,
                        definition: identity.definition,
                        binding: {
                            agentDefinitionId: identity.definition.agentDefinitionId,
                            definitionVersion: identity.definition.definitionVersion,
                            definitionHash: identity.definitionHash
                        },
                        agentOptions: resolveEffectiveAgentOptions(
                            selection!,
                            dependencies.agentModelOverrides?.[
                                identity.definition.agentDefinitionId
                            ]
                        ),
                        now,
                        signal
                    });
                    if (preflight.kind !== "ready")
                        return {
                            kind: "rejected",
                            error: { code: "PRECONDITION_FAILED", message: preflight.error.message }
                        };
                    descriptors.push(preflight.descriptor);
                }
            }
            const state = targetCreateState(
                command,
                meetingId,
                recovered?.bootstrap.createdAt ?? now,
                identities
            );
            const transition = createMeeting(state);
            if (transition.kind !== "accepted")
                return {
                    kind: "rejected",
                    error: {
                        code: "PRECONDITION_FAILED",
                        message: "Initial Meeting state is invalid"
                    }
                };
            const effects = transition.effectRequests.map((effect, index) => {
                if (effect.kind !== "agent_notice") throw new RoleCompositionError();
                return {
                    id: stableId("outbox", meetingId, `${effect.recipientId}:${index}`),
                    kind: "agent_notice" as const,
                    status: "queued" as const
                };
            });
            const result = {
                kind: "accepted" as const,
                meetingId,
                meetingVersion: 1,
                committedVersion: 1,
                receiptId: stableId("receipt", meetingId, command.requestId),
                factIds: [],
                effects
            };
            const initialOwnership = identities.map((identity, index) => {
                const descriptor = descriptors[index]!;
                const role: SessionOwnership["role"] =
                    identity.source.roles[0] === "contributor"
                        ? "participant"
                        : (identity.source.roles[0] as "manager" | "evidence_reviewer");
                return {
                    id: identity.ownershipId,
                    meetingId,
                    identityId: identity.id,
                    sessionId: identity.sessionId,
                    definition: descriptor.definition,
                    resources: descriptor.resources,
                    agentOptions: descriptor.agentOptions,
                    descriptorId: descriptor.descriptorId,
                    descriptorHash: descriptor.descriptorHash,
                    sessionLabel: encodeMeetingIdentitySessionLabel({
                        role,
                        meetingId,
                        identityId: identity.id
                    }),
                    role,
                    lifecycleStatus: "provisioning" as const,
                    capabilityStatus: "active" as const
                };
            });
            const createInput: CreateMeetingInput<MeetingState> = {
                requestId: command.requestId,
                authorization,
                requestHash,
                initialState: state,
                creator: { kind: "local_user", principalId: "local-controller" },
                initialOwnership,
                preparedDescriptors: descriptors,
                createResult: result,
                outbox: transition.effectRequests.map((effect, index) => ({
                    id: effects[index]!.id,
                    deliveryId: effects[index]!.id,
                    kind: "dispatch",
                    payload: effect as JsonObject,
                    availableAt: now
                })),
                createdAt: recovered?.bootstrap.createdAt ?? now
            };
            const wasRecovering = recovered !== undefined;
            repository = await dependencies.registry.openMeeting({
                meetingId,
                create: createInput
            });
            recovered = await repository.recover();
            try {
                for (const [index, identity] of identities.entries()) {
                    const ownership = recovered.sessionOwnership.find(
                        (o) => o.id === identity.ownershipId
                    )!;
                    const descriptor = descriptors[index]!;
                    if (ownership.lifecycleStatus === "active") continue;
                    if (descriptor.expiresAt <= Date.now()) throw new Error("PREFLIGHT_EXPIRED");
                    if (wasRecovering)
                        await dependencies.owner.resume({
                            ownership,
                            definition: identity.definition,
                            purpose: "provisioning",
                            signal
                        });
                    else
                        await dependencies.owner.create({
                            ownership,
                            descriptor,
                            definition: identity.definition,
                            signal
                        });
                    await repository.recordSessionOwnership(
                        { ...inputOwnership(ownership), lifecycleStatus: "active" },
                        Date.now(),
                        descriptor
                    );
                }
                await repository.completeCreate(createInput);
            } catch (error) {
                await repository.updateBootstrap({
                    status: "creation_failed",
                    failureCode: error instanceof Error ? error.name : "SESSION_CREATION_FAILED",
                    now: Date.now()
                });
                const revoked = (await repository.recover()).sessionOwnership;
                const cleanupSignal = new AbortController().signal;
                const cleanup = await Promise.allSettled(
                    revoked.map(async (ownership) => {
                        const definition = identities.find(
                            (i) => i.id === ownership.identityId
                        )!.definition;
                        try {
                            await dependencies.owner.stop({
                                ownership,
                                definition,
                                reason: "creation_failed",
                                signal: cleanupSignal
                            });
                        } catch (failure) {
                            if (!(failure instanceof SessionPersistenceNotFoundError))
                                throw failure;
                        }
                        await repository!.recordSessionOwnership(
                            { ...inputOwnership(ownership), lifecycleStatus: "closed" },
                            Date.now()
                        );
                    })
                );
                const failures = cleanup.filter((r) => r.status === "rejected");
                if (failures.length)
                    throw new AggregateError(
                        [error, ...failures.map((r) => r.reason)],
                        "Meeting creation and cleanup failed",
                        { cause: error }
                    );
                throw error;
            }
            const ready = await repository.recover();
            for (const ownership of ready.sessionOwnership) {
                const definition = identities.find(
                    (i) => i.id === ownership.identityId
                )!.definition;
                await dependencies.owner.resume({
                    ownership,
                    definition,
                    purpose: "delivery",
                    signal
                });
            }
            return MeetingCommandResultSchema.parse(result);
        }
    };
    return serializeMeetingCreation(coordinator);
};
