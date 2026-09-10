import { describe, expect, it } from "vitest";

import {
    mapDeveloperMeetingDocument,
    renderArchiveMarkdown,
    renderCurrentMarkdown
} from "@/projection/index.js";
import { archivePackage, meeting, now } from "../domain/transitions/fixtures.js";

describe("Developer Markdown projection", () => {
    it("maps only the current whitelist and renders deterministic sections", () => {
        const state = meeting("running");
        state.agenda = ["agenda-2", "agenda-1"].map((id) => ({
            id,
            title: id,
            objective: "Discuss",
            status: "pending",
            inScope: [],
            outOfScope: [],
            completionCriteria: [],
            requiredParticipants: [],
            relatedTaskIds: []
        }));
        state.transcript = [2, 1].map((seq) => ({
            id: `message-${3 - seq}`,
            seq,
            turnSeq: 1,
            turnId: "turn-1",
            stepId: "step-1",
            attemptId: "attempt-secret",
            speaker: "participant-1",
            agendaItemId: "agenda-2",
            agendaRelation: "on_topic",
            content: `Message ${seq}`,
            kind: "statement",
            mentions: [],
            taskIds: [],
            createdAt: now
        }));
        state.meetingTasks = [
            {
                meetingTaskId: "task-1",
                participantId: "participant-1",
                originatingSpeakerAttemptId: "attempt-secret",
                executionId: "execution-secret",
                deliveryId: "delivery-secret",
                sourceTurnId: "turn-1",
                sourceStepId: "step-1",
                sourceContextFromSeq: 1,
                sourceContextThroughSeq: 2,
                sourceMessageId: "message-1",
                title: "Follow up",
                description: "Check output",
                blocking: true,
                status: "completed",
                createdAt: now,
                resultSummary: "Checked",
                finishedAt: now
            }
        ];
        state.objectiveContract.requiredOutputs = [
            { id: "output-1", description: "Output", status: "pending" }
        ];
        state.objectiveContract.acceptanceCriteria = [
            { id: "criterion-1", description: "Criterion", satisfied: false }
        ];
        state.objectiveContract.hardConstraints = [
            { id: "constraint-1", description: "Constraint" }
        ];
        state.artifactRefs = [
            { artifactId: "artifact-2", title: "Appendix" },
            {
                artifactId: "artifact-1",
                title: "Notes",
                version: "1",
                checksum: "sha256:secret-source"
            }
        ];
        const snapshot = {
            teamId: state.teamId,
            meetingId: state.id,
            version: state.version,
            state,
            createdAt: state.createdAt,
            updatedAt: state.updatedAt
        };

        Object.assign(state.objectiveContract.requiredOutputs[0]!, { privateOutput: "secret" });
        Object.assign(state.objectiveContract.acceptanceCriteria[0]!, {
            privateCriterion: "secret"
        });
        Object.assign(state.objectiveContract.hardConstraints[0]!, {
            privateConstraint: "secret"
        });

        const document = mapDeveloperMeetingDocument(snapshot, now);
        const markdown = renderCurrentMarkdown(document);

        expect(document.artifactRefs).toEqual([
            { artifactId: "artifact-1", title: "Notes", version: "1" },
            { artifactId: "artifact-2", title: "Appendix" }
        ]);
        expect(document.objectiveContract).toEqual({
            requiredOutputs: [{ id: "output-1", description: "Output", status: "pending" }],
            acceptanceCriteria: [{ id: "criterion-1", description: "Criterion", satisfied: false }],
            hardConstraints: [{ id: "constraint-1", description: "Constraint" }],
            requiredReviewers: [],
            riskAcceptanceAuthority: [],
            acceptableRiskLevel: "low"
        });
        expect(document.agenda).toEqual([
            { id: "agenda-2", title: "agenda-2", objective: "Discuss", status: "pending" },
            { id: "agenda-1", title: "agenda-1", objective: "Discuss", status: "pending" }
        ]);
        expect(document.transcript).toEqual([
            {
                id: "message-2",
                seq: 1,
                speaker: "participant-1",
                agendaItemId: "agenda-2",
                kind: "statement",
                content: "Message 1",
                createdAt: now
            },
            {
                id: "message-1",
                seq: 2,
                speaker: "participant-1",
                agendaItemId: "agenda-2",
                kind: "statement",
                content: "Message 2",
                createdAt: now
            }
        ]);
        expect(document.meetingTasks).toEqual([
            {
                meetingTaskId: "task-1",
                participantId: "participant-1",
                title: "Follow up",
                description: "Check output",
                blocking: true,
                status: "completed",
                createdAt: now,
                resultSummary: "Checked",
                finishedAt: now
            }
        ]);
        expect(markdown).toContain('"description": "Output"');
        expect(markdown).toContain('"description": "Criterion"');
        expect(markdown).toContain('"description": "Constraint"');
        expect(markdown).toContain('"resultSummary": "Checked"');
        expect(markdown.indexOf('"content": "Message 1"')).toBeGreaterThan(0);
        expect(markdown.indexOf('"content": "Message 2"')).toBeGreaterThan(
            markdown.indexOf('"content": "Message 1"')
        );
        expect(document.generatedAt).toBe(now);
        expect(
            markdown.startsWith(
                [
                    "---",
                    "schemaVersion: 1",
                    'meetingId: "meeting-1"',
                    'projectionKind: "current"',
                    "authoritative: false",
                    "sourceMeetingVersion: 3",
                    'generatedAt: "2023-11-14T22:13:20.000Z"',
                    "---",
                    "",
                    "# Current Meeting Projection",
                    "",
                    "This file is a potentially stale, non-authoritative developer projection. The committed Meeting projection is authoritative.",
                    ""
                ].join("\n")
            )
        ).toBe(true);
        expect(markdown.match(/^## .+$/gm)).toEqual([
            "## Objective",
            "## Objective Contract",
            "## Agenda",
            "## Transcript",
            "## Proposals and Positions",
            "## Decisions",
            "## Issues and Risks",
            "## Open Questions",
            "## Follow-up Tasks",
            "## Completion Facts",
            "## Artifacts",
            "## Termination"
        ]);
        expect(markdown).toContain("_None._");
        expect(markdown).not.toMatch(
            /attemptId|executionId|deliveryId|checksum|sourceMessageId|privateOutput|privateCriterion|privateConstraint/
        );
        expect(markdown.endsWith("\n")).toBe(true);
        expect(markdown.endsWith("\n\n")).toBe(false);
    });

    it("rejects an invalid MeetingState", () => {
        expect(() =>
            mapDeveloperMeetingDocument(
                {
                    teamId: "team-1",
                    meetingId: "meeting-1",
                    version: 1,
                    state: { formatVersion: 1 },
                    createdAt: now,
                    updatedAt: now
                },
                now
            )
        ).toThrow(new TypeError("Meeting snapshot state is invalid"));
    });

    it("renders archive artifact checksums from the immutable package unchanged", () => {
        const packageValue = archivePackage();
        packageValue.artifactRefs = [
            {
                artifactId: "artifact-1",
                title: "Release notes",
                version: "2",
                checksum: "sha256:source"
            }
        ];

        const markdown = renderArchiveMarkdown(packageValue, now);

        expect(
            markdown.startsWith(
                [
                    "---",
                    "schemaVersion: 1",
                    'meetingId: "meeting-1"',
                    'projectionKind: "archive"',
                    "authoritative: false",
                    'generatedAt: "2023-11-14T22:13:20.000Z"',
                    "---",
                    "",
                    "# Archived Meeting Projection",
                    "",
                    "This file is a potentially stale, non-authoritative developer projection. The committed Meeting projection is authoritative.",
                    ""
                ].join("\n")
            )
        ).toBe(true);
        expect(markdown.match(/^## .+$/gm)).toEqual([
            "## schemaVersion",
            "## meetingId",
            "## teamId",
            "## objectiveContract",
            "## finalSummary",
            "## artifactRefs",
            "## acceptedDecisions",
            "## decisionHistory",
            "## proposals",
            "## completionFacts",
            "## agenda",
            "## issues",
            "## unresolvedQuestions",
            "## parkingLot",
            "## formalTranscript",
            "## participantProvenance",
            "## termination",
            "## endedAt",
            "## materializedAt"
        ]);
        expect(markdown).toContain("_None._");
        expect(markdown.endsWith("\n")).toBe(true);
        expect(markdown.endsWith("\n\n")).toBe(false);
        expect(markdown).toContain('"checksum": "sha256:source"');
        expect(markdown).not.toMatch(/attemptId|executionId|deliveryId|sourceMessageId/);
        expect(packageValue.artifactRefs[0]?.checksum).toBe("sha256:source");
    });
});
