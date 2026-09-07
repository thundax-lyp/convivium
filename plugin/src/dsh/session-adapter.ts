import type { ToolRestriction } from "@deepseek-ai/dsh-tools";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type {
    ContinuableStart,
    ContinuableStartSpec,
    SubagentProvider,
    SubagentRuntime
} from "@deepseek-ai/dsh-subagent";
import type { SessionId } from "@deepseek-ai/dsh-session";
import type { MeetingOwnershipRecord } from "./caller-resolver.js";
import { encodeMeetingSessionLabel } from "./labels.js";
import {
    createSessionProvisioningEnvelope,
    serializeSessionProvisioningEnvelope
} from "./provisioning.js";

/**
 * Resolves the explicitly configured provider without creating or preparing a
 * child Session. Continuable creation remains restricted to later adapter
 * methods and profile smoke tests.
 */
export function requireContinuableProvider(
    providers: Pick<SubagentRuntime, "getProvider">,
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

export interface StartManagerSessionInput {
    readonly composition?: { readonly persona: string; readonly toolFilter?: ToolRestriction };
    readonly runtime: Pick<SubagentRuntime, "startContinuable">;
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
        request: {
            parent: input.parent,
            prompt,
            ...(input.composition === undefined
                ? {}
                : {
                      persona: input.composition.persona,
                      ...(input.composition.toolFilter === undefined
                          ? {}
                          : { toolFilter: structuredClone(input.composition.toolFilter) })
                  })
        },
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
    readonly composition?: { readonly persona: string; readonly toolFilter?: ToolRestriction };
    readonly runtime: Pick<SubagentRuntime, "startContinuable">;
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
        request: {
            parent: input.parent,
            prompt,
            ...(input.composition === undefined
                ? {}
                : {
                      persona: input.composition.persona,
                      ...(input.composition.toolFilter === undefined
                          ? {}
                          : { toolFilter: structuredClone(input.composition.toolFilter) })
                  })
        },
        signal: input.signal
    });
    if (started.childId !== input.childId) {
        throw new Error(
            "Continuable provider returned a Participant childId different from ownership."
        );
    }
    return started;
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
    readonly runtime: Pick<SubagentRuntime, "followup">;
    readonly parent: Agent;
    readonly ownership: MeetingOwnershipRecord;
    readonly attempt: SpeakerFollowupAttempt;
    readonly prompt: ContinuableStartSpec["request"]["prompt"];
    readonly signal: AbortSignal;
    readonly authorize: AuthorizeSpeakerFollowup;
}

export interface ManagerFollowupAttempt {
    readonly planningAttemptId: string;
    readonly deliveryId: string;
}

export interface AuthorizeManagerFollowupInput {
    readonly ownership: MeetingOwnershipRecord;
    readonly attempt: ManagerFollowupAttempt;
    readonly signal: AbortSignal;
}

export type AuthorizeManagerFollowup = (input: AuthorizeManagerFollowupInput) => Promise<void>;

export interface FollowupManagerSessionInput {
    readonly runtime: Pick<SubagentRuntime, "followup">;
    readonly parent: Agent;
    readonly ownership: MeetingOwnershipRecord;
    readonly attempt: ManagerFollowupAttempt;
    readonly prompt: ContinuableStartSpec["request"]["prompt"];
    readonly signal: AbortSignal;
    readonly authorize: AuthorizeManagerFollowup;
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

export interface FollowupMeetingTaskSessionInput {
    readonly runtime: Pick<SubagentRuntime, "followup">;
    readonly parent: Agent;
    readonly ownership: MeetingOwnershipRecord;
    readonly meetingTaskId: string;
    readonly deliveryId: string;
    readonly prompt: ContinuableStartSpec["request"]["prompt"];
    readonly signal: AbortSignal;
    readonly authorize: (phase: "before" | "after") => Promise<void>;
}

export interface FollowupMeetingMailSessionInput {
    readonly runtime: Pick<SubagentRuntime, "followup">;
    readonly parent: Agent;
    readonly ownership: MeetingOwnershipRecord;
    readonly participantId: string;
    readonly prompt: ContinuableStartSpec["request"]["prompt"];
    readonly signal: AbortSignal;
    readonly authorize: (phase: "before" | "after") => Promise<void>;
}

export async function followupMeetingMailSession(
    input: FollowupMeetingMailSessionInput
): Promise<ContinuableStart["messageId"]> {
    if (
        String(input.parent.id) !== input.ownership.parentSessionId ||
        input.ownership.role !== "participant" ||
        input.ownership.participantId !== input.participantId ||
        input.ownership.lifecycleStatus !== "active" ||
        input.ownership.capabilityStatus !== "active"
    ) {
        throw new Error("Meeting mail followup requires an active owned Participant Session.");
    }
    await input.authorize("before");
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
    await input.authorize("after");
    return messageId;
}

export async function followupMeetingTaskSession(
    input: FollowupMeetingTaskSessionInput
): Promise<ContinuableStart["messageId"]> {
    if (String(input.parent.id) !== input.ownership.parentSessionId)
        throw new Error("MeetingTask followup requires the exact live Captain parent.");
    if (
        input.ownership.role !== "participant" ||
        input.ownership.participantId === undefined ||
        input.ownership.lifecycleStatus !== "active" ||
        input.ownership.capabilityStatus !== "active"
    ) {
        throw new Error("MeetingTask followup requires an active Participant Session.");
    }
    await input.authorize("before");
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
    await input.authorize("after");
    return messageId;
}

export async function followupManagerSession(
    input: FollowupManagerSessionInput
): Promise<ContinuableStart["messageId"]> {
    if (String(input.parent.id) !== input.ownership.parentSessionId)
        throw new Error("Continuable followup requires the exact live Captain parent.");
    if (input.ownership.role !== "manager" || input.ownership.participantId !== undefined)
        throw new Error("Continuable followup ownership does not match the Manager attempt.");
    if (input.ownership.lifecycleStatus !== "active")
        throw new Error("Continuable followup requires an active owned Session.");
    if (input.ownership.capabilityStatus !== "active")
        throw new Error("Continuable followup requires a non-revoked Session capability.");

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

export {
    interruptAndDrainOwnedSessions,
    inspectOwnedSessions,
    proveArchiveOwnedChildren,
    type InterruptAndDrainOwnedSessionsInput,
    type ProveArchiveOwnedChildrenInput,
    type InspectOwnedSessionsInput,
    type OwnedSessionDiagnostic,
    type OwnedSessionInspection,
    type OwnedSessionObservation
} from "./session-ownership.js";
