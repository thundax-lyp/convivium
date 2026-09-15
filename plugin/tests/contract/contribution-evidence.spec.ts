import { describe, expect, it } from "vitest";
import {
    isMeetingStateV2,
    type ContributionTask,
    type EvidenceVersion,
    type MeetingState
} from "@/domain/index.js";
import * as projection from "@/projection/index.js";
import { MeetingStatusResultSchema, ReadContributionResultSchema } from "@/protocol/index.js";
import { contributionMeeting, contributionNow as now } from "../fixtures/contribution.js";
import { archivePackage } from "../unit/domain/transitions/fixtures.js";
import { DomainMeetingRepository } from "@/repository/domain/domain-meeting-repository.js";
import { JsonObjectSchema } from "@/repository/domain/schemas.js";
import { loadProjection } from "@/repository/domain/projection.js";
import { createFakeCatalogDomain, createFakeMeetingDomain } from "../fixtures/domain-storage.js";

const captain = { kind: "captain", sessionId: "captain-1" } as const;
const participant = (participantId: string) => ({
    kind: "participant" as const,
    sessionId: participantId,
    participantId
});
const input = (contributionId = "task-a") => ({
    protocolVersion: 1 as const,
    meetingId: "meeting-1",
    contributionId
});

function material(revision: number): EvidenceVersion {
    return {
        evidenceId: "source",
        revision,
        key: `source:${revision}`,
        submittedBy: "participant-1",
        submittedAt: now,
        title: "Evidence",
        kind: "document",
        source: "fixture",
        sourceDate: "2026-09-15",
        collectedAt: "2026-09-15",
        locator: "section 1",
        observation: "observed",
        methodAndConditions: "inspection",
        limitations: "static",
        dependencies: "none",
        material: {
            kind: "text",
            text: revision === 1 ? "original amber-47" : "replacement amber-48"
        }
    };
}

function state(): MeetingState {
    const base = contributionMeeting();
    delete base.termination;
    const task: ContributionTask = {
        id: "task-a",
        participantId: base.participants[0]!.id,
        agendaItemId: base.agenda[0]!.id,
        instruction: "private instruction",
        targetIds: [],
        requiredForCompletion: true,
        requiresEvidenceReview: true,
        generation: 2,
        phase: "boundary_review",
        basedOnSeq: 0,
        deadlineAt: now + 600000,
        createdAt: now,
        updatedAt: now,
        currentDraftRevision: 2,
        returnCount: 1,
        drafts: Object.fromEntries(
            [1, 2].map((revision) => [
                String(revision),
                {
                    revision,
                    basedOnSeq: 0,
                    submittedAt: now,
                    message: {
                        id: `message-${revision}`,
                        kind: "statement" as const,
                        content: `private draft ${revision}`,
                        mentions: [],
                        taskIds: [],
                        agendaRelation: "on_topic" as const,
                        createdAt: now
                    },
                    claims: {
                        questions: [],
                        issues: [],
                        proposals: [],
                        positions: [],
                        agendaCandidates: [],
                        decisionCandidates: []
                    },
                    citations: [
                        {
                            evidenceKey: `source:${revision}`,
                            claim: "observation",
                            locator: "section 1",
                            inference: "direct"
                        }
                    ]
                }
            ])
        ),
        boundaryReviews: [
            {
                draftRevision: 1,
                decision: "return",
                reason: "private review",
                checkedThroughSeq: 0,
                actor: "manager",
                reviewedAt: now
            }
        ],
        evidenceReviews: [],
        reviewStatus: "pending"
    };
    return {
        ...base,
        meetingTasks: [],
        contributions: {
            schemaVersion: 1,
            reviewerId: base.participants[1]!.id,
            managerNoticeSeq: 1,
            managerDeadlineAt: now + 600000,
            tasks: { "task-a": task },
            evidence: { "source:1": material(1), "source:2": material(2) }
        }
    };
}

