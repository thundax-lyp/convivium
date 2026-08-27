import type { Agent } from "@deepseek-ai/dsh-agent";
import type { SessionId } from "@deepseek-ai/dsh-session";
import {
    createMeetingState,
    type CanonicalIdAllocator,
    type MeetingLimits
} from "../domain/index.js";
import {
    encodeMeetingSessionLabel,
    startManagerSession,
    startParticipantSession,
    type ContinuableStarter
} from "../dsh/index.js";
import {
    MeetingRepository,
    type CommandAuthorization,
    type CreateMeetingInput,
    type JsonObject,
    type MeetingRepository as MeetingRepositoryType
} from "../repository/index.js";
import type { DomainEventInput } from "../repository/index.js";
import type { CreateMeetingInputV1 } from "../protocol/index.js";

export type MeetingRepositoryOpenInput = Parameters<typeof MeetingRepository.open>[0];
export type MeetingRepositoryRuntime = MeetingRepositoryType;
export type RepositoryAuthorizationValidator =
    import("../repository/index.js").RepositoryAuthorizationValidator;
export type { DomainEventInput, JsonObject };

export async function openMeetingRepository(
    input: MeetingRepositoryOpenInput
): Promise<MeetingRepository> {
    return MeetingRepository.open(input);
}

export interface MeetingCreationRuntimeDependencies {
    readonly repository: Pick<
        MeetingRepository,
        | "meetingId"
        | "create"
        | "completeCreate"
        | "updateBootstrap"
        | "recordSessionOwnership"
        | "recover"
    >;
    readonly continuable: ContinuableStarter;
    readonly parent: Agent;
    readonly provider: string;
    readonly authorization: CommandAuthorization;
    readonly allocateSessionId: (role: "manager" | "participant", key: string) => SessionId;
    readonly cleanup?: (ownerships: readonly { sessionId: SessionId }[]) => Promise<void>;
    readonly promptVersion?: string;
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
    maxReplans: 1
};

function limits(input: CreateMeetingInputV1): MeetingLimits {
    return {
        ...defaultLimits,
        ...(input.limits ?? {})
    };
}

function requestHash(input: CreateMeetingInputV1): string {
    return JSON.stringify(input);
}

function authorizationInput(
    input: CreateMeetingInputV1,
    authorization: CommandAuthorization,
    initialState: Record<string, unknown>,
    now: number
): CreateMeetingInput {
    return {
        requestId: input.requestId,
        authorization,
        requestHash: requestHash(input),
        initialState: initialState as JsonObject,
        createdAt: now
    };
}

export async function createMeetingRuntime(
    input: CreateMeetingInputV1,
    dependencies: MeetingCreationRuntimeDependencies
) {
    const now = dependencies.now?.() ?? Date.now();
    const meetingId = dependencies.repository.meetingId;
    const allocator: CanonicalIdAllocator = {
        allocate: (kind, key) => `${kind}-${key}`
    };
    const state = createMeetingState(
        {
            meetingId,
            teamId: input.teamId,
            topic: input.topic,
            objective: input.objective,
            promptVersion: dependencies.promptVersion ?? "v1",
            objectiveContract: input.objectiveContract,
            agenda: input.agenda,
            participants: input.participants.map((participant) => ({
                key: participant.participantKey,
                sourceMemberName: participant.sourceMemberName,
                displayName: participant.displayName,
                role: participant.role
            })),
            continuation: input.continuation,
            selectionMode: input.selectionMode,
            limits: limits(input),
            createdAt: now
        },
        allocator
    );
    const createInput = authorizationInput(
        input,
        dependencies.authorization,
        state as unknown as Record<string, unknown>,
        now
    );
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
        await dependencies.repository.updateBootstrap({
            status: "creation_failed",
            failureCode: error instanceof Error ? error.name : "SESSION_CREATION_FAILED",
            now
        });
        if (dependencies.cleanup) await dependencies.cleanup(ownerships);
        throw error;
    }
}
