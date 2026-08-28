import { createHash } from "node:crypto";

import { transitionMeeting } from "../domain/transitions.js";
import type { ArchivePackage, MeetingState } from "../domain/model.js";
import type {
    CommandAuthorization,
    CommittedResult,
    JsonObject,
    MeetingRepository
} from "../repository/index.js";

const executionTerminalStatuses = new Set<MeetingState["status"]>([
    "completed",
    "partial",
    "no_consensus",
    "cancelled",
    "failed"
]);

export const archiveBeginCommandKind = "internal_archive_begin";

function canonicalJson(value: unknown): string {
    if (value === null || typeof value === "boolean" || typeof value === "number") {
        return JSON.stringify(value);
    }
    if (typeof value === "string") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (typeof value === "object") {
        return `{${Object.entries(value)
            .filter(([, child]) => child !== undefined)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
            .join(",")}}`;
    }
    throw new TypeError("Archive termination identity contains a non-JSON value.");
}

export function terminationIdentity(state: MeetingState): string {
    if (state.termination === undefined) {
        throw new TypeError("Archive materialization requires a committed termination.");
    }
    return createHash("sha256")
        .update(canonicalJson({ meetingId: state.id, termination: state.termination }))
        .digest("hex");
}

function archiveAuthorization(identity: string): CommandAuthorization {
    return {
        callerBinding: `internal:termination:${identity}`,
        capabilityId: `internal:termination:${identity}`
    };
}

export interface BeginArchiveFromTerminationInput {
    readonly repository: Pick<MeetingRepository, "execute">;
    /** A recovered, committed execution-terminal snapshot. */
    readonly terminal: MeetingState;
    readonly now: number;
}

/**
 * Materializes only the repository snapshot that wins this versioned command.
 * The stable termination-derived receipt makes retries replay the same begin
 * result instead of manufacturing a second archive package.
 */
export async function beginArchiveFromTermination(
    input: BeginArchiveFromTerminationInput
): Promise<CommittedResult<{ status: "archiving" }>> {
    if (!executionTerminalStatuses.has(input.terminal.status)) {
        throw new TypeError("Archive begin requires a committed execution-terminal meeting.");
    }
    const identity = terminationIdentity(input.terminal);
    return input.repository.execute({
        requestId: `internal:archive:${identity}`,
        commandKind: archiveBeginCommandKind,
        authorization: archiveAuthorization(identity),
        requestHash: canonicalJson({ identity, operation: "begin" }),
        expectedMeetingVersion: input.terminal.version,
        transition: (snapshot) => {
            const state = snapshot.state as unknown as MeetingState;
            if (
                !executionTerminalStatuses.has(state.status) ||
                terminationIdentity(state) !== identity
            ) {
                throw new TypeError(
                    "Archive begin snapshot does not match the committed termination."
                );
            }
            const transition = transitionMeeting(state, "archiving", {
                now: input.now,
                archive: { package: materializeArchivePackage(state, input.now) }
            });
            return {
                state: transition.state as unknown as JsonObject,
                result: { status: "archiving" as const },
                events: transition.effect.events as never,
                outbox: []
            };
        }
    });
}

export function materializeArchivePackage(
    state: MeetingState,
    materializedAt: number
): ArchivePackage {
    if (state.termination === undefined) {
        throw new TypeError("Archive materialization requires a committed termination.");
    }
    return structuredClone({
        schemaVersion: 1 as const,
        meetingId: state.id,
        teamId: state.teamId,
        objectiveContract: state.objectiveContract,
        finalSummary: state.termination.finalMessage,
        artifactRefs: state.artifactRefs,
        acceptedDecisions: state.decisions.filter((decision) => decision.status === "accepted"),
        proposals: state.proposals,
        completionFacts: state.completionFacts,
        agenda: state.agenda,
        issues: state.issues.map(({ status, rationale, ...issue }) => ({
            ...issue,
            status,
            ...(rationale === undefined ? {} : { rationale })
        })),
        unresolvedQuestions: state.openQuestions
            .filter((question) => question.status === "open" || question.status === "deferred")
            .map(({ askedBy, agendaItemId, ...question }) => ({
                ...question,
                ...(askedBy === undefined ? {} : { askedBy }),
                ...(agendaItemId === undefined ? {} : { agendaItemId })
            })),
        parkingLot: state.agendaCandidates.map(({ id, title, reason, status }) => ({
            id,
            title,
            reason,
            status
        })),
        formalTranscript: state.transcript,
        participantProvenance: state.participants.map((participant) => ({
            participantId: participant.id,
            displayName: participant.displayName,
            ...(participant.role === undefined ? {} : { role: participant.role })
        })),
        termination: state.termination,
        endedAt: state.termination.endedAt,
        materializedAt
    });
}
