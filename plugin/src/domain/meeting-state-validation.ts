import type { MeetingState } from "./meeting-state.js";
import {
    own,
    ownUndefined,
    record,
    type RecordValue
} from "./validations/meeting-state-helpers.js";
import { validateMeetingStateOutcomes } from "./validations/meeting-state-outcomes.js";
import { validateMeetingStateReferences } from "./validations/meeting-state-references.js";
import { parseMeetingStateShape } from "./validations/meeting-state-schema.js";

export type MeetingStateValidationResultV1 =
    | { kind: "valid"; state: MeetingState }
    | { kind: "invalid"; code: "INVALID_ARGUMENT"; path: string };

function fail(path: string): MeetingStateValidationResultV1 {
    return { kind: "invalid", code: "INVALID_ARGUMENT", path };
}

function legacyCompatibilityFieldPath(value: unknown, path = "$"): string | undefined {
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            const result = legacyCompatibilityFieldPath(value[i], path + "[" + i + "]");
            if (result) return result;
        }
        return undefined;
    }
    if (!record(value)) return undefined;
    for (const key of ["reviewResponsibilityIds", "requiredReviewerIds", "formatApprovals"]) {
        if (own(value, key)) return path + "." + key;
    }
    for (const [key, child] of Object.entries(value)) {
        const result = legacyCompatibilityFieldPath(child, path + "." + key);
        if (result) return result;
    }
    return undefined;
}

function validateRawMeetingState(value: RecordValue): string | undefined {
    const legacyPath = legacyCompatibilityFieldPath(value);
    if (legacyPath) return legacyPath;
    if (!Array.isArray(value.rounds)) return undefined;
    for (let i = 0; i < value.rounds.length; i++) {
        const round = value.rounds[i];
        if (
            record(round) &&
            round.status === "aborted" &&
            (!own(round, "abortReason") ||
                !own(round, "abortedAt") ||
                round.abortReason === undefined ||
                round.abortedAt === undefined)
        )
            return `$.rounds[${i}].abortReason`;
    }
    return undefined;
}

function schemaIssuePath(issue: { path: readonly PropertyKey[] }): string {
    const suffix = issue.path.reduce<string>(
        (text, segment) =>
            typeof segment === "number"
                ? `${text}[${String(segment)}]`
                : `${text}.${String(segment)}`,
        ""
    );
    return `$${suffix}`;
}

export function validateMeetingStateV1(value: unknown): MeetingStateValidationResultV1 {
    if (!record(value)) return fail("$");
    const rawPath = validateRawMeetingState(value);
    if (rawPath) return fail(rawPath);
    const parsed = parseMeetingStateShape(value);
    if (!parsed.success) return fail(schemaIssuePath(parsed.error.issues[0]));
    const parsedState = parsed.data as MeetingState;
    if (
        own(value, "continuation") &&
        (value.continuation === undefined || !record(value.continuation))
    )
        return fail("$.continuation");
    if (ownUndefined(parsedState.lifecycle, "reason", "$.lifecycle.reason"))
        return fail("$.lifecycle.reason");
    const reviewers = parsedState.identities.filter((identity) =>
        identity.roles.includes("evidence_reviewer")
    );
    if (reviewers.length !== 1) return fail("$.identities");
    if (parsedState.evidenceReviewerId !== reviewers[0].id) return fail("$.evidenceReviewerId");
    const referencePath = validateMeetingStateReferences(parsedState);
    if (referencePath) return fail(referencePath);
    const outcomePath = validateMeetingStateOutcomes(value, parsedState);
    if (outcomePath) return fail(outcomePath);
    return { kind: "valid", state: value as unknown as MeetingState };
}
