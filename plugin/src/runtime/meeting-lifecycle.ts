import { SessionPersistenceNotFoundError } from "@deepseek-ai/dsh-session-persistence";
import dshAgentPackage from "@deepseek-ai/dsh-agent/package.json" with { type: "json" };
import type { Context } from "@deepseek-ai/cordis";
import { randomUUID } from "node:crypto";
import type { Config } from "@/config.js";
import type { MeetingState } from "@/domain/index.js";
import type { MeetingCommand, ReadMeetingRequest } from "@/protocol/index.js";
import { MeetingCommandResultSchema } from "@/protocol/index.js";
import { projectMeetingSummary, projectMeetingView } from "@/projection/index.js";
import { decodeMeetingState, encodeMeetingState } from "@/repository/domain/meeting-state-codec.js";
import { DomainRepositoryRegistry } from "@/repository/domain/domain-repository-registry.js";
import { parseAgentDefinitions } from "@/role-composition/model.js";
import {
    createMeetingCommandApplication,
    DEADLINE_HANDLER_PRINCIPAL_ID,
    RUNTIME_RECOVERY_PRINCIPAL_ID,
    type MeetingCommandApplication
} from "./application-service/meeting-command.js";
import { createMeetingIdentityEffectHandler } from "./application-service/meeting-identity.js";
import { createMeetingCreationCoordinator } from "./meeting-runtime.js";
import { createMeetingAgentOwner, type RoleCatalogPort } from "@/dsh/index.js";
import type { MeetingOwnershipLookup } from "@/dsh/index.js";
import type { LocalMeetingWebRuntime } from "./index.js";
import { createOutboxWorker } from "./outbox-worker.js";
import { createMeetingNoticeDispatcher } from "./services/meeting-notice-dispatch.js";
import {
    createMeetingIdentityReader,
    type MeetingIdentityReader
} from "./services/meeting-identity-read.js";
import { createMeetingArchiveDispatcher } from "./services/meeting-archive.js";
import {
    createEvidenceReviewDispatcher,
    createReviewDeliveryDispatcher
} from "./services/evidence-review-dispatch.js";
import { provisionMeetingIdentity } from "./services/meeting-identity-provision.js";
import type { MeetingIdentityProvisionDependencies } from "./services/meeting-identity-provision.js";
import type { OutboxItem } from "@/repository/types.js";
import type { MeetingRepositoryPort } from "@/repository/meeting-repository-port.js";

export function createTargetMeetingEffectDispatcher(dependencies: {
    readonly identity: { dispatch(item: OutboxItem, signal: AbortSignal): Promise<void> };
    readonly notice: {
        dispatch(input: { outboxItem: OutboxItem; signal: AbortSignal }): Promise<void>;
    };
    readonly archive: {
        dispatch(input: { outboxItem: OutboxItem; signal: AbortSignal }): Promise<void>;
    };
    readonly review: {
        dispatch(input: { outboxItem: OutboxItem; signal: AbortSignal }): Promise<void>;
    };
    readonly reviewDelivery: {
        dispatch(input: { outboxItem: OutboxItem; signal: AbortSignal }): Promise<void>;
    };
}): (item: OutboxItem, signal: AbortSignal) => Promise<void> {
    return async (item, signal) => {
        const payload = item.payload as { kind?: string; noticeKind?: string };
        if (payload.kind === "identity_provision")
            return dependencies.identity.dispatch(item, signal);
        if (payload.kind === "agent_notice" && payload.noticeKind === "review_request")
            return dependencies.review.dispatch({
                outboxItem: item,
                signal
            });
        if (payload.kind === "agent_notice")
            return dependencies.notice.dispatch({
                outboxItem: item,
                signal
            });
        if (payload.kind === "archive")
            return dependencies.archive.dispatch({
                outboxItem: item,
                signal
            });
        if (payload.kind === "review_delivery")
            return dependencies.reviewDelivery.dispatch({
                outboxItem: item,
                signal
            });
        throw new Error("OUTBOX_ROUTE_UNAVAILABLE");
    };
}

