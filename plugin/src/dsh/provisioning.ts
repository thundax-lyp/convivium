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

const instruction =
    "This message establishes your meeting identity only. You have no planning or speaker capability yet. Wait for a later request that includes attemptId and deliveryId before using any meeting write tool.";

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
        instruction
    };
}

export function serializeSessionProvisioningEnvelope(
    envelope: SessionProvisioningEnvelope
): string {
    return JSON.stringify(envelope);
}
