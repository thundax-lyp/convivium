import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import Storage from "@deepseek-ai/dsh-storage";
import * as storageDomainPlugin from "@deepseek-ai/dsh-storage-domain";
import type { Domain, DomainSpec } from "@deepseek-ai/dsh-storage-domain";
import type { ArchivePackage, MeetingState } from "../../src/domain/index.js";
import { openMeetingRepository } from "../../src/runtime/index.js";
import { createCreateStatusRuntime } from "../../src/runtime/application-service/index.js";
import {
    DomainRepositoryRegistry,
    type DomainFacilityPort
} from "../../src/repository/domain/domain-repository-registry.js";
import { jsonlStoragePlugin } from "../../src/storage/index.js";

const roots: string[] = [];
const storageContexts: Array<Promise<Context>> = [];

function storagePort(root: string): DomainFacilityPort {
    const mounting = (async () => {
        const ctx = new Context();
        await ctx.plugin(Storage);
        await ctx.plugin(jsonlStoragePlugin, { root: join(root, "storage") });
        await ctx.plugin(
            {
                name: storageDomainPlugin.name,
                inject: storageDomainPlugin.inject,
                apply: storageDomainPlugin.apply
            },
            { backend: "convivium-jsonl" }
        );
        return ctx;
    })();
    storageContexts.push(mounting);
    return {
        async open<S extends DomainSpec>(spec: S): Promise<Domain<S>> {
            return (await mounting).storageDomain.open(spec);
        }
    };
}

async function openTestRegistry(root: string): Promise<DomainRepositoryRegistry> {
    return DomainRepositoryRegistry.open({
        storageDomain: storagePort(root),
        authorizationValidator: {
            validateCreate: () => undefined,
            validateCommand: () => undefined
        }
    });
}

const baseInput = {
    protocolVersion: 1 as const,
    requestId: "source-create",
    teamId: "team-1",
    topic: "Source archive",
    objective: "Preserve selected archive material",
    objectiveContract: {
        requiredOutputs: [],
        acceptanceCriteria: [{ key: "reviewed", description: "Reviewed" }],
        hardConstraints: [],
        requiredReviewerKeys: [],
        riskAcceptanceAuthorityKeys: [],
        acceptableRiskLevel: "medium" as const
    },
    agenda: [
        {
            key: "agenda-1",
            title: "Scope",
            objective: "Agree scope",
            inScope: ["MVP"],
            outOfScope: [],
            completionCriteria: ["Reviewed"],
            requiredParticipantKeys: ["one"]
        }
    ],
    participants: [{ participantKey: "one", displayName: "One" }]
};

const captain = {
    sessionId: "captain-source",
    kind: "captain" as const,
    agent: { id: "captain-source" } as never
};

function runtime(root: string, starts: string[]) {
    return createCreateStatusRuntime({
        storageDomain: storagePort(root),
        provider: "spawn",
        continuable: {
            startContinuable: async (spec) => {
                starts.push(String(spec.childId));
                return {
                    childId: spec.childId!,
                    messageId: `initial-${String(spec.childId)}` as never
                };
            },
            followup: async () => "followup-message" as never
        },
        authorizationValidator: {
            validateCreate: () => undefined,
            validateCommand: () => undefined
        }
    });
}