export const recoverTargetMeetingDeliveries = async (dependencies: {
    readonly registry: Pick<DomainRepositoryRegistry<MeetingState>, "listMeetings" | "openMeeting">;
    readonly owner: import("@/dsh/index.js").MeetingAgentOwner;
    readonly definitions: readonly import("@/role-composition/model.js").MeetingAgentDefinition[];
    readonly ensureDelivery: (meetingId: string) => void | Promise<void>;
    readonly stopDelivery: (meetingId: string) => void | Promise<void>;
    readonly meetingId?: string;
    readonly now?: () => number;
    readonly onError?: (meetingId: string, error: unknown) => void;
}): Promise<void> => {
    const now = dependencies.now ?? Date.now;
    const signal = new AbortController().signal;
    const binding = ({
        createdAt: _created,
        updatedAt: _updated,
        ...input
    }: import("@/repository/types.js").SessionOwnership) => input;
    const definitionFor = (ownership: import("@/repository/types.js").SessionOwnership) => {
        const definition = dependencies.definitions.find(
            (d) =>
                d.agentDefinitionId === ownership.definition.agentDefinitionId &&
                d.definitionVersion === ownership.definition.definitionVersion
        );
        if (!definition) throw new Error("RECOVERY_UNAVAILABLE: definition missing");
        return definition;
    };
    for (const record of dependencies.registry.listMeetings()) {
        if (dependencies.meetingId !== undefined && dependencies.meetingId !== record.meetingId)
            continue;
        try {
            const repository = await dependencies.registry.openMeeting({
                meetingId: record.meetingId
            });
            let recovered = await repository.recover();
            if (recovered.sessionOwnership.some((o) => o.meetingId !== record.meetingId))
                throw new Error("RECOVERY_UNAVAILABLE: ownership mismatch");
            if (recovered.bootstrap.status === "creating") {
                try {
                    for (const ownership of recovered.sessionOwnership) {
                        if (ownership.lifecycleStatus === "active") continue;
                        const descriptor = recovered.preparedDescriptors.find(
                            (d) => d.descriptorId === ownership.descriptorId
                        );
                        if (!descriptor || descriptor.expiresAt <= now())
                            throw new Error("PREFLIGHT_EXPIRED");
                        await dependencies.owner.resume({
                            ownership,
                            definition: definitionFor(ownership),
                            purpose: "provisioning",
                            signal
                        });
                        await repository.recordSessionOwnership(
                            { ...binding(ownership), lifecycleStatus: "active" },
                            now(),
                            descriptor
                        );
                    }
                    await repository.completeCreate({
                        requestId: recovered.bootstrap.createRequestId,
                        requestHash: recovered.bootstrap.requestHash,
                        authorization: {
                            callerBinding: "loopback_remote:local-controller",
                            capabilityId: "local-controller"
                        }
                    });
                } catch {
                    // If completion committed but its response was lost, ready remains authoritative.
                    recovered = await repository.recover();
                    if (recovered.bootstrap.status !== "ready")
                        await repository.updateBootstrap({
                            status: "creation_failed",
                            failureCode: "RECOVERY_UNAVAILABLE",
                            now: now()
                        });
                }
                recovered = await repository.recover();
            }
            if (recovered.bootstrap.status === "creation_failed") {
                await dependencies.stopDelivery(record.meetingId);
                for (const ownership of recovered.sessionOwnership) {
                    if (ownership.lifecycleStatus === "closed") continue;
                    const revoked =
                        ownership.capabilityStatus === "revoked"
                            ? ownership
                            : await repository.recordSessionOwnership(
                                  { ...binding(ownership), capabilityStatus: "revoked" },
                                  now()
                              );
                    try {
                        await dependencies.owner.stop({
                            ownership: revoked,
                            definition: definitionFor(revoked),
                            reason: "creation_failed",
                            signal
                        });
                    } catch (error) {
                        if (
                            !(error instanceof SessionPersistenceNotFoundError) ||
                            revoked.lifecycleStatus !== "provisioning"
                        )
                            throw error;
                    }
                    await repository.recordSessionOwnership(
                        { ...binding(revoked), lifecycleStatus: "closed" },
                        now()
                    );
                }
                continue;
            }
            const snapshot = recovered.snapshot;
            if (!snapshot) throw new Error("RECOVERY_UNAVAILABLE: snapshot missing");
            const status = snapshot.state.lifecycle.status;
            if (status === "paused" || status === "archived") {
                await dependencies.stopDelivery(record.meetingId);
                for (const ownership of recovered.sessionOwnership)
                    await dependencies.owner.suspend({ ownership, reason: `Meeting ${status}` });
                continue;
            }
            if (status === "terminal" || status === "archiving") {
                for (const ownership of recovered.sessionOwnership) {
                    if (ownership.capabilityStatus === "active")
                        await repository.recordSessionOwnership(
                            { ...binding(ownership), capabilityStatus: "revoked" },
                            now()
                        );
                }
            } else {
                try {
                    for (const identity of snapshot.state.identities) {
                        const ownership = recovered.sessionOwnership.find(
                            (o) =>
                                o.id === identity.sessionOwnershipId && o.identityId === identity.id
                        );
                        if (
                            !ownership ||
                            ownership.lifecycleStatus !== "active" ||
                            ownership.capabilityStatus !== "active"
                        )
                            throw new Error(
                                "RECOVERY_UNAVAILABLE: active identity ownership missing"
                            );
                        await dependencies.owner.resume({
                            ownership,
                            definition: definitionFor(ownership),
                            purpose: "delivery",
                            signal
                        });
                    }
                } catch (error) {
                    await dependencies.stopDelivery(record.meetingId);
                    for (const ownership of recovered.sessionOwnership)
                        await dependencies.owner.suspend({
                            ownership,
                            reason: "Meeting recovery failed"
                        });
                    throw error;
                }
            }
            await dependencies.ensureDelivery(record.meetingId);
        } catch (error) {
            if (!dependencies.onError) throw error;
            dependencies.onError(record.meetingId, error);
        }
    }
};

