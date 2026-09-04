import {
    isMeetingStateV2,
    type ArchivePackage,
    type ImmutableArchivePackage,
    type MeetingState
} from "../domain/index.js";
import type { MeetingSnapshot } from "../repository/types.js";

export interface DeveloperMeetingDocument {
    schemaVersion: 1;
    projectionKind: "current";
    authoritative: false;
    meetingId: string;
    teamId: string;
    sourceMeetingVersion: number;
    generatedAt: number;
    status: MeetingState["status"];
    topic: string;
    objective: string;
    objectiveContract: {
        requiredOutputs: MeetingState["objectiveContract"]["requiredOutputs"];
        acceptanceCriteria: MeetingState["objectiveContract"]["acceptanceCriteria"];
        hardConstraints: MeetingState["objectiveContract"]["hardConstraints"];
        requiredReviewers: readonly string[];
        riskAcceptanceAuthority: readonly string[];
        acceptableRiskLevel: MeetingState["objectiveContract"]["acceptableRiskLevel"];
    };
    agenda: readonly {
        id: string;
        title: string;
        objective: string;
        status: MeetingState["agenda"][number]["status"];
        resolution?: string;
    }[];
    transcript: readonly {
        id: string;
        seq: number;
        speaker: string;
        agendaItemId: string;
        kind: MeetingState["transcript"][number]["kind"];
        content: string;
        createdAt: number;
    }[];
    proposals: readonly {
        id: string;
        title: string;
        description: string;
        proposedBy: string;
        revision: number;
        status: MeetingState["proposals"][number]["status"];
        agendaItemId: string;
        positions: readonly {
            participantId: string;
            position: MeetingState["proposals"][number]["positions"][number]["position"];
            reason?: string;
            blocking: boolean;
        }[];
    }[];
    decisions: readonly {
        id: string;
        proposalId: string;
        proposalRevision: number;
        status: MeetingState["decisions"][number]["status"];
        statement?: string;
        rationale?: string;
        acceptanceMode: MeetingState["decisions"][number]["acceptanceMode"];
    }[];
    issues: readonly {
        id: string;
        title: string;
        description: string;
        blocking: boolean;
        riskLevel?: MeetingState["issues"][number]["riskLevel"];
        status: MeetingState["issues"][number]["status"];
        rationale?: string;
    }[];
    openQuestions: readonly {
        id: string;
        text: string;
        askedBy: string;
        blocking: boolean;
        status: MeetingState["openQuestions"][number]["status"];
        answerMessageId?: string;
    }[];
    meetingTasks: readonly {
        meetingTaskId: string;
        participantId: string;
        title: string;
        description: string;
        blocking: boolean;
        status: MeetingState["meetingTasks"][number]["status"];
        createdAt: number;
        resultSummary?: string;
        failureReason?: string;
        queuedAt?: number;
        startedAt?: number;
        finishedAt?: number;
    }[];
    completionFacts: readonly {
        id: string;
        kind: MeetingState["completionFacts"][number]["kind"];
        subjectId: string;
        assertedBy: string;
        result: MeetingState["completionFacts"][number]["result"];
        status: MeetingState["completionFacts"][number]["status"];
        reason?: string;
        createdAt: number;
    }[];
    artifactRefs: readonly { artifactId: string; title: string; version?: string }[];
    termination?: {
        code: NonNullable<MeetingState["termination"]>["code"];
        reason: string;
        finalMessage: string;
        endedAt: number;
    };
}

const currentHeadings = [
    ["Objective", "objective"],
    ["Objective Contract", "objectiveContract"],
    ["Agenda", "agenda"],
    ["Transcript", "transcript"],
    ["Proposals and Positions", "proposals"],
    ["Decisions", "decisions"],
    ["Issues and Risks", "issues"],
    ["Open Questions", "openQuestions"],
    ["Follow-up Tasks", "meetingTasks"],
    ["Completion Facts", "completionFacts"],
    ["Artifacts", "artifactRefs"],
    ["Termination", "termination"]
] as const;

function renderSection(title: string, value: unknown): string {
    const body =
        Array.isArray(value) && value.length === 0
            ? "_None._"
            : ["```json", JSON.stringify(value, null, 2), "```"].join("\n");
    return "## " + title + "\n\n" + body;
}

function optional<T>(value: T | undefined): T | undefined {
    return value;
}

