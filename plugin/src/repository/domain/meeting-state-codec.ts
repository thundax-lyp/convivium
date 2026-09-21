import { validateMeetingState, type MeetingState } from "@/domain/index.js";

const fields = [
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
    "evidenceReviewerId",
    "completionDeclarations",
    "evidencePackages",
    "registrations",
    "reviews",
    "reviewClaims",
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
    return fields.every((field) => Object.prototype.hasOwnProperty.call(value, field));
}

export function encodeMeetingState(state: unknown): Uint8Array {
    if (!isTargetMeetingState(state) || validateMeetingState(state).kind !== "valid")
        throw new Error("INCOMPATIBLE_VERSION");
    return new TextEncoder().encode(JSON.stringify(state));
}

export function decodeMeetingState(bytes: Uint8Array): MeetingState {
    try {
        const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
        if (!isTargetMeetingState(value) || validateMeetingState(value).kind !== "valid")
            throw new Error("INCOMPATIBLE_VERSION");
        return value;
    } catch (error) {
        if (error instanceof Error && error.message === "INCOMPATIBLE_VERSION") throw error;
        throw new Error("INCOMPATIBLE_VERSION", { cause: error });
    }
}
