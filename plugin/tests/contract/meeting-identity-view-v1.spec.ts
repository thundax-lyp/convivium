import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../fixtures/meeting-state-v1.js";
import { projectMeetingViewV1 } from "@/projection/meeting-view-v1.js";
import { endMeetingV1, startMeetingArchiveV1 } from "@/domain/index.js";
describe("identity filtered view and archive provenance", () => {
    it("hides Manager catalog from Participant and does not expose Session fields", () => {
        const state = makeRunningMeetingStateV1();
        const snapshot = {
            teamId: "team-1",
            meetingId: state.id,
            version: state.version,
            state,
            createdAt: 0,
            updatedAt: 0
        };
        const catalog = {
            protocolVersion: 1 as const,
            meetingId: state.id,
            catalogId: "catalog-1",
            catalogVersion: "1",
            generatedAt: 1,
            candidates: []
        };
        expect(
            projectMeetingViewV1(
                snapshot,
                { kind: "identity", identityId: "contributor-v1", roles: ["contributor"] },
                catalog
            )
        ).not.toHaveProperty("managerCatalog");
        const manager = projectMeetingViewV1(
            snapshot,
            { kind: "identity", identityId: "manager-v1", roles: ["manager"] },
            catalog
        );
        expect(manager.managerCatalog).toEqual({
            catalogId: "catalog-1",
            catalogVersion: "1",
            candidates: []
        });
        expect(manager).not.toHaveProperty("state");
        expect(manager).not.toHaveProperty("meetingVersion");
    });

    it("keeps unpublished evidence private while exposing an author version only to its author", () => {
        const state = makeRunningMeetingStateV1();
        const version = {
            id: "version-private",
            ordinal: 1,
            observation: "private observation",
            interpretation: "interpretation",
            method: "method",
            falsifiers: [],
            uncertainties: [],
            limitations: [],
            claims: [],
            materials: [],
            submittedAt: 1
        };
        state.evidencePackages = [
            {
                id: "package-private",
                roundId: "round-1",
                contributionId: "contribution-1",
                authorId: "contributor-v1",
                agendaId: "agenda-v1",
                currentVersionId: version.id,
                versions: [version]
            }
        ];
        state.registrations = [
            { id: "registration-1", versionId: version.id, status: "complete", createdAt: 1 }
        ];
        const snapshot = {
            meetingId: state.id,
            version: state.version,
            state,
            createdAt: 0,
            updatedAt: 1
        };
        const author = projectMeetingViewV1(snapshot, {
            kind: "identity",
            identityId: "contributor-v1",
            roles: ["contributor"]
        });
        const other = projectMeetingViewV1(snapshot, {
            kind: "identity",
            identityId: "other-contributor",
            roles: ["contributor"]
        });
        const manager = projectMeetingViewV1(snapshot, {
            kind: "identity",
            identityId: "manager-v1",
            roles: ["manager"]
        });
        const reviewer = projectMeetingViewV1(snapshot, {
            kind: "identity",
            identityId: "reviewer-v1",
            roles: ["evidence_reviewer"]
        });
        expect(author.evidencePackages).toHaveLength(1);
        expect(reviewer.evidencePackages).toHaveLength(1);
        expect(other.evidencePackages).toEqual([]);
        expect(manager.evidencePackages).toEqual([]);
    });

    it("projects the value archive locally without identity ownership data", () => {
        const terminal = endMeetingV1(makeRunningMeetingStateV1(), {
            terminationId: "termination-1",
            outcome: "partial",
            reason: "done",
            decisionIds: [],
            completionFactIds: [],
            unresolvedQuestionIds: [],
            unresolvedIssueIds: [],
            actorId: "local",
            now: 2
        });
        expect(terminal.kind).toBe("accepted");
        if (terminal.kind !== "accepted") return;
        const archiving = startMeetingArchiveV1(terminal.state, {
            archiveId: "archive-1",
            actorId: "runtime-recovery",
            now: 3,
            questionIssueDispositionFacts: []
        });
        expect(archiving.kind).toBe("accepted");
        if (archiving.kind !== "accepted") return;
        const view = projectMeetingViewV1(
            {
                meetingId: archiving.state.id,
                version: archiving.state.version,
                state: archiving.state,
                createdAt: 0,
                updatedAt: 3
            },
            { kind: "local" }
        );
        expect(view.archive).toMatchObject({ id: "archive-1", terminationId: "termination-1" });
        expect(JSON.stringify(view)).not.toMatch(/sessionOwnership|sessionId|capability/);
    });
});
