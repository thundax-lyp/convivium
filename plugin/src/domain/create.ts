import { DomainError } from "./errors.js";
import type { MeetingLimits, MeetingSelectionMode, MeetingState } from "./model.js";

export interface CanonicalIdAllocator {
    allocate(
        kind: "participant" | "output" | "criterion" | "constraint" | "agenda",
        key: string
    ): string;
}

export interface CreateParticipantSpec {
    key: string;
    sourceMemberName?: string;
    displayName: string;
    role?: string;
}

export interface CreateObjectiveContractSpec {
    requiredOutputs: readonly { key: string; description: string }[];
    acceptanceCriteria: readonly { key: string; description: string }[];
    hardConstraints: readonly { key: string; description: string }[];
    requiredReviewerKeys: readonly string[];
    riskAcceptanceAuthorityKeys: readonly string[];
    acceptableRiskLevel: "low" | "medium" | "high";
}

export interface CreateAgendaItemSpec {
    key: string;
    title: string;
    objective: string;
    inScope: readonly string[];
    outOfScope: readonly string[];
    completionCriteria: readonly string[];
    ownerKey?: string;
    requiredParticipantKeys: readonly string[];
    relatedTaskIds?: readonly string[];
}

export interface CreateMeetingSpec {
    meetingId: string;
    teamId: string;
    topic: string;
    objective: string;
    promptVersion: string;
    objectiveContract: CreateObjectiveContractSpec;
    agenda: readonly CreateAgendaItemSpec[];
    participants: readonly CreateParticipantSpec[];
    selectionMode?: MeetingSelectionMode;
    limits: MeetingLimits;
    createdAt: number;
}

function invalidCreateInput(message: string): never {
    throw new DomainError("INVALID_CREATE_INPUT", message);
}

function requireUniqueKeys(values: readonly { key: string }[], kind: string): ReadonlySet<string> {
    const keys = new Set<string>();
    for (const value of values) {
        if (!value.key || keys.has(value.key)) invalidCreateInput(`Invalid ${kind} key`);
        keys.add(value.key);
    }
    return keys;
}

function requireKnownKeys(keys: readonly string[], known: ReadonlySet<string>, kind: string): void {
    for (const key of keys) {
        if (!known.has(key)) invalidCreateInput(`Unknown ${kind} reference`);
    }
}

export function createMeetingState(
    input: CreateMeetingSpec,
    ids: CanonicalIdAllocator
): MeetingState {
    if (
        !input.meetingId ||
        !input.teamId ||
        !input.topic ||
        !input.objective ||
        !input.promptVersion
    ) {
        invalidCreateInput("Meeting identity and presentation fields are required");
    }
    const participantKeys = requireUniqueKeys(input.participants, "participant");
    requireUniqueKeys(input.objectiveContract.requiredOutputs, "required output");
    requireUniqueKeys(input.objectiveContract.acceptanceCriteria, "acceptance criterion");
    requireUniqueKeys(input.objectiveContract.hardConstraints, "hard constraint");
    requireUniqueKeys(input.agenda, "agenda");
    requireKnownKeys(input.objectiveContract.requiredReviewerKeys, participantKeys, "reviewer");
    requireKnownKeys(
        input.objectiveContract.riskAcceptanceAuthorityKeys,
        participantKeys,
        "risk authority"
    );

    const participantIds = new Map(
        input.participants.map((participant) => [
            participant.key,
            ids.allocate("participant", participant.key)
        ])
    );
    const participantId = (key: string): string => {
        const id = participantIds.get(key);
        return id ?? invalidCreateInput("Unknown participant reference");
    };

    return {
        id: input.meetingId,
        teamId: input.teamId,
        status: "created",
        topic: input.topic,
        objective: input.objective,
        manager: { promptVersion: input.promptVersion, status: "creating" },
        participants: input.participants.map((participant) => ({
            id: participantId(participant.key),
            ...(participant.sourceMemberName
                ? { sourceMemberName: participant.sourceMemberName }
                : {}),
            displayName: participant.displayName,
            ...(participant.role ? { role: participant.role } : {}),
            status: "available",
            consecutiveSpeeches: 0,
            consecutiveAttemptFailures: 0,
            totalSpeeches: 0,
            lastDeliveredSeq: 0,
            lastAcknowledgedSeq: 0
        })),
        objectiveContract: {
            requiredOutputs: input.objectiveContract.requiredOutputs.map((output) => ({
                id: ids.allocate("output", output.key),
                description: output.description,
                status: "pending"
            })),
            acceptanceCriteria: input.objectiveContract.acceptanceCriteria.map((criterion) => ({
                id: ids.allocate("criterion", criterion.key),
                description: criterion.description,
                satisfied: false
            })),
            hardConstraints: input.objectiveContract.hardConstraints.map((constraint) => ({
                id: ids.allocate("constraint", constraint.key),
                description: constraint.description
            })),
            requiredReviewers: input.objectiveContract.requiredReviewerKeys.map(participantId),
            riskAcceptanceAuthority:
                input.objectiveContract.riskAcceptanceAuthorityKeys.map(participantId),
            acceptableRiskLevel: input.objectiveContract.acceptableRiskLevel
        },
        agenda: input.agenda.map((agenda) => {
            if (agenda.ownerKey) participantId(agenda.ownerKey);
            requireKnownKeys(agenda.requiredParticipantKeys, participantKeys, "agenda participant");
            return {
                id: ids.allocate("agenda", agenda.key),
                title: agenda.title,
                objective: agenda.objective,
                inScope: [...agenda.inScope],
                outOfScope: [...agenda.outOfScope],
                completionCriteria: [...agenda.completionCriteria],
                ...(agenda.ownerKey ? { owner: participantId(agenda.ownerKey) } : {}),
                requiredParticipants: agenda.requiredParticipantKeys.map(participantId),
                relatedTaskIds: [...(agenda.relatedTaskIds ?? [])],
                status: "pending"
            };
        }),
        issues: [],
        agendaCandidates: [],
        transcript: [],
        proposals: [],
        decisions: [],
        openQuestions: [],
        handRaises: [],
        completionFacts: [],
        artifactRefs: [],
        continuationMaterials: [],
        turnSeq: 0,
        messageSeq: 0,
        eventSeq: 0,
        stallCount: 0,
        replanCount: 0,
        selectionMode: input.selectionMode ?? "hybrid",
        limits: { ...input.limits },
        version: 0,
        createdAt: input.createdAt,
        updatedAt: input.createdAt
    };
}