const createIdentityProvisionOwner = (dependencies: {
    repository: MeetingRepositoryPort<MeetingState>;
    agents: import("@/dsh/index.js").MeetingAgentOwner;
    definitions: readonly import("@/role-composition/model.js").MeetingAgentDefinition[];
}): MeetingIdentityProvisionDependencies["owner"] => {
    const { repository, agents, definitions } = dependencies;
    const inputOwnership = ({
        createdAt: _created,
        updatedAt: _updated,
        ...input
    }: import("@/repository/types.js").SessionOwnership) => input;
    return {
        readOwnership: async (admissionId) =>
            (await repository.recover()).sessionOwnership.find(
                (o) => o.admissionId === admissionId
            ),
        readDescriptor: async (descriptorId) =>
            (await repository.recover()).preparedDescriptors.find(
                (d) => d.descriptorId === descriptorId
            ),
        putProvisioning: (owner, descriptor) =>
            repository.recordSessionOwnership(owner, Date.now(), descriptor),
        markActive: (owner, descriptor) =>
            repository.recordSessionOwnership(
                { ...inputOwnership(owner), lifecycleStatus: "active" },
                Date.now(),
                descriptor
            ),
        revokeAndDrainOwned: async (owner) => {
            const revoked = await repository.recordSessionOwnership(
                { ...inputOwnership(owner), capabilityStatus: "revoked" },
                Date.now()
            );
            const definition = definitions.find(
                (d) =>
                    d.agentDefinitionId === owner.definition.agentDefinitionId &&
                    d.definitionVersion === owner.definition.definitionVersion
            );
            if (!definition) throw new Error("RECOVERY_UNAVAILABLE");
            try {
                await agents.stop({
                    ownership: revoked,
                    definition,
                    reason: "admission_failed",
                    signal: new AbortController().signal
                });
            } catch (error) {
                if (!(error instanceof SessionPersistenceNotFoundError)) throw error;
            }
            await repository.recordSessionOwnership(
                { ...inputOwnership(revoked), lifecycleStatus: "closed" },
                Date.now()
            );
        }
    };
};

