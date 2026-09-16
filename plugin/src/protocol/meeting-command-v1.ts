import { z } from "zod";
import type { MeetingState } from "@/domain/index.js";
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

const targetMeetingStateFields = [
    "id",
    "version",
    "createdAt",
    "updatedAt",
    "objective",
    "lifecycle",
    "identities",
    "identityRecommendations",
    "agenda",
    "agendaCandidates",
    "rounds",
    "opportunityRequests",
    "pendingHandRaises",
    "contributions",
    "formatApprovals",
    "completionDeclarations",
    "evidencePackages",
    "registrations",
    "reviews",
    "reviewDeliveries",
    "publications",
    "messages",
    "proposals",
    "positions",
    "decisionCandidates",
    "decisions",
    "questions",
    "issues",
    "riskDispositions",
    "tasks",
    "managerPlans",
    "privateMails",
    "completionFacts",
    "limits"
] as const;

function isTargetMeetingState(value: unknown): value is MeetingState {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    return targetMeetingStateFields.every((field) =>
        Object.prototype.hasOwnProperty.call(value, field)
    );
}

export function encodeMeetingStateV1(state: unknown): Uint8Array {
    if (!isTargetMeetingState(state)) throw new Error("INCOMPATIBLE_VERSION");
    return new TextEncoder().encode(JSON.stringify(state));
}

export function decodeMeetingStateV1(bytes: Uint8Array): MeetingState {
    try {
        const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
        if (!isTargetMeetingState(value)) throw new Error("INCOMPATIBLE_VERSION");
        return value;
    } catch (error) {
        if (error instanceof Error && error.message === "INCOMPATIBLE_VERSION") throw error;
        throw new Error("INCOMPATIBLE_VERSION", { cause: error });
    }
}
