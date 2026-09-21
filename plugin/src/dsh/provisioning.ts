export interface SessionProvisioningEnvelope {
    readonly kind: "convivium.session.provisioning";
    readonly version: 1;
    readonly meetingId: string;
    readonly teamId: string;
    readonly role: "manager" | "participant";
    readonly participantId?: string;
    readonly capability: "none";
    readonly instruction: string;
}

export interface MeetingIdentityProvisioningEnvelope {
    readonly kind: "convivium.meeting-identity.provisioning";
    readonly version: 1;
    readonly role: "manager" | "evidence_reviewer" | "participant";
    readonly meetingId: string;
    readonly identityId: string;
    readonly capability: "none";
    readonly instruction: string;
}

const identitySegment = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const meetingIdentityInstruction =
    "This message establishes your Meeting identity only and grants no work capability. Wait for a formal Meeting notice before acting.";

export function createMeetingIdentityProvisioningEnvelopeV1(input: {
    readonly role: MeetingIdentityProvisioningEnvelope["role"];
    readonly meetingId: string;
    readonly identityId: string;
}): MeetingIdentityProvisioningEnvelope {
    if (
        !["manager", "evidence_reviewer", "participant"].includes(input.role) ||
        !identitySegment.test(input.meetingId) ||
        !identitySegment.test(input.identityId)
    )
        throw new TypeError(
            "A Meeting identity provisioning envelope requires unambiguous Meeting and identity IDs."
        );
    return {
        kind: "convivium.meeting-identity.provisioning",
        version: 1,
        role: input.role,
        meetingId: input.meetingId,
        identityId: input.identityId,
        capability: "none",
        instruction: meetingIdentityInstruction
    };
}

export function serializeMeetingIdentityProvisioningEnvelopeV1(
    envelope: MeetingIdentityProvisioningEnvelope
): string {
    return JSON.stringify(envelope);
}

const managerInstruction =
    "This message establishes your meeting identity only and grants no work capability. Wait for a formal contribution planning notice with deliveryId before assigning or reviewing work.";

const participantInstruction =
    "This message establishes your meeting identity only and grants no work capability. Wait for a formal contribution task with contributionId, generation and deliveryId before preparing or reviewing work.";

export function createSessionProvisioningEnvelope(input: {
    readonly teamId: string;
    readonly meetingId: string;
    readonly role: "manager" | "participant";
    readonly participantId?: string;
}): SessionProvisioningEnvelope {
    if (!input.teamId || !input.meetingId) {
        throw new TypeError("A provisioning envelope requires teamId and meetingId.");
    }
    if (input.role === "manager" && input.participantId !== undefined) {
        throw new TypeError("A manager provisioning envelope cannot carry participantId.");
    }
    if (input.role === "participant" && !input.participantId) {
        throw new TypeError("A participant provisioning envelope requires participantId.");
    }

    return {
        kind: "convivium.session.provisioning",
        version: 1,
        meetingId: input.meetingId,
        teamId: input.teamId,
        role: input.role,
        ...(input.role === "participant" ? { participantId: input.participantId } : {}),
        capability: "none",
        instruction: input.role === "manager" ? managerInstruction : participantInstruction
    };
}

export function serializeSessionProvisioningEnvelope(
    envelope: SessionProvisioningEnvelope
): string {
    return JSON.stringify(envelope);
}
