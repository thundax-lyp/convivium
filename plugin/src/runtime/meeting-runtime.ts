import type { Agent } from "@deepseek-ai/dsh-agent";
import type { SessionId } from "@deepseek-ai/dsh-session";
import {
    createMeetingState,
    type CanonicalIdAllocator,
    type CreateContinuationSpec,
    type MeetingLimits
} from "../domain/index.js";
import {
    encodeMeetingSessionLabel,
    startManagerSession,
    startParticipantSession
} from "../dsh/index.js";
import type { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import { DomainRepositoryRegistry } from "../repository/domain/domain-repository-registry.js";
import type { DomainMeetingRepository } from "../repository/domain/domain-meeting-repository.js";
import type {
    CommandAuthorization,
    CreateMeetingInput,
    DomainEventInput,
    JsonObject
} from "../repository/types.js";
import type { MeetingRepositoryPort as MeetingRepositoryType } from "../repository/meeting-repository-port.js";
import type { RepositoryAuthorizationValidator } from "../repository/types.js";
import type { CreateMeetingInputV1 } from "../protocol/index.js";
import type { JsonValue } from "../repository/domain/canonical-json.js";

export interface MeetingRepositoryOpenInput {
    readonly registry: Promise<DomainRepositoryRegistry>;
    readonly teamId: string;
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
        teamId: input.teamId,
        meetingId: input.meetingId,
        ...(input.create === undefined ? {} : { create: input.create })
    });
}

export interface PreparedMeetingCreation {
    readonly state: ReturnType<typeof createMeetingState>;
    readonly createInput: CreateMeetingInput;
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
    await dependencies.repository.create(createInput);
    const ownerships: { sessionId: SessionId }[] = [];
    try {
        const managerId = dependencies.allocateSessionId("manager", "manager");
        const managerLabel = encodeMeetingSessionLabel({
            role: "manager",
            teamId: input.teamId,
            meetingId
        });
        await dependencies.repository.recordSessionOwnership({
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
            runtime: dependencies.continuable,
            provider: dependencies.provider,
            parent: dependencies.parent,
            childId: managerId,
            teamId: input.teamId,
            meetingId,
            signal: dependencies.signal
        });
        await dependencies.repository.recordSessionOwnership({
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
            const participantId = dependencies.allocateSessionId("participant", participant.id);
            const participantLabel = encodeMeetingSessionLabel({
                role: "participant",
                teamId: input.teamId,
                meetingId,
                participantId: participant.id
            });
            await dependencies.repository.recordSessionOwnership({
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
