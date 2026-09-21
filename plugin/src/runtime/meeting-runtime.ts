import type { MeetingAgentModelOverrides } from "@/role-composition/model-options.js";
import type { MeetingAgentDefinitionV1 } from "@/role-composition/model.js";
import { resolveMeetingRoles, RoleCompositionError } from "@/role-composition/resolve.js";
import { validateSharedRoleCapabilities } from "@/role-composition/dsh-capabilities.js";
import type { SessionId } from "@deepseek-ai/dsh-session";
import { createMeeting, type MeetingState } from "@/domain/index.js";
import {
    encodeMeetingIdentitySessionLabel,
    interruptAndDrainOwnedSessions,
    startMeetingIdentitySession
} from "@/dsh/index.js";
import type { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import { DomainRepositoryRegistry } from "@/repository/domain/domain-repository-registry.js";
import { RepositoryError } from "@/repository/errors.js";
import type { CreateMeetingInput, JsonObject } from "@/repository/types.js";
import type { MeetingCommandResult } from "@/protocol/index.js";
import { encodeCanonicalJson, sha256Hex } from "@/repository/domain/canonical-json.js";
import type {
    CreateMeetingCommandV1,
    MeetingCreationCoordinatorV1
} from "@/runtime/application-service/meeting-command.js";

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
}

function assertInitialTargetIdentities(
    command: CreateMeetingCommandV1,
    definitions: readonly MeetingAgentDefinitionV1[]
): void {
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
    if (managers !== 1 || reviewers !== 1 || contributors !== 5) throw new RoleCompositionError();
    for (const agenda of action.initialAgenda)
        if (agenda.ownerIdentityKey !== undefined && !keys.has(agenda.ownerIdentityKey))
            throw new RoleCompositionError();
}

export function createMeetingCreationCoordinatorV1(
    dependencies: TargetMeetingCreationDependenciesV1
): MeetingCreationCoordinatorV1 {
    const inFlight = new Map<string, Promise<MeetingCommandResult>>();
    const stableId = (kind: string, meetingId: string, key: string) =>
        `${kind}-${sha256Hex(encodeCanonicalJson([meetingId, kind, key])).slice(0, 32)}`;
    const coordinator: MeetingCreationCoordinatorV1 = {
        async create(command, context, meetingId, now, signal) {
            const parent = context.captainParent;
            if (!parent || context.caller.principalId !== String(parent.id))
                return {
                    kind: "rejected",
                    error: {
                        code: "UNAUTHORIZED",
                        message: "Trusted Captain parent is required"
                    }
                };
            const authorization = {
                callerBinding: `dsh_tool:${context.caller.principalId}`,
                capabilityId: context.caller.principalId
            };
            const requestHash = JSON.stringify(command.action);
            try {
                try {
                    const existing = await dependencies.registry.openMeeting({ meetingId });
                    const replay = await existing.replayReceipt({
                        requestId: command.requestId,
                        commandKind: command.action.kind,
                        authorization,
                        requestHash
                    });
                    if (replay !== undefined)
                        return replay.result as unknown as MeetingCommandResult;
                } catch (error) {
                    if (!(error instanceof RepositoryError) || error.code !== "MEETING_NOT_FOUND")
                        throw error;
                }
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
                        id: stableId("meeting_identity", meetingId, source.identityKey),
                        ownershipId: stableId("session_ownership", meetingId, source.identityKey),
                        childId: stableId(
                            "child_session",
                            meetingId,
                            source.identityKey
                        ) as SessionId,
                        definitionHash: composition.agentDefinition.definitionHash
                    };
                });
                const state = targetCreateState(command, meetingId, now, identities);
                const transition = createMeeting(state);
                if (transition.kind !== "accepted") throw new RoleCompositionError();
                const receiptId = stableId("receipt", meetingId, command.requestId);
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
                    receiptId,
                    factIds: [],
                    effects
                };
                const createInput: CreateMeetingInput<MeetingState> = {
                    requestId: command.requestId,
                    authorization,
                    requestHash,
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
                    return recovered.bootstrap.createResult as unknown as MeetingCommandResult;
                const owned = [] as Awaited<ReturnType<typeof repository.recordSessionOwnership>>[];
                try {
                    for (const identity of identities) {
                        const role: "manager" | "evidence_reviewer" | "participant" =
                            identity.source.roles[0] === "contributor"
                                ? "participant"
                                : (identity.source.roles[0] as "manager" | "evidence_reviewer");
                        const sessionLabel = encodeMeetingIdentitySessionLabel({
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
                        const existing = recovered.sessionOwnership.find(
                            (candidate) => candidate.sessionId === base.sessionId
                        );
                        if (
                            existing &&
                            (existing.id !== base.id ||
                                existing.meetingId !== base.meetingId ||
                                existing.identityId !== base.identityId ||
                                existing.parentSessionId !== base.parentSessionId ||
                                existing.sessionLabel !== base.sessionLabel ||
                                existing.provider !== base.provider ||
                                existing.role !== base.role ||
                                existing.capabilityStatus !== "active")
                        )
                            throw new Error("Persisted Meeting creation ownership is incompatible");
                        if (existing?.lifecycleStatus === "active") {
                            owned.push(existing);
                            continue;
                        }
                        owned.push(
                            existing ??
                                (await repository.recordSessionOwnership(
                                    {
                                        ...base,
                                        lifecycleStatus: "provisioning",
                                        capabilityStatus: "active"
                                    },
                                    now
                                ))
                        );
                        const started = await startMeetingIdentitySession({
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
                    return committed.result as unknown as MeetingCommandResult;
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
    return {
        create(command, context, meetingId, now, signal) {
            const inFlightKey = sha256Hex(
                encodeCanonicalJson([
                    meetingId,
                    context.caller.channel,
                    context.caller.principalId,
                    context.caller.sessionBindingId ?? "",
                    JSON.stringify(command.action)
                ])
            );
            const running = inFlight.get(inFlightKey);
            if (running) return running;
            const attempt = coordinator.create(command, context, meetingId, now, signal);
            inFlight.set(inFlightKey, attempt);
            const release = () => {
                if (inFlight.get(inFlightKey) === attempt) inFlight.delete(inFlightKey);
            };
            void attempt.then(release, release);
            return attempt;
        }
    };
}
