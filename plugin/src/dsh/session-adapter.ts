import type { Agent } from "@deepseek-ai/dsh-agent";
import type {
    ContinuableStart,
    ContinuableStartSpec,
    SubagentFollowupOptions,
    SubagentInterruptAuthority,
    SubagentProvider
} from "@deepseek-ai/dsh-subagent";
import type { SessionId } from "@deepseek-ai/dsh-session";
import type { MeetingOwnershipRecord } from "./caller-resolver.js";
import { encodeMeetingSessionLabel } from "./labels.js";
import {
    createSessionProvisioningEnvelope,
    serializeSessionProvisioningEnvelope
} from "./provisioning.js";

export interface SubagentProviderRegistry {
    getProvider(name: string): SubagentProvider | undefined;
}

/**
 * Resolves the explicitly configured provider without creating or preparing a
 * child Session. Continuable creation remains restricted to later adapter
 * methods and profile smoke tests.
 */
export function requireContinuableProvider(
    providers: SubagentProviderRegistry,
    providerName: string
): SubagentProvider {
    const provider = providers.getProvider(providerName);
    if (provider === undefined) {
        throw new Error(
            `Convivium requires continuable subagent provider "${providerName}" ` +
                "from the host DSH 0.1.1-rc.2 profile; it is not registered."
        );
    }
    if (typeof provider.prepareContinuable !== "function") {
        throw new Error(
            `Convivium requires provider "${providerName}" to implement prepareContinuable() ` +
                "in the host DSH 0.1.1-rc.2 profile."
        );
    }
    return provider;
}

export interface ContinuableStarter {
    startContinuable(spec: ContinuableStartSpec): Promise<ContinuableStart>;
}

export interface StartManagerSessionInput {
    readonly runtime: ContinuableStarter;
    readonly provider: string;
    readonly parent: Agent;
    readonly childId: SessionId;
    readonly teamId: string;
    readonly meetingId: string;
    readonly signal: AbortSignal;
}

export async function startManagerSession(
    input: StartManagerSessionInput
): Promise<ContinuableStart> {
    const label = encodeMeetingSessionLabel({
        role: "manager",
        teamId: input.teamId,
        meetingId: input.meetingId
    });
    const prompt: ContinuableStartSpec["request"]["prompt"] = [
        {
            type: "text",
            text: serializeSessionProvisioningEnvelope(
                createSessionProvisioningEnvelope({
                    role: "manager",
                    teamId: input.teamId,
                    meetingId: input.meetingId
                })
            )
        }
    ];
    const started = await input.runtime.startContinuable({
        provider: input.provider,
        label,
        childId: input.childId,
        request: { parent: input.parent, prompt },
        signal: input.signal
    });
    if (started.childId !== input.childId) {
        throw new Error(
            "Continuable provider returned a Manager childId different from ownership."
        );
    }
    return started;
}

export interface StartParticipantSessionInput {
    readonly runtime: ContinuableStarter;
    readonly provider: string;
    readonly parent: Agent;
    readonly childId: SessionId;
    readonly teamId: string;
    readonly meetingId: string;
    readonly participantId: string;
    readonly signal: AbortSignal;
}

export async function startParticipantSession(
    input: StartParticipantSessionInput
): Promise<ContinuableStart> {
    const label = encodeMeetingSessionLabel({
        role: "participant",
        teamId: input.teamId,
        meetingId: input.meetingId,
        participantId: input.participantId
    });
    const prompt: ContinuableStartSpec["request"]["prompt"] = [
        {
            type: "text",
            text: serializeSessionProvisioningEnvelope(
                createSessionProvisioningEnvelope({
                    role: "participant",
                    teamId: input.teamId,
                    meetingId: input.meetingId,
                    participantId: input.participantId
                })
            )
        }
    ];
    const started = await input.runtime.startContinuable({
        provider: input.provider,
        label,
        childId: input.childId,
        request: { parent: input.parent, prompt },
        signal: input.signal
    });
    if (started.childId !== input.childId) {
        throw new Error(
            "Continuable provider returned a Participant childId different from ownership."
        );
    }
    return started;
}

export interface ContinuableFollowupRuntime {
    followup(
        parent: Agent,
        childId: SessionId,
        content: ContinuableStartSpec["request"]["prompt"],
        options: SubagentFollowupOptions
    ): Promise<ContinuableStart["messageId"]>;
}

