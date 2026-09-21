const LABEL_PREFIX = "convivium";
const MANAGER_KIND = "meeting-manager";
const PARTICIPANT_KIND = "meeting-participant";

const identitySegment = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MEETING_IDENTITY_KIND = "meeting-identity";

export interface MeetingIdentitySessionLabel {
    readonly role: "manager" | "evidence_reviewer" | "participant";
    readonly meetingId: string;
    readonly identityId: string;
}

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

function assertTargetMeetingIdentity(value: MeetingIdentitySessionLabel): void {
    if (!["manager", "evidence_reviewer", "participant"].includes(value.role))
        throw new TypeError("role must be a Meeting identity role.");
    assertIdentitySegment(value.meetingId, "meetingId");
    assertIdentitySegment(value.identityId, "identityId");
}

export function encodeMeetingIdentitySessionLabelV1(value: MeetingIdentitySessionLabel): string {
    assertTargetMeetingIdentity(value);
    return `${LABEL_PREFIX}:${MEETING_IDENTITY_KIND}:${value.role}:${value.meetingId}:${value.identityId}`;
}

export function decodeMeetingIdentitySessionLabelV1(
    label: string
): MeetingIdentitySessionLabel | undefined {
    const parts = label.split(":");
    if (
        parts.length !== 5 ||
        parts[0] !== LABEL_PREFIX ||
        parts[1] !== MEETING_IDENTITY_KIND ||
        !["manager", "evidence_reviewer", "participant"].includes(parts[2] ?? "")
    )
        return undefined;
    const value: MeetingIdentitySessionLabel = {
        role: parts[2] as MeetingIdentitySessionLabel["role"],
        meetingId: parts[3] ?? "",
        identityId: parts[4] ?? ""
    };
    try {
        assertTargetMeetingIdentity(value);
        return value;
    } catch {
        return undefined;
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
