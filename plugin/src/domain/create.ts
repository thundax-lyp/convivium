import { DomainError } from "./errors.js";
import type {
    ContinuationMaterial,
    MeetingLimits,
    MeetingSelectionMode,
    MeetingState
} from "./model.js";

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
    /** Resolved from a source ArchivePackage before this pure domain constructor runs. */
    continuation?: CreateContinuationSpec;
    selectionMode?: MeetingSelectionMode;
    limits: MeetingLimits;
    createdAt: number;
}

export interface CreateContinuationSpec {
    sourceMeetingId: string;
    materials: readonly ContinuationMaterial[];
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

function canonicalCompletionCriteria(
    references: readonly string[],
    outputs: readonly { key: string; id: string; description: string }[],
    criteria: readonly { key: string; id: string; description: string }[]
): string[] {
    const candidates = [...outputs, ...criteria];
    return references.map((reference) => {
        const matches = candidates.filter(
            (candidate) =>
                candidate.id === reference ||
                candidate.key === reference ||
                candidate.description === reference
        );
        if (matches.length !== 1) {
            invalidCreateInput(`Unknown or ambiguous agenda completion criterion: ${reference}`);
        }
        return matches[0]!.id;
    });
}

function copyContinuation(
    continuation: CreateContinuationSpec | undefined
): CreateContinuationSpec | undefined {
    if (continuation === undefined) return undefined;
    if (!continuation.sourceMeetingId.trim()) {
        invalidCreateInput("Continuation source meeting ID is required");
    }
    const materials = continuation.materials.map((material) => {
        if (
            material.sourceMeetingId !== continuation.sourceMeetingId ||
            !material.summary.trim() ||
            (material.sourceKind === "final_summary" && material.sourceObjectId !== undefined) ||
            (material.sourceKind !== "final_summary" && !material.sourceObjectId?.trim()) ||
            (material.sourceKind !== "artifact" && material.checksum !== undefined)
        ) {
            invalidCreateInput("Invalid continuation material");
        }
        return {
            sourceMeetingId: material.sourceMeetingId,
            sourceKind: material.sourceKind,
            ...(material.sourceObjectId === undefined
                ? {}
                : { sourceObjectId: material.sourceObjectId }),
            summary: material.summary,
            ...(material.checksum === undefined ? {} : { checksum: material.checksum })
        };
    });
    return { sourceMeetingId: continuation.sourceMeetingId, materials };
}

export function createMeetingState(
    input: CreateMeetingSpec,
    ids: CanonicalIdAllocator
): MeetingState {
    const selectionMode = input.selectionMode ?? "round_robin";
    if (selectionMode === "rule_based" || selectionMode === "hybrid") {
        throw new DomainError(
            "UNSUPPORTED_CAPABILITY",
            `selection mode ${selectionMode} is not supported by this runtime slice`
        );
    }
    const continuation = copyContinuation(input.continuation);
    if (
        !input.meetingId ||
        !input.teamId ||
        !input.topic ||
        !input.objective ||
        !input.promptVersion
    ) {
        invalidCreateInput("Meeting identity and presentation fields are required");
    }
    if (input.agenda.length === 0) {
        invalidCreateInput("At least one agenda item is required");
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
    if (
        input.agenda.some(
            (agenda) => agenda.requiredParticipantKeys.length > input.limits.maxSpeakersPerTurn
        )
    ) {
        invalidCreateInput("Agenda required participants exceed max speakers per turn");
    }

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

    const requiredOutputCandidates = input.objectiveContract.requiredOutputs.map((output) => ({
        id: ids.allocate("output", output.key),
        key: output.key,
        description: output.description,
        status: "pending" as const
    }));
    const acceptanceCriterionCandidates = input.objectiveContract.acceptanceCriteria.map(
        (criterion) => ({
            id: ids.allocate("criterion", criterion.key),
            key: criterion.key,
            description: criterion.description,
            satisfied: false
        })
    );
    const requiredOutputs = requiredOutputCandidates.map(({ id, description, status }) => ({
        id,
        description,
        status
    }));
    const acceptanceCriteria = acceptanceCriterionCandidates.map(
        ({ id, description, satisfied }) => ({ id, description, satisfied })
    );

    return {
        id: input.meetingId,
        teamId: input.teamId,
        ...(continuation === undefined ? {} : { sourceMeetingId: continuation.sourceMeetingId }),
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
            requiredOutputs,
            acceptanceCriteria,
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
                completionCriteria: canonicalCompletionCriteria(
                    agenda.completionCriteria,
                    requiredOutputCandidates,
                    acceptanceCriterionCandidates
                ),
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
        decisionCandidates: [],
        decisions: [],
        openQuestions: [],
        handRaises: [],
        meetingTasks: [],
        completionFacts: [],
        artifactRefs: [],
        continuationMaterials: continuation?.materials.map((material) => ({ ...material })) ?? [],
        turnSeq: 0,
        messageSeq: 0,
        eventSeq: 0,
        stallCount: 0,
        replanCount: 0,
        selectionMode,
        limits: { ...input.limits },
        version: 0,
        createdAt: input.createdAt,
        updatedAt: input.createdAt
    };
}
