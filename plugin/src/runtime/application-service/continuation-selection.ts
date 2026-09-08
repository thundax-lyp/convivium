import type { ArchivePackage, CreateContinuationSpec, MeetingState } from "@/domain/index.js";
import type { CreateMeetingInputV1 } from "@/protocol/index.js";
import { commandFailure } from "@/runtime/services/command-result-service.js";
import type { MeetingRehydrationService } from "@/runtime/services/meeting-recovery-service.js";
import type { MeetingToolCaller, StoredMeeting } from "./types.js";

type ContinuationResolution =
    | { readonly ok: true; readonly continuation?: CreateContinuationSpec }
    | { readonly ok: false; readonly error: ReturnType<typeof commandFailure> };

function nonBlank(value: string | undefined): string | undefined {
    return value !== undefined && value.trim() ? value : undefined;
}

function requireUniqueSelectionIds(ids: readonly string[]): boolean {
    const seen = new Set<string>();
    return ids.every((id) => {
        if (!id.trim() || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

function archiveMaterialFailure(message: string): ContinuationResolution {
    return { ok: false, error: commandFailure("ARCHIVE_MATERIAL_NOT_FOUND", message) };
}

function invalidContinuationInput(message: string): ContinuationResolution {
    return { ok: false, error: commandFailure("INVALID_ARGUMENT", message) };
}

function sourceArchive(state: MeetingState): ArchivePackage | undefined {
    const archive = state.archive?.package;
    if (
        state.status !== "archived" ||
        archive === undefined ||
        archive.meetingId !== state.id ||
        archive.teamId !== state.teamId ||
        !Array.isArray(archive.acceptedDecisions) ||
        !Array.isArray(archive.issues) ||
        !Array.isArray(archive.completionFacts) ||
        !Array.isArray(archive.artifactRefs)
    ) {
        return undefined;
    }
    return archive as ArchivePackage;
}

export async function resolveContinuationSelection(
    selection: CreateMeetingInputV1["continuation"],
    inputTeamId: string,
    caller: MeetingToolCaller,
    recovery: MeetingRehydrationService,
    meetings: Map<string, StoredMeeting>
): Promise<ContinuationResolution> {
    if (selection === undefined) return { ok: true };
    const allSelections = [
        selection.decisionIds,
        selection.unresolvedIssueIds,
        selection.riskIds,
        selection.evidenceIds,
        selection.artifactIds
    ];
    if (!selection.sourceMeetingId.trim() || !allSelections.every(requireUniqueSelectionIds)) {
        return invalidContinuationInput(
            "Continuation selections must contain unique non-empty IDs."
        );
    }
    const selectedIssueIds = new Set(selection.unresolvedIssueIds);
    if (selection.riskIds.some((id) => selectedIssueIds.has(id))) {
        return invalidContinuationInput(
            "An archive issue cannot be selected as both issue and risk."
        );
    }

    const snapshots = await recovery.rehydrate({
        kind: "local_meeting",
        meetingId: selection.sourceMeetingId
    });
    const sourceSnapshot = snapshots?.get(selection.sourceMeetingId);
    const source = meetings.get(selection.sourceMeetingId);
    if (sourceSnapshot === undefined || source === undefined) {
        return archiveMaterialFailure("The continuation source archive is unavailable.");
    }
    const sourceState = sourceSnapshot.state as unknown as MeetingState;
    if (source.teamId !== inputTeamId || source.captainSessionId !== caller.sessionId) {
        return archiveMaterialFailure("The caller cannot read the continuation source archive.");
    }
    const archive = sourceArchive(sourceState);
    if (archive === undefined) {
        return {
            ok: false,
            error: commandFailure(
                "SOURCE_MEETING_NOT_ARCHIVED",
                "The continuation source meeting is not archived with a materialized archive package."
            )
        };
    }

    const materials: Array<CreateContinuationSpec["materials"][number]> = [];
    const append = (
        sourceKind: CreateContinuationSpec["materials"][number]["sourceKind"],
        sourceObjectId: string | undefined,
        summary: string | undefined,
        checksum?: string
    ): ContinuationResolution | undefined => {
        const stableSummary = nonBlank(summary);
        if (stableSummary === undefined) {
            return invalidContinuationInput("The selected archive material has no usable summary.");
        }
        materials.push({
            sourceMeetingId: selection.sourceMeetingId,
            sourceKind,
            ...(sourceObjectId === undefined ? {} : { sourceObjectId }),
            summary: stableSummary,
            ...(checksum === undefined ? {} : { checksum })
        });
        return undefined;
    };

    if (selection.includeFinalSummary) {
        const failure = append("final_summary", undefined, archive.finalSummary);
        if (failure !== undefined) return failure;
    }
    for (const id of selection.decisionIds) {
        const decision = archive.acceptedDecisions.find(
            (candidate) => candidate.id === id && candidate.status === "accepted"
        );
        if (decision === undefined)
            return archiveMaterialFailure("The selected decision is unavailable.");
        const failure = append("decision", id, nonBlank(decision.statement) ?? decision.rationale);
        if (failure !== undefined) return failure;
    }
    for (const id of selection.unresolvedIssueIds) {
        const issue = archive.issues.find((candidate) => candidate.id === id);
        if (issue === undefined || !["open", "waiting", "deferred"].includes(issue.status)) {
            return archiveMaterialFailure("The selected unresolved issue is unavailable.");
        }
        const failure = append(
            "issue",
            id,
            nonBlank(issue.title) ?? nonBlank(issue.description) ?? issue.rationale
        );
        if (failure !== undefined) return failure;
    }
    for (const id of selection.riskIds) {
        const issue = archive.issues.find((candidate) => candidate.id === id);
        if (issue === undefined || !["accepted_risk", "blocking"].includes(issue.disposition)) {
            return archiveMaterialFailure("The selected risk is unavailable.");
        }
        const failure = append(
            "risk",
            id,
            nonBlank(issue.title) ?? nonBlank(issue.description) ?? issue.rationale
        );
        if (failure !== undefined) return failure;
    }
    for (const id of selection.evidenceIds) {
        const evidence = archive.completionFacts.find((candidate) => candidate.id === id);
        if (evidence === undefined)
            return archiveMaterialFailure("The selected evidence is unavailable.");
        const failure = append("evidence", id, evidence.reason);
        if (failure !== undefined) return failure;
    }
    for (const id of selection.artifactIds) {
        const artifact = archive.artifactRefs.find((candidate) => candidate.artifactId === id);
        if (artifact === undefined)
            return archiveMaterialFailure("The selected artifact is unavailable.");
        const failure = append("artifact", id, artifact.title, artifact.checksum);
        if (failure !== undefined) return failure;
    }
    return {
        ok: true,
        continuation: { sourceMeetingId: selection.sourceMeetingId, materials }
    };
}