const applications = new WeakMap<object, MeetingCommandApplication>();
const runtimes = new WeakMap<object, LocalMeetingWebRuntime & MeetingOwnershipLookup>();
const identityReaders = new WeakMap<object, MeetingIdentityReader>();
function assertTargetLifecycle(config: Config, ctx: Pick<Context, "subagents">): void {
    if (dshAgentPackage.version !== "0.1.2-rc.1")
        throw new Error("Convivium requires DSH version 0.1.2-rc.1.");
    const spawn = ctx.subagents.getProvider("spawn");
    if (!spawn || spawn.name !== "spawn" || spawn.capabilities.outputSchema !== true)
        throw new Error('Convivium requires one-shot provider "spawn" with outputSchema.');
    const definitions = parseAgentDefinitions(config.agentDefinitions);
    const expected = new Set([
        "meeting_manager",
        "domain_architect",
        "runtime_engineer",
        "protocol_ui_engineer",
        "verification_reviewer",
        "github_research_analyst",
        "arxiv_research_analyst"
    ]);
    if (
        definitions.length !== 7 ||
        new Set(definitions.map((item) => item.roleDefinitionId)).size !== 7 ||
        definitions.some((item) => !expected.has(item.roleDefinitionId))
    )
        throw new Error("Convivium requires the exact seven enabled Meeting role definitions.");
}

export function getMeetingCommandApplication(owner: object): MeetingCommandApplication {
    const application = applications.get(owner);
    if (!application) throw new Error("Target Meeting application is not active.");
    return application;
}

export function getLocalMeetingWebRuntime(
    owner: object
): LocalMeetingWebRuntime & MeetingOwnershipLookup {
    const runtime = runtimes.get(owner);
    if (!runtime) throw new Error("Target Meeting runtime is not active.");
    return runtime;
}

export const getMeetingIdentityReader = (owner: object): MeetingIdentityReader => {
    const reader = identityReaders.get(owner);
    if (!reader) throw new Error("Target Meeting identity reader is not active.");
    return reader;
};

const createCallerScopeResolver =
    (registry: DomainRepositoryRegistry<MeetingState>) =>
    async (input: {
        meetingId: string;
        caller: {
            channel:
                | "dsh_tool"
                | "loopback_remote"
                | "skill_invocation"
                | "runtime_recovery"
                | "deadline_handler";
            principalId: string;
            sessionBindingId?: string;
        };
    }) => {
        if (input.caller.channel === "loopback_remote") {
            if (
                input.caller.principalId !== "local-controller" ||
                input.caller.sessionBindingId !== undefined
            )
                return undefined;
            return {
                caller: input.caller,
                meetingId: input.meetingId,
                role: "captain" as const
            };
        }
        if (
            (input.caller.channel === "runtime_recovery" &&
                input.caller.principalId === RUNTIME_RECOVERY_PRINCIPAL_ID) ||
            (input.caller.channel === "deadline_handler" &&
                input.caller.principalId === DEADLINE_HANDLER_PRINCIPAL_ID)
        )
            return {
                caller: input.caller,
                meetingId: input.meetingId,
                role: "runtime" as const
            };
        if (input.caller.channel !== "dsh_tool" || input.caller.sessionBindingId === undefined)
            return undefined;
        const repository = await registry.openMeeting({ meetingId: input.meetingId });
        const recovery = await repository.recover();
        const ownership = recovery.sessionOwnership.find(
            (item) =>
                item.id === input.caller.sessionBindingId &&
                item.identityId === input.caller.principalId &&
                item.lifecycleStatus === "active" &&
                item.capabilityStatus === "active"
        );
        if (!ownership || !ownership.identityId) return undefined;
        return {
            caller: input.caller,
            meetingId: input.meetingId,
            identityId: ownership.identityId,
            role: ownership.role === "participant" ? ("participant" as const) : ownership.role,
            ownership
        };
    };

