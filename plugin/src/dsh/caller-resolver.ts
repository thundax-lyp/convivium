import type { Agent } from "@deepseek-ai/dsh-agent";

import type { ProtocolErrorV1 } from "../protocol/index.js";
import { decodeMeetingSessionLabel } from "./labels.js";

export interface CaptainParentBinding {
    readonly kind: "captain";
    readonly sessionId: string;
}

export interface ResolvedMeetingCaller {
    readonly kind: "manager" | "participant";
    readonly sessionId: string;
    readonly teamId: string;
    readonly meetingId: string;
    readonly participantId?: string;
    readonly ownership: MeetingOwnershipRecord;
}

/**
 * The read-only shape supplied by the runtime's repository adapter. It is
 * structurally compatible with the repository's canonical SessionOwnership,
 * while keeping this DSH boundary independent of repository implementation.
 */
export interface MeetingOwnershipRecord {
    readonly sessionId: string;
    readonly parentSessionId: string;
    readonly sessionLabel: string;
    readonly provider: string;
    readonly initialMessageId?: string;
    readonly role: "manager" | "participant";
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

export function bindCaptainParent(agent: Agent): CaptainParentBinding {
    return { kind: "captain", sessionId: sessionIdOf(agent) };
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
        ...(ownership.role === "participant" ? { participantId: ownership.participantId } : {}),
        ownership
    };
}
