import { createHash } from "node:crypto";

import { transitionMeeting } from "../domain/transitions.js";
import type { ArchivePackage, MeetingState } from "../domain/model.js";
import {
    encodeMeetingSessionLabel,
    interruptAndDrainOwnedSessions,
    proveArchiveOwnedChildren,
    type ArchiveSessionRuntime,
    type ContinuableLifecycleRuntime
} from "../dsh/index.js";
import type {
    CommandAuthorization,
    CommittedResult,
    JsonObject,
    MeetingRepository
} from "../repository/index.js";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { SessionOwnership } from "../repository/index.js";

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

type ArchiveCleanupRuntime = ArchiveSessionRuntime & ContinuableLifecycleRuntime;

export interface CleanupOwnedSessionsInput {
    readonly repository: Pick<MeetingRepository, "recover" | "recordSessionOwnership">;
    readonly parent: Agent;
    readonly runtime: ArchiveCleanupRuntime;
    readonly signal: AbortSignal;
    readonly now: number;
}

function archiveOwnershipIdentity(ownership: SessionOwnership): string {
    return [
        ownership.sessionId,
        ownership.parentSessionId,
        ownership.sessionLabel,
        ownership.provider,
        ownership.role,
        ownership.participantId ?? ""
    ].join("\0");
}

function assertSameArchiveOwnerships(
    before: readonly SessionOwnership[],
    after: readonly SessionOwnership[]
): void {
    const beforeIds = new Set(before.map(archiveOwnershipIdentity));
    const afterIds = new Set(after.map(archiveOwnershipIdentity));
    if (
        beforeIds.size !== before.length ||
        afterIds.size !== after.length ||
        beforeIds.size !== afterIds.size ||
        [...beforeIds].some((identity) => !afterIds.has(identity))
    ) {
        throw new Error("Archive cleanup ownership changed after drain.");
    }
}

/**
 * Builds the one cleanup target set from committed meeting facts. No Session
 * outside this Manager-plus-Participants set may be interrupted or closed.
 */
export function requireExpectedArchiveOwnerships(
    state: MeetingState,
    ownerships: readonly SessionOwnership[],
    parentSessionId: string
): readonly SessionOwnership[] {
    const expectedParticipants = new Set(state.participants.map((participant) => participant.id));
    const foundParticipants = new Set<string>();
    let managerCount = 0;
    const sessionIds = new Set<string>();

    for (const ownership of ownerships) {
        if (
            sessionIds.has(ownership.sessionId) ||
            ownership.parentSessionId !== parentSessionId ||
            !ownership.provider
        ) {
            throw new Error("Archive cleanup ownership set is not an exact direct-child set.");
        }
        sessionIds.add(ownership.sessionId);

        if (ownership.role === "manager") {
            if (
                ownership.participantId !== undefined ||
                ownership.sessionLabel !==
                    encodeMeetingSessionLabel({
                        role: "manager",
                        teamId: state.teamId,
                        meetingId: state.id
                    })
            ) {
                throw new Error("Archive cleanup Manager ownership does not match the meeting.");
            }
            managerCount += 1;
            continue;
        }

        if (
            ownership.participantId === undefined ||
            !expectedParticipants.has(ownership.participantId) ||
            foundParticipants.has(ownership.participantId) ||
            ownership.sessionLabel !==
                encodeMeetingSessionLabel({
                    role: "participant",
                    teamId: state.teamId,
                    meetingId: state.id,
                    participantId: ownership.participantId
                })
        ) {
            throw new Error("Archive cleanup Participant ownership does not match the meeting.");
        }
        foundParticipants.add(ownership.participantId);
    }

    if (
        managerCount !== 1 ||
        foundParticipants.size !== expectedParticipants.size ||
        ownerships.length !== expectedParticipants.size + 1
    ) {
        throw new Error(
            "Archive cleanup ownership set is incomplete or contains an extra Session."
        );
    }
    return ownerships;
}

function requireArchivingSnapshot(
    recovered: Awaited<ReturnType<MeetingRepository["recover"]>>
): MeetingState {
    const state = recovered.snapshot?.state as unknown as MeetingState | undefined;
    if (state?.status !== "archiving" || state.archive?.package === undefined) {
        throw new Error("Archive cleanup requires a materialized archiving snapshot.");
    }
    return state;
}

/**
 * Persists capability revocation before DSH effects. A fulfilled drain only
 * proves named resident Activations were released; the durable children are
 * deliberately never treated as deletion candidates.
 */
export async function cleanupOwnedSessions(input: CleanupOwnedSessionsInput): Promise<void> {
    const before = await input.repository.recover();
    const state = requireArchivingSnapshot(before);
    const parentSessionId = String(input.parent.id);
    const expected = requireExpectedArchiveOwnerships(
        state,
        before.sessionOwnership,
        parentSessionId
    );
    await proveArchiveOwnedChildren({
        runtime: input.runtime,
        parentSessionId: input.parent.id as never,
        meetingId: state.id,
        ownerships: expected,
        signal: input.signal
    });

    const revoked = await Promise.all(
        expected.map((ownership) =>
            input.repository.recordSessionOwnership(
                { ...ownership, capabilityStatus: "revoked" },
                input.now
            )
        )
    );
    const notClosed = revoked.filter((ownership) => ownership.lifecycleStatus !== "closed");
    if (notClosed.length === 0) return;

    await interruptAndDrainOwnedSessions({
        runtime: input.runtime,
        parent: input.parent,
        ownerships: notClosed
    });

    const afterDrain = await input.repository.recover();
    const afterState = requireArchivingSnapshot(afterDrain);
    const after = requireExpectedArchiveOwnerships(
        afterState,
        afterDrain.sessionOwnership,
        parentSessionId
    );
    assertSameArchiveOwnerships(expected, after);
    if (after.some((ownership) => ownership.capabilityStatus !== "revoked")) {
        throw new Error("Archive cleanup capability revocation did not persist through drain.");
    }
    await Promise.all(
        after
            .filter((ownership) => ownership.lifecycleStatus !== "closed")
            .map((ownership) =>
                input.repository.recordSessionOwnership(
                    { ...ownership, lifecycleStatus: "closed" },
                    input.now
                )
            )
    );
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
