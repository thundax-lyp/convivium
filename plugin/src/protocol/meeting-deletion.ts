import { z } from "zod";

export const MeetingDeletionStatusSchema = z.enum([
    "allowed",
    "active",
    "pending_work",
    "sessions_open"
]);
export type MeetingDeletionStatus = z.infer<typeof MeetingDeletionStatusSchema>;
export const DeleteMeetingRequestSchema = z.strictObject({
    protocolVersion: z.literal(1),
    meetingId: z.string().trim().min(1).max(500),
    expectedMeetingVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
});
export type DeleteMeetingRequest = z.infer<typeof DeleteMeetingRequestSchema>;
export const DeleteMeetingResultSchema = z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("deleted"), meetingId: z.string().min(1) }),
    z.strictObject({
        kind: z.literal("rejected"),
        error: z.strictObject({
            code: z.enum(["VERSION_CONFLICT", "PRECONDITION_FAILED"]),
            message: z.string()
        })
    })
]);
export type DeleteMeetingResult = z.infer<typeof DeleteMeetingResultSchema>;