export const activateTargetMeetingApplication = async (
    ctx: Context,
    config: Config,
    options: { rolePackageRoot: string }
): Promise<() => Promise<void>> => {
    const { rolePackageRoot } = options;
    if (!rolePackageRoot) throw new Error("Meeting role package root is required.");
    assertTargetLifecycle(config, ctx);
    let sequence = 0;
    const refreshListeners = new Set<(meetingId: string, committedVersion: number) => void>();
    const registry = await DomainRepositoryRegistry.open<MeetingState>({
        storageDomain: ctx.storageDomain,
        codec: { encode: encodeMeetingState, decode: decodeMeetingState },
        authorizationValidator: {
            validateCreate: () => undefined,
            validateCommand: () => undefined
        },
        onProjectionCommitted: (snapshot) => {
            for (const listener of refreshListeners) listener(snapshot.meetingId, snapshot.version);
        }
    });
    const definitions = parseAgentDefinitions(config.agentDefinitions);
    const ids = { nextId: (kind: string) => `${kind}-${++sequence}-${randomUUID()}` };
    const catalog: RoleCatalogPort = {
        readSnapshot: async (request) => {
            const producer = (ctx as Context & { get?: (key: string) => unknown }).get?.(
                "convivium.agentCatalog"
            ) as RoleCatalogPort | undefined;
            return producer
                ? producer.readSnapshot(request)
                : {
                      kind: "rejected",
                      error: {
                          code: "CATALOG_UNAVAILABLE",
                          message: "Meeting role catalog is unavailable"
                      }
                  };
        }
    };
    const resolveCallerScope = createCallerScopeResolver(registry);
    const agentOwner = createMeetingAgentOwner({ ctx, packageRoot: rolePackageRoot });
    const application = createMeetingCommandApplication({
        registry,
        ids,
        clock: { now: Date.now },
        resolveCallerScope,
        catalog,
        creation: createMeetingCreationCoordinator({
            registry,
            definitions,
            agentModelOverrides: config.agentModelOverrides,
            ctx,
            owner: agentOwner,
            packageRoot: rolePackageRoot,
            cwd: process.cwd()
        })
    });
    const identityReader = createMeetingIdentityReader({
        registry,
        catalog
    });
    const deliveryWorkers = new Map<string, ReturnType<typeof createOutboxWorker>>();
    const ensureDelivery = async (meetingId: string): Promise<void> => {
        const repository = await registry.openMeeting({ meetingId });
        const existing = deliveryWorkers.get(meetingId);
        if (existing) {
            existing.wake();
            return;
        }
        const notice = createMeetingNoticeDispatcher({
            owner: agentOwner,
            definitions,
            repository
        });
        const archive = createMeetingArchiveDispatcher({
            owner: agentOwner,
            definitions,
            repository,
            application
        });
        const review = createEvidenceReviewDispatcher({
            owner: agentOwner,
            definitions,
            repository,
            application,
            clock: { now: Date.now }
        });
        const reviewDelivery = createReviewDeliveryDispatcher({
            owner: agentOwner,
            definitions,
            repository,
            application
        });
        const identityOwner = createIdentityProvisionOwner({
            repository,
            agents: agentOwner,
            definitions
        });
        const identity = createMeetingIdentityEffectHandler({
            application,
            repository,
            definitions,
            provision: (input) =>
                provisionMeetingIdentity(input, {
                    definitions,
                    agentModelOverrides: config.agentModelOverrides,
                    ctx,
                    packageRoot: rolePackageRoot,
                    cwd: process.cwd(),
                    agents: agentOwner,
                    now: Date.now,
                    owner: identityOwner
                }),
            activateProvisioned: async (recommendationId, signal) => {
                const ownership = await identityOwner.readOwnership(recommendationId);
                const state = await repository.read();
                if (
                    !ownership ||
                    state.state.lifecycle.status !== "running" ||
                    !state.state.identities.some(
                        (i) =>
                            i.id === ownership.identityId && i.sessionOwnershipId === ownership.id
                    )
                )
                    throw new Error("INVALID_STATE");
                const definition = definitions.find(
                    (d) =>
                        d.agentDefinitionId === ownership.definition.agentDefinitionId &&
                        d.definitionVersion === ownership.definition.definitionVersion
                );
                if (!definition) throw new Error("RECOVERY_UNAVAILABLE");
                await agentOwner.resume({ ownership, definition, purpose: "delivery", signal });
            },
            cleanupProvisioned: async (recommendationId) => {
                const ownership = await identityOwner.readOwnership(recommendationId);
                if (ownership !== undefined) await identityOwner.revokeAndDrainOwned(ownership);
            }
        });
        const dispatch = createTargetMeetingEffectDispatcher({
            identity,
            notice,
            archive,
            review,
            reviewDelivery
        });
        const worker = createOutboxWorker({
            repository,
            owner: `target-worker:${meetingId}`,
            ttlMs: 60_000,
            batchSize: 1,
            pollMs: 1_000,
            dispatch
        });
        deliveryWorkers.set(meetingId, worker);
        void worker.start().catch(() => undefined);
    };
    const stopDelivery = async (meetingId: string) => {
        const worker = deliveryWorkers.get(meetingId);
        if (!worker) return;
        worker.stop();
        await worker.wait();
        deliveryWorkers.delete(meetingId);
    };
    const reconcile = (meetingId?: string) =>
        recoverTargetMeetingDeliveries({
            registry,
            owner: agentOwner,
            definitions,
            ensureDelivery,
            stopDelivery,
            ...(meetingId === undefined ? {} : { meetingId }),
            onError: (id, error) => {
                ctx.logger("convivium:meeting").error("Meeting %s recovery failed %o", id, error);
            }
        });
    await reconcile();
    const runtime = {
        async list(signal: AbortSignal) {
            signal.throwIfAborted();
            const meetings = [];
            for (const record of registry.listMeetings()) {
                const repository = await registry.openMeeting({ meetingId: record.meetingId });
                const snapshot = (await repository.recover()).snapshot;
                if (!snapshot) throw new Error("Meeting is not ready.");
                meetings.push(projectMeetingSummary(snapshot));
            }
            return { meetings };
        },
        async read(request: ReadMeetingRequest, signal: AbortSignal) {
            signal.throwIfAborted();
            const repository = await registry.openMeeting({ meetingId: request.meetingId });
            const snapshot = (await repository.recover()).snapshot;
            if (!snapshot) throw new Error("Meeting is not ready.");
            return projectMeetingView(snapshot, { kind: "captain" });
        },
        async control(command: MeetingCommand, signal: AbortSignal) {
            if (
                ![
                    "create_meeting",
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
                ].includes(command.action.kind)
            )
                return MeetingCommandResultSchema.parse({
                    kind: "rejected",
                    error: {
                        code: "UNAUTHORIZED",
                        message: "The action is not a local Meeting control."
                    }
                });
            const result = await application.execute(
                command,
                {
                    caller: { channel: "loopback_remote", principalId: "local-controller" }
                },
                signal
            );
            if (result.kind === "accepted") await reconcile(result.meetingId);
            return result;
        },
        async startFromSkill(command: MeetingCommand, signal: AbortSignal) {
            if (command.action.kind !== "create_meeting")
                return MeetingCommandResultSchema.parse({
                    kind: "rejected",
                    error: { code: "UNAUTHORIZED", message: "Only Meeting creation is delegated" }
                });
            const result = await application.execute(
                command,
                { caller: { channel: "skill_invocation", principalId: "local-controller" } },
                signal
            );
            if (result.kind === "accepted") await reconcile(result.meetingId);
            return result;
        },
        async *subscribeRefresh(signal: AbortSignal) {
            const notices: { meetingId: string; committedVersion: number }[] = [];
            let wake: (() => void) | undefined;
            const listener = (meetingId: string, committedVersion: number) => {
                notices.push({ meetingId, committedVersion });
                wake?.();
            };
            refreshListeners.add(listener);
            try {
                while (!signal.aborted) {
                    if (notices.length === 0)
                        await new Promise<void>((resolve) => {
                            wake = resolve;
                            signal.addEventListener("abort", () => resolve(), { once: true });
                        });
                    while (notices.length > 0) yield { kind: "refresh", ...notices.shift()! };
                }
            } finally {
                refreshListeners.delete(listener);
                wake = undefined;
            }
        },
        async findBySessionId(sessionId: string, signal: AbortSignal) {
            signal.throwIfAborted();
            for (const record of registry.listMeetings()) {
                const repository = await registry.openMeeting({ meetingId: record.meetingId });
                const ownership = (await repository.recover()).sessionOwnership.find(
                    (item) => item.sessionId === sessionId
                );
                if (ownership) return { meetingId: record.meetingId, ownership };
            }
            return undefined;
        }
    } satisfies LocalMeetingWebRuntime & MeetingOwnershipLookup;
    applications.set(ctx, application);
    runtimes.set(ctx, runtime);
    identityReaders.set(ctx, identityReader);
    return async () => {
        for (const worker of deliveryWorkers.values()) worker.stop();
        await Promise.all([...deliveryWorkers.values()].map((worker) => worker.wait()));
        deliveryWorkers.clear();
        runtimes.delete(ctx);
        identityReaders.delete(ctx);
        applications.delete(ctx);
        refreshListeners.clear();
        await agentOwner.disposeAll();
        await registry.close();
    };
};
