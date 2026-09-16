import { z } from "zod";
import { validateMeetingStateV1 } from "@/domain/meeting-state-v1-validation.js";
import type { MeetingState } from "@/domain/meeting-state-v1.js";
import {
    RecommendIdentityActionV1Schema,
    RecordIdentityAdmissionResultActionV1Schema
} from "./meeting-identity-v1.js";

const nonEmpty = z.string().min(1);
const action = z.discriminatedUnion("kind", [
    RecommendIdentityActionV1Schema,
    RecordIdentityAdmissionResultActionV1Schema,
    z.object({ kind: z.literal("read_meeting") }),
    z.object({ kind: z.literal("end_meeting") }),
    z.object({ kind: z.literal("archive_meeting") })
]);
export const MeetingCommandV1Schema = z
    .object({
        protocolVersion: z.literal(1),
        meetingId: nonEmpty,
        expectedMeetingVersion: z.number().int().nonnegative(),
        requestId: nonEmpty,
        action
    })
    .passthrough();
export type MeetingCommandV1 = z.infer<typeof MeetingCommandV1Schema>;

export function encodeMeetingStateV1(state: unknown): Uint8Array {
    const validation = validateMeetingStateV1(state);
    if (validation.kind !== "valid") throw new Error("INCOMPATIBLE_VERSION");
    return new TextEncoder().encode(JSON.stringify(validation.state));
}

export function decodeMeetingStateV1(bytes: Uint8Array): MeetingState {
    try {
        const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
        const validation = validateMeetingStateV1(value);
        if (validation.kind !== "valid") throw new Error("INCOMPATIBLE_VERSION");
        return validation.state;
    } catch (error) {
        if (error instanceof Error && error.message === "INCOMPATIBLE_VERSION") throw error;
        throw new Error("INCOMPATIBLE_VERSION");
    }
}