describe("contribution evidence projection", () => {
    it("sends Manager only boundary-review summaries", () => {
        const meeting = state();
        const boundary = meeting.contributions!.tasks["task-a"]!;
        meeting.contributions!.tasks["task-preparing"] = {
            ...boundary,
            id: "task-preparing",
            phase: "preparing"
        };
        meeting.contributions!.tasks["task-returned"] = {
            ...boundary,
            id: "task-returned",
            phase: "returned"
        };
        const work = projection.projectContributionContext(
            meeting,
            { kind: "manager", sessionId: "manager-1" },
            { role: "contribution_manager", noticeSeq: 1, contextThroughSeq: meeting.messageSeq },
            "delivery-1"
        ).work;
        expect(work).toEqual({
            kind: "manager",
            pending: [expect.objectContaining({ id: "task-a" })]
        });
    });

    it("does not disclose a foreign private material through a forged draft citation", () => {
        const meeting = state();
        meeting.contributions!.evidence["private:1"] = {
            ...material(1),
            evidenceId: "private",
            key: "private:1",
            submittedBy: "participant-2"
        };
        meeting.contributions!.tasks["task-a"]!.drafts["2"]!.citations = [
            {
                evidenceKey: "private:1",
                claim: "borrowed",
                locator: "private",
                inference: "private"
            }
        ];
        expect(isMeetingStateV2(meeting)).toBe(true);
        expect(() =>
            projection.projectContributionRead(meeting, participant("participant-1"), {
                ...input(),
                evidenceKey: "private:1"
            })
        ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED_CALLER" }));
    });

    it("rejects evidence versions that change owner", () => {
        const meeting = state();
        meeting.contributions!.evidence["source:2"]!.submittedBy = "participant-2";
        expect(isMeetingStateV2(meeting)).toBe(false);
    });

    it("publishes only whitelisted summaries, without private text in status or Markdown", () => {
        const meeting = state();
        expect(isMeetingStateV2(meeting)).toBe(true);
        const status = projection.projectMeetingStatus(meeting, captain);
        expect(status.contributions).toEqual({
            reviewerId: "participant-2",
            tasks: [
                {
                    id: "task-a",
                    participantId: "participant-1",
                    agendaItemId: meeting.agenda[0]!.id,
                    phase: "boundary_review",
                    generation: 2,
                    currentDraftRevision: 2,
                    requiredForCompletion: true,
                    requiresEvidenceReview: true,
                    reviewStatus: "pending",
                    deadlineAt: now + 600000
                }
            ]
        });
        expect(MeetingStatusResultSchema(status).contributions).toEqual(status.contributions);
        expect(JSON.stringify(status)).not.toContain("private");
        const document = projection.mapDeveloperMeetingDocument(
            {
                meetingId: meeting.id,
                teamId: meeting.teamId,
                version: meeting.version,
                state: JsonObjectSchema.parse(meeting),
                createdAt: now,
                updatedAt: now
            },
            now
        );
        expect(projection.renderCurrentMarkdown(document)).not.toContain("private");
        expect(projection.projectContributionSummaries(meeting, participant("outsider"))).toEqual(
            []
        );
        expect(
            projection.projectContributionSummaries(meeting, participant("participant-1"))
        ).toHaveLength(1);
    });

    it("keeps boundary-review drafts private from the fixed reviewer and permits published pending evidence", () => {
        const meeting = state();
        const old = projection.projectContributionRead(meeting, participant("participant-1"), {
            ...input(),
            draftRevision: 1,
            evidenceKey: "source:1"
        });
        expect(ReadContributionResultSchema(old)).toEqual(old);
        expect(old.drafts.map((draft) => draft.message.content)).toEqual(["private draft 1"]);
        expect(old.evidence?.material).toEqual({ kind: "text", text: "original amber-47" });
        expect(old.boundaryReviews).toHaveLength(1);
        expect(() =>
            projection.projectContributionRead(meeting, participant("participant-2"), {
                ...input(),
                evidenceKey: "source:2"
            })
        ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED_CALLER" }));
        for (const request of [
            { ...input(), draftRevision: 1 },
            { ...input(), evidenceKey: "source:1" },
            input("missing")
        ]) {
            expect(() =>
                projection.projectContributionRead(meeting, participant("participant-2"), request)
            ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED_CALLER" }));
        }
        expect(() =>
            projection.projectContributionRead(meeting, participant("outsider"), input())
        ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED_CALLER" }));
        expect(() =>
            projection.projectContributionRead(meeting, captain, { ...input(), meetingId: "other" })
        ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED_CALLER" }));
        const task = meeting.contributions!.tasks["task-a"]!;
        task.phase = "published";
        task.messageId = "message-2";
        const published = projection.projectContributionRead(
            meeting,
            participant("participant-2"),
            {
                ...input(),
                evidenceKey: "source:2"
            }
        );
        expect(published.drafts.map((draft) => draft.revision)).toEqual([2]);
        expect(published.evidence?.material).toEqual({
            kind: "text",
            text: "replacement amber-48"
        });
        expect(published.boundaryReviews).toEqual([]);
    });

    it("rejects damaged evidence references and fixed capacity overflow as invalid state", () => {
        const meeting = state();
        meeting.contributions!.evidence = { "source:1": material(1) };
        expect(isMeetingStateV2(meeting)).toBe(false);
        const oversized = state();
        oversized.contributions!.tasks = Object.fromEntries(
            Array.from({ length: 65 }, (_, index) => {
                const id = `task-${index}`;
                return [id, { ...oversized.contributions!.tasks["task-a"]!, id }];
            })
        );
        expect(isMeetingStateV2(oversized)).toBe(false);
    });
});

describe("contribution evidence archive and persistence", () => {
    it("restricts public archive reads to listed published tasks and their material dependencies", () => {
        const meeting = state();
        const task = meeting.contributions!.tasks["task-a"]!;
        task.phase = "published";
        task.messageId = "message-2";
        const code = meeting.contributions!.evidence["source:2"]!;
        code.kind = "code";
        code.code = {
            repository: "repo",
            revision: "commit",
            pathsAndSymbols: "main.ts",
            patchEvidenceKeys: ["source:1"],
            validation: "static_only",
            reproduction: "inspection",
            expected: "value",
            observed: "value",
            notCovered: "execution"
        };
        const publicViewer = participant("participant-2");
        expect(
            projection.projectContributionRead(meeting, publicViewer, {
                ...input(),
                evidenceKey: "source:1"
            }).evidence?.material
        ).toEqual({ kind: "text", text: "original amber-47" });
        meeting.status = "archived";
        const archive = archivePackage();
        archive.contributionRefs = { taskIds: ["task-a"], evidenceKeys: ["source:1", "source:2"] };
        meeting.archive = { package: archive, archivedAt: now };
        const result = projection.projectContributionRead(meeting, publicViewer, {
            ...input(),
            evidenceKey: "source:1"
        });
        expect(result.boundaryReviews).toEqual([]);
        expect(result.drafts.map((draft) => draft.revision)).toEqual([2]);
        expect(() =>
            projection.projectContributionRead(meeting, publicViewer, {
                ...input(),
                draftRevision: 1
            })
        ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED_CALLER" }));
        archive.contributionRefs = { taskIds: ["task-a"], evidenceKeys: ["source:2"] };
        expect(() =>
            projection.projectContributionRead(meeting, publicViewer, {
                ...input(),
                evidenceKey: "source:1"
            })
        ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED_CALLER" }));
        archive.contributionRefs = { taskIds: [], evidenceKeys: [] };
        expect(projection.projectContributionSummaries(meeting, publicViewer)).toEqual([]);
        expect(() => projection.projectContributionRead(meeting, publicViewer, input())).toThrow(
            expect.objectContaining({ code: "UNAUTHORIZED_CALLER" })
        );
        expect(
            projection.projectContributionRead(meeting, captain, { ...input(), draftRevision: 1 })
                .boundaryReviews
        ).toHaveLength(1);
    });

    it.each(["material bytes", "canonical bytes", "patch reference", "draft structure"])(
        "rejects %s corruption before storage",
        (kind) => {
            const meeting = state();
            if (kind === "material bytes")
                meeting.contributions!.evidence["source:1"]!.material = {
                    kind: "text",
                    text: "中".repeat(3000)
                };
            if (kind === "canonical bytes") meeting.topic = "x".repeat(24577);
            if (kind === "patch reference") {
                meeting.contributions!.evidence["source:1"]!.kind = "code";
                meeting.contributions!.evidence["source:1"]!.code = {
                    repository: "repo",
                    revision: "commit",
                    pathsAndSymbols: "main.ts",
                    patchEvidenceKeys: ["absent:1"],
                    validation: "static_only",
                    reproduction: "read",
                    expected: "value",
                    observed: "value",
                    notCovered: "execution"
                };
            }
            if (kind === "draft structure")
                Reflect.deleteProperty(
                    meeting.contributions!.tasks["task-a"]!.drafts["1"]!.message,
                    "content"
                );
            expect(isMeetingStateV2(meeting)).toBe(false);
        }
    );

    it("preserves exact material revisions, receipts, events and outbox across failed commits and reopen", async () => {
        const catalogDomain = createFakeCatalogDomain();
        const meetingDomain = createFakeMeetingDomain();
        const options = {
            catalogDomain,
            meetingDomain,
            teamId: "team-1",
            meetingId: "meeting-1",
            now: () => now,
            authorizationValidator: { validateCreate() {}, validateCommand() {} }
        };
        let repository = await DomainMeetingRepository.open(options);
        try {
            const initial = state();
            const authorization = { callerBinding: "captain:1", capabilityId: "capability:1" };
            const create = {
                requestId: "create",
                authorization,
                requestHash: "create-hash",
                initialState: JsonObjectSchema.parse(initial)
            };
            await repository.create(create);
            await repository.completeCreate(create);
            const before = await repository.read();
            const beforeProjection = loadProjection({ domain: meetingDomain });
            const next = state();
            next.contributions!.evidence = {
                ...next.contributions!.evidence,
                "source:3": material(3)
            };
            const command = {
                requestId: "save-3",
                commandKind: "contribution.save_evidence",
                authorization,
                requestHash: "save-3-hash",
                expectedMeetingVersion: before.version,
                transition: () => ({
                    state: JsonObjectSchema.parse(next),
                    result: { evidenceKey: "source:3" },
                    events: [
                        {
                            type: "contribution.evidence_saved" as const,
                            payload: { evidenceKey: "source:3" }
                        }
                    ],
                    outbox: [
                        {
                            id: "notice",
                            deliveryId: "delivery",
                            kind: "dispatch" as const,
                            payload: { evidenceKey: "source:3" }
                        }
                    ]
                })
            };
            meetingDomain.failNextPut("commits", "*");
            await expect(repository.execute(command)).rejects.toThrow();
            expect(await repository.read()).toEqual(before);
            expect(loadProjection({ domain: meetingDomain })).toEqual(beforeProjection);
            const committed = await repository.execute(command);
            expect(await repository.execute(command)).toEqual(committed);
            const after = loadProjection({ domain: meetingDomain });
            expect(after).not.toEqual(beforeProjection);
            await repository.close();
            repository = await DomainMeetingRepository.open(options);
            expect(await repository.execute(command)).toEqual(committed);
            expect(loadProjection({ domain: meetingDomain })).toEqual(after);
            const recovered = (await repository.read()).state;
            if (!isMeetingStateV2(recovered)) throw new Error("Invalid recovered snapshot");
            const read = projection.projectContributionRead(recovered, captain, {
                ...input(),
                draftRevision: 1,
                evidenceKey: "source:1"
            });
            expect(read.evidence?.material).toEqual({ kind: "text", text: "original amber-47" });
            expect(
                projection.projectContributionRead(recovered, captain, {
                    ...input(),
                    evidenceKey: "source:2"
                }).evidence?.material
            ).toEqual({ kind: "text", text: "replacement amber-48" });
            const invalid = {
                ...command,
                requestId: "invalid",
                requestHash: "invalid",
                expectedMeetingVersion: committed.meetingVersion,
                transition: () => ({
                    ...command.transition(),
                    state: JsonObjectSchema.parse({ ...next, topic: "x".repeat(24577) })
                })
            };
            await expect(repository.execute(invalid)).rejects.toThrow();
            expect(loadProjection({ domain: meetingDomain })).toEqual(after);
        } finally {
            await repository.close();
        }
    });
});
