import type { Agent } from "@deepseek-ai/dsh-agent";
import type { SessionOwnership } from "@/repository/types.js";
import { decodeMeetingIdentitySessionLabel } from "./labels.js";
export type MeetingOwnershipRecord = SessionOwnership;
const isActiveMeetingIdentityOwnership = (input: {
    readonly ownership: MeetingOwnershipRecord;
    readonly meetingId: string;
    readonly sessionId: string;
}): boolean => {
    const { ownership } = input;
    const label = decodeMeetingIdentitySessionLabel(ownership.sessionLabel);
    return (
        label !== undefined &&
        ownership.id !== undefined &&
        ownership.meetingId === input.meetingId &&
        ownership.identityId !== undefined &&
        ownership.sessionId === input.sessionId &&
        ownership.role === label.role &&
        ownership.meetingId === label.meetingId &&
        ownership.identityId === label.identityId &&
        ownership.lifecycleStatus === "active" &&
        ownership.capabilityStatus === "active"
    );
};
export interface MeetingOwnershipLookup {
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

export interface ResolvedMeetingCaller {
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

export const resolveMeetingCaller = async (
    agent: Agent,
    lookup: MeetingOwnershipLookup,
    signal: AbortSignal
): Promise<ResolvedMeetingCaller | undefined> => {
    const sessionId = String(agent.id);
    const found = await lookup.findBySessionId(sessionId, signal);
    if (
        !found ||
        !isActiveMeetingIdentityOwnership({
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
};
