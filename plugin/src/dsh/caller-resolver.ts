import type { AgentDefinitionBindingV1 } from "@/role-composition/model.js";
import type { Agent } from "@deepseek-ai/dsh-agent";

import type { ProtocolErrorV1 } from "@/protocol/index.js";
import { decodeMeetingSessionLabel } from "./labels.js";
import { isActiveMeetingIdentityOwnershipV1 } from "./session-ownership.js";

export interface ResolvedMeetingCaller {
    readonly kind: "manager" | "evidence_reviewer" | "participant";
    readonly sessionId: string;
    readonly teamId: string;
    readonly meetingId: string;
    readonly participantId?: string;
    readonly identityId?: string;
    readonly ownership: MeetingOwnershipRecord;
}

/**
 * The read-only shape supplied by the runtime's repository adapter. It is
 * structurally compatible with the repository's canonical SessionOwnership,
 * while keeping this DSH boundary independent of repository implementation.
 */
export interface MeetingOwnershipRecord {
    readonly id?: string;
    readonly meetingId?: string;
    readonly identityId?: string;
    readonly lastClosureFailureCode?: string;
    readonly agentDefinition?: AgentDefinitionBindingV1;
    readonly sessionId: string;
    readonly parentSessionId: string;
    readonly sessionLabel: string;
    readonly provider: string;
    readonly initialMessageId?: string;
    readonly supersededBySessionId?: string;
    readonly role: "manager" | "evidence_reviewer" | "participant";
    readonly participantId?: string;
    readonly lifecycleStatus: "provisioning" | "active" | "closed";
    readonly capabilityStatus: "active" | "revoked";
    readonly createdAt: number;
    readonly updatedAt: number;
}

export interface MeetingOwnershipLookup {
    findBySessionId(
        sessionId: string,
        signal: AbortSignal
    ): Promise<
        | {
              readonly teamId: string;
              readonly meetingId: string;
              readonly ownership: MeetingOwnershipRecord;
          }
        | undefined
    >;
}

export interface MeetingOwnershipLookupV1 {
    findBySessionId(
        sessionId: string,
        signal: AbortSignal
    ): Promise<
        | {
              readonly meetingId: string;
              readonly ownership: MeetingOwnershipRecord;
          }
        | undefined
    >;
}

export interface ResolvedMeetingCallerV1 {
    readonly caller: {
        readonly channel: "dsh_tool";
        readonly principalId: string;
        readonly sessionBindingId: string;
    };
    readonly meetingId: string;
    readonly identityId: string;
    readonly role: MeetingOwnershipRecord["role"];
    readonly ownership: MeetingOwnershipRecord;
}

export async function resolveMeetingCallerV1(
    agent: Agent,
    lookup: MeetingOwnershipLookupV1,
    signal: AbortSignal
): Promise<ResolvedMeetingCallerV1 | undefined> {
    const sessionId = sessionIdOf(agent);
    const found = await lookup.findBySessionId(sessionId, signal);
    if (
        !found ||
        !isActiveMeetingIdentityOwnershipV1({
            ownership: found.ownership,
            meetingId: found.meetingId,
            sessionId
        })
    )
        return undefined;
    const ownershipId = found.ownership.id!;
    const identityId = found.ownership.identityId!;
    return {
        caller: {
            channel: "dsh_tool",
            principalId: identityId,
            sessionBindingId: ownershipId
        },
        meetingId: found.meetingId,
        identityId,
        role: found.ownership.role,
        ownership: found.ownership
    };
}

function unauthorized(message: string): ProtocolErrorV1 {
    return {
        protocolVersion: 1,
        ok: false,
        code: "UNAUTHORIZED_CALLER",
        message,
        retryable: false
    };
}

function sessionIdOf(agent: Agent): string {
    return String(agent.id);
}

export async function resolveMeetingCaller(
    agent: Agent,
    lookup: MeetingOwnershipLookup,
    signal: AbortSignal
): Promise<ResolvedMeetingCaller | ProtocolErrorV1> {
    const sessionId = sessionIdOf(agent);
    const found = await lookup.findBySessionId(sessionId, signal);
    if (found === undefined || found.ownership.sessionId !== sessionId) {
        return unauthorized("The caller is not an owned meeting Session.");
    }

    const { ownership } = found;
    const hasTargetOwnership =
        ownership.id !== undefined ||
        ownership.meetingId !== undefined ||
        ownership.identityId !== undefined;
    if (hasTargetOwnership) {
        if (
            ownership.id === undefined ||
            ownership.meetingId === undefined ||
            ownership.identityId === undefined ||
            ownership.meetingId !== found.meetingId ||
            ownership.identityId.trim() === ""
        )
            return unauthorized("The caller Session ownership cannot be verified.");
    } else {
        const label = decodeMeetingSessionLabel(ownership.sessionLabel);
        if (
            label === undefined ||
            label.teamId !== found.teamId ||
            label.meetingId !== found.meetingId ||
            label.role !== ownership.role ||
            (label.role === "participant" && label.participantId !== ownership.participantId) ||
            (label.role === "manager" && ownership.participantId !== undefined)
        ) {
            return unauthorized("The caller Session ownership cannot be verified.");
        }
    }
    if (ownership.lifecycleStatus !== "active") {
        return unauthorized("The caller Session is not active.");
    }
    if (ownership.capabilityStatus !== "active") {
        return unauthorized("The caller Session capability has been revoked.");
    }

    return {
        kind: ownership.role,
        sessionId,
        teamId: found.teamId,
        meetingId: found.meetingId,
        ...(hasTargetOwnership ? { identityId: ownership.identityId } : {}),
        ...(ownership.role === "participant" ? { participantId: ownership.participantId } : {}),
        ownership
    };
}
