const LABEL_PREFIX = "convivium";

const identitySegment = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MEETING_IDENTITY_KIND = "meeting-identity";

export interface MeetingIdentitySessionLabel {
    readonly role: "manager" | "evidence_reviewer" | "participant";
    readonly meetingId: string;
    readonly identityId: string;
}

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

export function encodeMeetingIdentitySessionLabel(value: MeetingIdentitySessionLabel): string {
    assertTargetMeetingIdentity(value);
    return `${LABEL_PREFIX}:${MEETING_IDENTITY_KIND}:${value.role}:${value.meetingId}:${value.identityId}`;
}

export function decodeMeetingIdentitySessionLabel(
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
