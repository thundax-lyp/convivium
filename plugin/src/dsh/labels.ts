const LABEL_PREFIX = "convivium";
const MANAGER_KIND = "meeting-manager";
const PARTICIPANT_KIND = "meeting-participant";

const identitySegment = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface ManagerSessionLabel {
    readonly role: "manager";
    readonly teamId: string;
    readonly meetingId: string;
}

export interface ParticipantSessionLabel {
    readonly role: "participant";
    readonly teamId: string;
    readonly meetingId: string;
    readonly participantId: string;
}

export type MeetingSessionLabel = ManagerSessionLabel | ParticipantSessionLabel;

function assertIdentitySegment(value: string, field: string): void {
    if (!identitySegment.test(value)) {
        throw new TypeError(`${field} must be a non-empty unambiguous identity segment.`);
    }
}

function assertMeetingIdentity(value: Pick<MeetingSessionLabel, "teamId" | "meetingId">): void {
    assertIdentitySegment(value.teamId, "teamId");
    assertIdentitySegment(value.meetingId, "meetingId");
}

function assertParticipantIdentity(value: ParticipantSessionLabel): void {
    assertMeetingIdentity(value);
    assertIdentitySegment(value.participantId, "participantId");
}

export function encodeMeetingSessionLabel(value: MeetingSessionLabel): string {
    if (value.role === "manager") {
        assertMeetingIdentity(value);
        return `${LABEL_PREFIX}:${MANAGER_KIND}:${value.teamId}:${value.meetingId}`;
    }

    assertParticipantIdentity(value);
    return `${LABEL_PREFIX}:${PARTICIPANT_KIND}:${value.teamId}:${value.meetingId}:${value.participantId}`;
}

export function decodeMeetingSessionLabel(label: string): MeetingSessionLabel | undefined {
    const parts = label.split(":");
    if (parts[0] !== LABEL_PREFIX) return undefined;

    try {
        if (parts[1] === MANAGER_KIND && parts.length === 4) {
            const value: ManagerSessionLabel = {
                role: "manager",
                teamId: parts[2] ?? "",
                meetingId: parts[3] ?? ""
            };
            assertMeetingIdentity(value);
            return value;
        }
        if (parts[1] === PARTICIPANT_KIND && parts.length === 5) {
            const value: ParticipantSessionLabel = {
                role: "participant",
                teamId: parts[2] ?? "",
                meetingId: parts[3] ?? "",
                participantId: parts[4] ?? ""
            };
            assertParticipantIdentity(value);
            return value;
        }
    } catch {
        return undefined;
    }

    return undefined;
}