function archiveFixture(meetingId: string): ArchivePackage {
    return {
        schemaVersion: 1,
        meetingId,
        teamId: "team-1",
        objectiveContract: {
            requiredOutputs: [],
            acceptanceCriteria: [
                { id: "criterion-reviewed", description: "Reviewed", satisfied: true }
            ],
            hardConstraints: [],
            requiredReviewers: [],
            riskAcceptanceAuthority: [],
            acceptableRiskLevel: "medium"
        },
        finalSummary: "Final source summary",
        artifactRefs: [
            { artifactId: "artifact-1", title: "Release notes", checksum: "sha256:artifact-1" },
            { artifactId: "artifact-unselected", title: "Do not copy" }
        ],
        acceptedDecisions: [
            {
                id: "decision-1",
                proposalId: "proposal-1",
                proposalRevision: 1,
                status: "accepted",
                statement: "Adopt the narrow release scope"
            }
        ],
        proposals: [],
        completionFacts: [
            {
                id: "evidence-1",
                kind: "criterion_evidence",
                subjectId: "criterion-reviewed",
                assertedBy: "participant-one",
                result: "approved",
                evidenceMessageIds: [],
                taskIds: [],
                reason: "Review evidence is complete",
                status: "active"
            }
        ],
        agenda: [],
        issues: [
            {
                id: "issue-1",
                title: "Follow-up compatibility item",
                description: "Track after the release",
                disposition: "follow_up",
                status: "deferred",
                relatedTaskIds: []
            },
            {
                id: "risk-1",
                title: "Accepted rollout risk",
                description: "Rollback is documented",
                disposition: "accepted_risk",
                status: "accepted_risk",
                relatedTaskIds: []
            }
        ],
        unresolvedQuestions: [],
        parkingLot: [],
        formalTranscript: [],
        participantProvenance: [],
        termination: {
            code: "objective_satisfied",
            reason: "Source complete",
            decisionIds: ["decision-1"],
            unresolvedQuestionIds: [],
            dissentingPositionIds: [],
            blockingAgendaItemIds: [],
            finalMessage: "Source complete",
            endedAt: 10
        },
        endedAt: 10,
        materializedAt: 11
    };
}

async function meetingIds(runtime: ReturnType<typeof createCreateStatusRuntime>) {
    const listed = await runtime.listLocalMeetings();
    return listed.result.meetings.map(({ meetingId }) => meetingId).sort();
}

async function createArchivedSource(
    root: string,
    starts: string[],
    amendArchive?: (archive: ArchivePackage) => ArchivePackage
) {
    const sourceRuntime = runtime(root, starts);
    const created = await sourceRuntime.createMeeting(
        baseInput,
        captain,
        new AbortController().signal
    );
    if (!created.ok) throw new Error("source create failed");
    await sourceRuntime.dispose();

    const registry = await openTestRegistry(root);
    const repository = await openMeetingRepository({
        registry: Promise.resolve(registry),
        teamId: "team-1",
        meetingId: created.result.meetingId
    });
    const snapshot = await repository.read();
    const archive =
        amendArchive?.(archiveFixture(created.result.meetingId)) ??
        archiveFixture(created.result.meetingId);
    const archived = structuredClone(snapshot.state) as unknown as MeetingState;
    archived.status = "archived";
    archived.currentTurn = undefined;
    archived.termination = archive.termination;
    archived.archive = { package: archive, archivedAt: 12 };
    await repository.execute({
        requestId: "fixture-archive",
        commandKind: "fixture_archive",
        authorization: { callerBinding: "fixture", capabilityId: "fixture" },
        requestHash: "fixture-archive-v1",
        expectedMeetingVersion: snapshot.version,
        transition: () => ({
            state: archived as never,
            result: { status: "archived" },
            events: [{ type: "meeting.archived", payload: {} }],
            outbox: []
        })
    });
    await registry.close();
    return created.result.meetingId;
}

async function serializedSourceState(root: string, meetingId: string): Promise<string> {
    const registry = await openTestRegistry(root);
    const repository = await openMeetingRepository({
        registry: Promise.resolve(registry),
        teamId: "team-1",
        meetingId
    });
    try {
        return JSON.stringify((await repository.read()).state);
    } finally {
        await registry.close();
    }
}

function continuationInput(sourceMeetingId: string, requestId = "continuation-create") {
    return {
        ...baseInput,
        requestId,
        topic: "Continuation target",
        continuation: {
            sourceMeetingId,
            includeFinalSummary: true,
            decisionIds: ["decision-1"],
            unresolvedIssueIds: ["issue-1"],
            riskIds: ["risk-1"],
            evidenceIds: ["evidence-1"],
            artifactIds: ["artifact-1"]
        }
    };
}

