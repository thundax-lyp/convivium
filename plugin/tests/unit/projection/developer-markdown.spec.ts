import { describe, expect, it } from "vitest";

import {
    mapDeveloperMeetingDocument,
    renderArchiveMarkdown,
    renderCurrentMarkdown
} from "../../../src/projection/index.js";
import { archivePackage, meeting, now } from "../domain/transitions/fixtures.js";

describe("Developer Markdown projection", () => {
    it("maps only the current whitelist and renders deterministic sections", () => {
        const state = meeting("running");
        state.meetingTasks = [];
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
            { artifactId: "artifact-1", title: "Notes", version: "1" }
        ]);
        expect(document.generatedAt).toBe(now);
        expect(markdown).toMatch(/^---\nschemaVersion: 1\n/);
        expect(markdown).toContain("# Current Meeting Projection");
        expect(markdown).toContain("_None._");
        expect(markdown).not.toMatch(
            /attemptId|executionId|deliveryId|checksum|sourceMessageId|privateOutput|privateCriterion|privateConstraint/
        );
        expect(markdown.endsWith("\n")).toBe(true);
        expect(markdown.endsWith("\n\n")).toBe(false);
        expect(renderCurrentMarkdown(document)).toBe(markdown);
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

        expect(markdown).toMatch(/^---\nschemaVersion: 1\n/);
        expect(markdown).toContain("# Archived Meeting Projection");
        expect(markdown).toContain('"checksum": "sha256:source"');
        expect(markdown).not.toMatch(/attemptId|executionId|deliveryId|sourceMessageId/);
        expect(packageValue.artifactRefs[0]?.checksum).toBe("sha256:source");
    });
});