export interface SpeakerFollowupAttempt {
    readonly attemptId: string;
    readonly deliveryId: string;
    readonly participantId: string;
}

export interface AuthorizeSpeakerFollowupInput {
    readonly ownership: MeetingOwnershipRecord;
    readonly attempt: SpeakerFollowupAttempt;
    readonly signal: AbortSignal;
}

/**
 * The runtime supplies a transactionally current authorization check. It is
 * called immediately before and after inbox acceptance so a delivery that
 * races with capability revocation cannot be treated as a meeting fact.
 */
export type AuthorizeSpeakerFollowup = (input: AuthorizeSpeakerFollowupInput) => Promise<void>;

export interface FollowupParticipantSessionInput {
    readonly runtime: ContinuableFollowupRuntime;
    readonly parent: Agent;
    readonly ownership: MeetingOwnershipRecord;
    readonly attempt: SpeakerFollowupAttempt;
    readonly prompt: ContinuableStartSpec["request"]["prompt"];
    readonly signal: AbortSignal;
    readonly authorize: AuthorizeSpeakerFollowup;
}

function assertSpeakerFollowupOwnership(input: FollowupParticipantSessionInput): void {
    if (String(input.parent.id) !== input.ownership.parentSessionId) {
        throw new Error("Continuable followup requires the exact live Captain parent.");
    }
    if (
        input.ownership.role !== "participant" ||
        input.ownership.participantId !== input.attempt.participantId
    ) {
        throw new Error("Continuable followup ownership does not match the speaker attempt.");
    }
    if (input.ownership.lifecycleStatus !== "active") {
        throw new Error("Continuable followup requires an active owned Session.");
    }
    if (input.ownership.capabilityStatus !== "active") {
        throw new Error("Continuable followup requires a non-revoked Session capability.");
    }
}

export async function followupParticipantSession(
    input: FollowupParticipantSessionInput
): Promise<ContinuableStart["messageId"]> {
    assertSpeakerFollowupOwnership(input);
    const authorization = {
        ownership: input.ownership,
        attempt: input.attempt,
        signal: input.signal
    };
    await input.authorize(authorization);
    const messageId = await input.runtime.followup(
        input.parent,
        input.ownership.sessionId as SessionId,
        input.prompt,
        {
            source: {
                kind: "coordinator",
                form: "relay",
                senderSessionId: input.parent.id as SessionId
            },
            signal: input.signal
        }
    );
    await input.authorize(authorization);
    return messageId;
}

export interface ContinuableLifecycleRuntime {
    interrupt(targetSessionId: SessionId, authority: SubagentInterruptAuthority): void;
    drainContinuableChildren(parent: Agent, childIds: readonly SessionId[]): Promise<void>;
}

export interface InterruptAndDrainOwnedSessionsInput {
    readonly runtime: ContinuableLifecycleRuntime;
    readonly parent: Agent;
    readonly ownerships: readonly MeetingOwnershipRecord[];
}

function assertOwnedChildren(
    parent: Agent,
    ownerships: readonly MeetingOwnershipRecord[]
): readonly SessionId[] {
    const parentSessionId = String(parent.id);
    const childIds = new Set<string>();
    for (const ownership of ownerships) {
        if (ownership.parentSessionId !== parentSessionId) {
            throw new Error("Continuable cleanup requires the exact owned Captain parent.");
        }
        if (childIds.has(ownership.sessionId)) {
            throw new Error("Continuable cleanup cannot target one owned Session twice.");
        }
        childIds.add(ownership.sessionId);
    }
    return [...childIds] as SessionId[];
}

/**
 * Stops only explicitly verified direct children. DSH retains durable Session
 * data; Meeting Runtime separately revokes capability before requesting this
 * cleanup, so a future cold resume cannot regain meeting authority.
 */
export async function interruptAndDrainOwnedSessions(
    input: InterruptAndDrainOwnedSessionsInput
): Promise<void> {
    const childIds = assertOwnedChildren(input.parent, input.ownerships);
    for (const childId of childIds) {
        input.runtime.interrupt(childId, { kind: "ancestor", agent: input.parent });
    }
    await input.runtime.drainContinuableChildren(input.parent, childIds);
}