afterEach(async () => {
    await Promise.all(storageContexts.map(async (context) => (await context).fiber.dispose()));
    storageContexts.length = 0;
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("archive continuation create contract", () => {
    it("copies only explicitly selected archived material into a new meeting with new Sessions", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-continuation-success-"));
        roots.push(root);
        const starts: string[] = [];
        const sourceMeetingId = await createArchivedSource(root, starts);
        const beforeMeetingIds = [sourceMeetingId];
        const sourceBefore = await serializedSourceState(root, sourceMeetingId);

        const targetRuntime = runtime(root, starts);
        const request = continuationInput(sourceMeetingId);
        const created = await targetRuntime.createMeeting(
            request,
            captain,
            new AbortController().signal
        );
        if (!created.ok) throw new Error(`continuation create failed: ${created.code}`);
        const targetId = created.result.meetingId;
        const status = await targetRuntime.getStatus(
            { protocolVersion: 1, meetingId: targetId },
            captain
        );

        expect(status).toMatchObject({
            ok: true,
            result: {
                continuationMaterials: [
                    { sourceKind: "final_summary", summary: "Final source summary" },
                    {
                        sourceKind: "decision",
                        sourceObjectId: "decision-1",
                        summary: "Adopt the narrow release scope"
                    },
                    {
                        sourceKind: "issue",
                        sourceObjectId: "issue-1",
                        summary: "Follow-up compatibility item"
                    },
                    {
                        sourceKind: "risk",
                        sourceObjectId: "risk-1",
                        summary: "Accepted rollout risk"
                    },
                    {
                        sourceKind: "evidence",
                        sourceObjectId: "evidence-1",
                        summary: "Review evidence is complete"
                    },
                    {
                        sourceKind: "artifact",
                        sourceObjectId: "artifact-1",
                        summary: "Release notes",
                        checksum: "sha256:artifact-1"
                    }
                ]
            }
        });
        if (!status.ok) throw new Error("status failed");
        expect(status.result.continuationMaterials).toHaveLength(6);
        expect(JSON.stringify(status.result.continuationMaterials)).not.toContain("Do not copy");
        expect(targetId).not.toBe(sourceMeetingId);
        expect(starts.filter((id) => id.includes(sourceMeetingId))).toHaveLength(2);
        expect(starts.filter((id) => id.includes(targetId))).toHaveLength(2);
        expect(await meetingIds(targetRuntime)).toEqual(
            expect.arrayContaining([...beforeMeetingIds, targetId])
        );
        expect(await serializedSourceState(root, sourceMeetingId)).toBe(sourceBefore);
        const startsBeforeReplay = starts.length;
        await expect(
            targetRuntime.createMeeting(request, captain, new AbortController().signal)
        ).resolves.toEqual(created);
        expect(starts).toHaveLength(startsBeforeReplay);
        await expect(
            targetRuntime.createMeeting(
                { ...request, topic: "Conflicting replay" },
                captain,
                new AbortController().signal
            )
        ).resolves.toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
        await targetRuntime.dispose();

        const coldRuntime = runtime(root, starts);
        const startsBeforeColdReplay = starts.length;
        await expect(
            coldRuntime.createMeeting(request, captain, new AbortController().signal)
        ).resolves.toEqual(created);
        expect(starts).toHaveLength(startsBeforeColdReplay);
        const reopened = await coldRuntime.getStatus(
            { protocolVersion: 1, meetingId: targetId },
            captain
        );
        if (!reopened.ok) throw new Error(`cold continuation status failed: ${reopened.code}`);
        expect(reopened.result.continuationMaterials).toEqual(
            expect.arrayContaining([
                { sourceMeetingId, sourceKind: "final_summary", summary: "Final source summary" },
                {
                    sourceMeetingId,
                    sourceKind: "artifact",
                    sourceObjectId: "artifact-1",
                    summary: "Release notes",
                    checksum: "sha256:artifact-1"
                }
            ])
        );
        expect(await serializedSourceState(root, sourceMeetingId)).toBe(sourceBefore);
        await coldRuntime.dispose();
    });

    it("rejects unavailable source and invalid selections before target creation", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-continuation-reject-"));
        roots.push(root);
        const starts: string[] = [];
        const sourceMeetingId = await createArchivedSource(root, starts);
        const targetRuntime = runtime(root, starts);
        const beforeStarts = starts.length;

        const cases = [
            [
                "missing source",
                continuationInput("missing-source", "missing-source"),
                captain,
                "ARCHIVE_MATERIAL_NOT_FOUND"
            ],
            [
                "wrong Captain",
                continuationInput(sourceMeetingId, "wrong-captain"),
                { ...captain, sessionId: "captain-other", agent: { id: "captain-other" } as never },
                "ARCHIVE_MATERIAL_NOT_FOUND"
            ],
            [
                "cross Team",
                { ...continuationInput(sourceMeetingId, "cross-team"), teamId: "team-2" },
                captain,
                "ARCHIVE_MATERIAL_NOT_FOUND"
            ],
            [
                "wrong kind",
                {
                    ...continuationInput(sourceMeetingId, "wrong-kind"),
                    continuation: {
                        ...continuationInput(sourceMeetingId).continuation,
                        decisionIds: ["issue-1"]
                    }
                },
                captain,
                "ARCHIVE_MATERIAL_NOT_FOUND"
            ],
            [
                "partial invalid",
                {
                    ...continuationInput(sourceMeetingId, "partial-invalid"),
                    continuation: {
                        ...continuationInput(sourceMeetingId).continuation,
                        artifactIds: ["artifact-1", "missing-artifact"]
                    }
                },
                captain,
                "ARCHIVE_MATERIAL_NOT_FOUND"
            ],
            [
                "duplicate ID",
                {
                    ...continuationInput(sourceMeetingId, "duplicate-id"),
                    continuation: {
                        ...continuationInput(sourceMeetingId).continuation,
                        decisionIds: ["decision-1", "decision-1"]
                    }
                },
                captain,
                "INVALID_ARGUMENT"
            ],
            [
                "cross issue risk duplicate",
                {
                    ...continuationInput(sourceMeetingId, "duplicate-issue-risk"),
                    continuation: {
                        ...continuationInput(sourceMeetingId).continuation,
                        riskIds: ["issue-1"]
                    }
                },
                captain,
                "INVALID_ARGUMENT"
            ]
        ] as const;

        for (const [label, input, caller, code] of cases) {
            const result = await targetRuntime.createMeeting(
                input,
                caller,
                new AbortController().signal
            );
            expect(result, label).toMatchObject({ ok: false, code });
            const targetId = `meeting-${createHash("sha256")
                .update(`${input.teamId}\0${input.requestId}`)
                .digest("hex")
                .slice(0, 32)}`;
            expect(await meetingIds(targetRuntime)).not.toContain(targetId);
            expect(starts).toHaveLength(beforeStarts);
        }
        await targetRuntime.dispose();
    });

    it("rejects a resolved blocking issue selected as unresolved before target creation", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-continuation-resolved-issue-"));
        roots.push(root);
        const starts: string[] = [];
        const sourceMeetingId = await createArchivedSource(root, starts, (archive) => ({
            ...archive,
            issues: archive.issues.map((issue) =>
                issue.id === "issue-1" ? { ...issue, status: "resolved" } : issue
            )
        }));
        const targetRuntime = runtime(root, starts);
        const request = continuationInput(sourceMeetingId, "resolved-issue");
        const beforeStarts = starts.length;

        await expect(
            targetRuntime.createMeeting(request, captain, new AbortController().signal)
        ).resolves.toMatchObject({ ok: false, code: "ARCHIVE_MATERIAL_NOT_FOUND" });
        const targetId = `meeting-${createHash("sha256")
            .update(`${request.teamId}\0${request.requestId}`)
            .digest("hex")
            .slice(0, 32)}`;
        expect(await meetingIds(targetRuntime)).not.toContain(targetId);
        expect(starts).toHaveLength(beforeStarts);
        await targetRuntime.dispose();
    });

    it("rejects an existing but unarchived source before target creation", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-continuation-unarchived-"));
        roots.push(root);
        const starts: string[] = [];
        const sourceRuntime = runtime(root, starts);
        const created = await sourceRuntime.createMeeting(
            baseInput,
            captain,
            new AbortController().signal
        );
        if (!created.ok) throw new Error("source create failed");
        const beforeMeetingIds = [created.result.meetingId];
        const beforeStarts = starts.length;
        const result = await sourceRuntime.createMeeting(
            continuationInput(created.result.meetingId, "unarchived"),
            captain,
            new AbortController().signal
        );

        expect(result).toMatchObject({ ok: false, code: "SOURCE_MEETING_NOT_ARCHIVED" });
        expect(await meetingIds(sourceRuntime)).toEqual(beforeMeetingIds);
        expect(starts).toHaveLength(beforeStarts);
        await sourceRuntime.dispose();
    });
});
