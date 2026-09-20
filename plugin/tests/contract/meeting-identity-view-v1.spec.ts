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

    it("separates recommendation visibility from Manager-only catalog visibility", () => {
        const state = makeRunningMeetingStateV1();
        state.identityRecommendations = [
            {
                id: "recommendation-1",
                candidateId: "candidate-1",
                definitionId: "architect-definition",
                definitionVersion: "1",
                definitionHash: "a".repeat(64),
                catalogId: "catalog-1",
                catalogVersion: "1",
                agendaId: "agenda-v1",
                decision: "reject",
                status: "rejected",
                rationale: "not needed",
                expectedContribution: "architecture",
                evidenceGap: "none",
                createdAt: 1,
                resolvedAt: 1
            }
        ];
        const snapshot = {
            meetingId: state.id,
            version: state.version,
            state,
            createdAt: 0,
            updatedAt: 1
        };
        const catalog = {
            protocolVersion: 1 as const,
            meetingId: state.id,
            catalogId: "catalog-1",
            catalogVersion: "1",
            generatedAt: 1,
            candidates: []
        };

        for (const caller of [{ kind: "local" as const }, { kind: "captain" as const }]) {
            const view = projectMeetingViewV1(snapshot, caller, catalog);
            expect(view.identityRecommendations).toHaveLength(1);
            expect(view).not.toHaveProperty("managerCatalog");
        }
        const manager = projectMeetingViewV1(
            snapshot,
            { kind: "identity", identityId: "manager-v1", roles: ["manager"] },
            catalog
        );
        expect(manager.identityRecommendations).toHaveLength(1);
        expect(manager.managerCatalog).toBeDefined();
    });

    it("projects only currently actionable decision candidates to Captain and local callers", () => {
        const state = makeRunningMeetingStateV1();
        state.proposals = [
            {
                id: "revision-current",
                proposalId: "proposal-1",
                ordinal: 2,
                actorId: "contributor-v1",
                agendaId: "agenda-v1",
                summary: "current",
                body: "current",
                evidenceIds: [],
                supersedesRevisionId: "revision-old",
                createdAt: 2
            }
        ];
        const candidate = (id: string, proposalRevisionId: string) => ({
            id,
            proposalRevisionId,
            actorId: "contributor-v1",
            outcome: "adopt" as const,
            rationale: "rationale",
            evidenceIds: [],
            positionIds: [],
            createdAt: 3
        });
        state.decisionCandidates = [
            candidate("candidate-pending", "revision-current"),
            candidate("candidate-old", "revision-old"),
            candidate("candidate-used", "revision-current")
        ];
        state.decisions = [
            {
                ...candidate("decision-1", "revision-current"),
                candidateId: "candidate-used",
                status: "accepted"
            }
        ];
        const snapshot = {
            meetingId: state.id,
            version: state.version,
            state,
            createdAt: 0,
            updatedAt: 3
        };

        for (const caller of [{ kind: "local" as const }, { kind: "captain" as const }])
            expect(
                projectMeetingViewV1(snapshot, caller).outcomes.pendingDecisionCandidates?.map(
                    ({ id }) => id
                )
            ).toEqual(["candidate-pending"]);

        state.lifecycle = { status: "terminal", changedAt: 4 };
        expect(
            projectMeetingViewV1(snapshot, { kind: "local" }).outcomes.pendingDecisionCandidates
        ).toEqual([]);
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