export function mapDeveloperMeetingDocument(snapshot: MeetingSnapshot): DeveloperMeetingDocument {
    if (!isMeetingStateV2(snapshot.state)) {
        throw new TypeError("Meeting snapshot state is invalid");
    }
    const state = snapshot.state;
    return {
        schemaVersion: 1,
        projectionKind: "current",
        authoritative: false,
        meetingId: snapshot.meetingId,
        teamId: snapshot.teamId,
        sourceMeetingVersion: snapshot.version,
        generatedAt: Date.now(),
        status: state.status,
        topic: state.topic,
        objective: state.objective,
        objectiveContract: {
            requiredOutputs: state.objectiveContract.requiredOutputs.map((value) => ({ ...value })),
            acceptanceCriteria: state.objectiveContract.acceptanceCriteria.map((value) => ({
                ...value
            })),
            hardConstraints: state.objectiveContract.hardConstraints.map((value) => ({ ...value })),
            requiredReviewers: [...state.objectiveContract.requiredReviewers],
            riskAcceptanceAuthority: [...state.objectiveContract.riskAcceptanceAuthority],
            acceptableRiskLevel: state.objectiveContract.acceptableRiskLevel
        },
        agenda: state.agenda.map((value) => ({
            id: value.id,
            title: value.title,
            objective: value.objective,
            status: value.status,
            ...(optional(value.resolution) === undefined ? {} : { resolution: value.resolution })
        })),
        transcript: state.transcript
            .map((value) => ({
                id: value.id,
                seq: value.seq,
                speaker: value.speaker,
                agendaItemId: value.agendaItemId,
                kind: value.kind,
                content: value.content,
                createdAt: value.createdAt
            }))
            .sort((a, b) => a.seq - b.seq),
        proposals: state.proposals
            .map((value) => ({
                id: value.id,
                title: value.title,
                description: value.description,
                proposedBy: value.proposedBy,
                revision: value.revision,
                status: value.status,
                agendaItemId: value.agendaItemId,
                positions: value.positions.map((position) => ({
                    participantId: position.participantId,
                    position: position.position,
                    ...(position.reason === undefined ? {} : { reason: position.reason }),
                    blocking: position.blocking
                }))
            }))
            .sort((a, b) => a.id.localeCompare(b.id)),
        decisions: state.decisions
            .map((value) => ({
                id: value.id,
                proposalId: value.proposalId,
                proposalRevision: value.proposalRevision,
                status: value.status,
                ...(value.statement === undefined ? {} : { statement: value.statement }),
                ...(value.rationale === undefined ? {} : { rationale: value.rationale }),
                acceptanceMode: value.acceptanceMode
            }))
            .sort((a, b) => a.id.localeCompare(b.id)),
        issues: state.issues
            .map((value) => ({
                id: value.id,
                title: value.title,
                description: value.description,
                blocking: value.blocking,
                ...(value.riskLevel === undefined ? {} : { riskLevel: value.riskLevel }),
                status: value.status,
                ...(value.rationale === undefined ? {} : { rationale: value.rationale })
            }))
            .sort((a, b) => a.id.localeCompare(b.id)),
        openQuestions: state.openQuestions
            .map((value) => ({
                id: value.id,
                text: value.text,
                askedBy: value.askedBy,
                blocking: value.blocking,
                status: value.status,
                ...(value.answerMessageId === undefined
                    ? {}
                    : { answerMessageId: value.answerMessageId })
            }))
            .sort((a, b) => a.id.localeCompare(b.id)),
        meetingTasks: state.meetingTasks
            .map((value) => ({
                meetingTaskId: value.meetingTaskId,
                participantId: value.participantId,
                title: value.title,
                description: value.description,
                blocking: value.blocking,
                status: value.status,
                createdAt: value.createdAt,
                ...(value.resultSummary === undefined
                    ? {}
                    : { resultSummary: value.resultSummary }),
                ...(value.failureReason === undefined
                    ? {}
                    : { failureReason: value.failureReason }),
                ...(value.queuedAt === undefined ? {} : { queuedAt: value.queuedAt }),
                ...(value.startedAt === undefined ? {} : { startedAt: value.startedAt }),
                ...(value.finishedAt === undefined ? {} : { finishedAt: value.finishedAt })
            }))
            .sort((a, b) => a.meetingTaskId.localeCompare(b.meetingTaskId)),
        completionFacts: state.completionFacts
            .map((value) => ({
                id: value.id,
                kind: value.kind,
                subjectId: value.subjectId,
                assertedBy: value.assertedBy,
                result: value.result,
                status: value.status,
                ...(value.reason === undefined ? {} : { reason: value.reason }),
                createdAt: value.createdAt
            }))
            .sort((a, b) => a.id.localeCompare(b.id)),
        artifactRefs: state.artifactRefs
            .map((value) => ({
                artifactId: value.artifactId,
                title: value.title,
                ...(value.version === undefined ? {} : { version: value.version })
            }))
            .sort((a, b) => a.artifactId.localeCompare(b.artifactId)),
        ...(state.termination === undefined
            ? {}
            : {
                  termination: {
                      code: state.termination.code,
                      reason: state.termination.reason,
                      finalMessage: state.termination.finalMessage,
                      endedAt: state.termination.endedAt
                  }
              })
    };
}

export function renderCurrentMarkdown(document: DeveloperMeetingDocument): string {
    const frontMatter = [
        "---",
        "schemaVersion: 1",
        `meetingId: ${JSON.stringify(document.meetingId)}`,
        'projectionKind: "current"',
        "authoritative: false",
        `sourceMeetingVersion: ${document.sourceMeetingVersion}`,
        `generatedAt: ${JSON.stringify(new Date(document.generatedAt).toISOString())}`,
        "---"
    ].join("\n");
    const sections = currentHeadings.map(([title, key]) => renderSection(title, document[key]));
    return `# Current Meeting Projection\n\nThis file is a potentially stale, non-authoritative developer projection. The committed Meeting projection is authoritative.\n\n${frontMatter}\n\n${sections.join("\n\n")}\n`;
}

export function renderArchiveMarkdown(
    archivePackage: ImmutableArchivePackage,
    generatedAt: number
): string {
    const frontMatter = [
        "---",
        "schemaVersion: 1",
        `meetingId: ${JSON.stringify(archivePackage.meetingId)}`,
        'projectionKind: "archive"',
        "authoritative: false",
        `generatedAt: ${JSON.stringify(new Date(generatedAt).toISOString())}`,
        "---"
    ].join("\n");
    const packageValue = archivePackage as ArchivePackage;
    const sections = Object.keys(packageValue).map((key) =>
        renderSection(key, packageValue[key as keyof ArchivePackage])
    );
    return `# Archived Meeting Projection\n\nThis file is a potentially stale, non-authoritative developer projection. The committed Meeting projection is authoritative.\n\n${frontMatter}\n\n${sections.join("\n\n")}\n`;
}
