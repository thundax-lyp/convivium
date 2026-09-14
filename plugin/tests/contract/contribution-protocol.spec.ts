import { describe, expect, it } from "vitest";
import {
    ContributionCommandSchema,
    ContributionResultSchema,
    ReadContributionInputSchema
} from "@/protocol/index.js";

const base = {
    protocolVersion: 1,
    meetingId: "meeting-1",
    requestId: "request-1",
    expectedMeetingVersion: 3
} as const;

const material = {
    title: "Repository snapshot",
    kind: "code",
    source: "https://example.test/repository",
    sourceDate: "2026-09-14",
    collectedAt: "2026-09-14T00:00:00Z",
    locator: "src/index.ts#main",
    observation: "The tested branch has the required guard.",
    methodAndConditions: "Reviewed commit abc123 on macOS.",
    limitations: "No production traffic was inspected.",
    dependencies: "Repository checkout at abc123.",
    material: { kind: "text", text: "diff --git a/src/index.ts b/src/index.ts" },
    code: {
        repository: "https://example.test/repository",
        revision: "abc123",
        pathsAndSymbols: "src/index.ts#main",
        patchEvidenceKeys: [],
        validation: "static_only",
        reproduction: "git show abc123 -- src/index.ts",
        expected: "The guard is present.",
        observed: "The guard is present.",
        notCovered: "Runtime execution."
    }
} as const;

describe("contribution protocol", () => {
    it("normalizes valid contribution commands independent of input property order", () => {
        const command = {
            ...base,
            action: "save_evidence" as const,
            contributionId: "contribution-1",
            generation: 1,
            expectedEvidenceRevision: 0,
            material
        };
        const reordered = {
            material,
            expectedEvidenceRevision: 0,
            generation: 1,
            contributionId: "contribution-1",
            action: "save_evidence" as const,
            expectedMeetingVersion: 3,
            requestId: "request-1",
            meetingId: "meeting-1",
            protocolVersion: 1
        };

        expect(ContributionCommandSchema(command)).toEqual(ContributionCommandSchema(reordered));
    });

    it("rejects exact-key violations and invalid action combinations", () => {
        const assign = {
            ...base,
            action: "assign" as const,
            participantId: "participant-1",
            agendaItemId: "agenda-1",
            instruction: "Review the implementation.",
            targetIds: ["output-1"],
            requiredForCompletion: true,
            requiresEvidenceReview: false
        };
        expect(ContributionCommandSchema(assign)).toEqual(assign);
        expect(() => ContributionCommandSchema({ ...assign, extra: true })).toThrow();
        expect(() => ContributionCommandSchema({ ...assign, generation: 1 })).toThrow();
        expect(() =>
            ContributionCommandSchema({ ...assign, targetIds: ["output-1", "output-1"] })
        ).toThrow();
        expect(() =>
            ContributionCommandSchema({ ...assign, expectedMeetingVersion: -1 })
        ).toThrow();
    });

    it("enforces material and complete-input UTF-8 byte limits", () => {
        const emptyTextMaterial = {
            ...material,
            material: { kind: "text" as const, text: "" }
        };
        const fillLength = 8192 - Buffer.byteLength(JSON.stringify(emptyTextMaterial), "utf8");
        const within = {
            ...emptyTextMaterial,
            material: { kind: "text" as const, text: "a".repeat(fillLength) }
        };
        expect(
            ContributionCommandSchema({
                ...base,
                action: "save_evidence",
                contributionId: "contribution-1",
                generation: 1,
                expectedEvidenceRevision: 0,
                material: within
            })
        ).toMatchObject({ action: "save_evidence" });
        expect(() =>
            ContributionCommandSchema({
                ...base,
                action: "save_evidence",
                contributionId: "contribution-1",
                generation: 1,
                expectedEvidenceRevision: 0,
                material: {
                    ...within,
                    material: { kind: "text", text: "a".repeat(fillLength + 1) }
                }
            })
        ).toThrow();
    });

    it.each([
        { contributionId: "contribution-1", generation: 1, phase: "preparing" },
        {
            contributionId: "contribution-1",
            generation: 1,
            phase: "preparing",
            evidenceKey: "evidence-1"
        },
        {
            contributionId: "contribution-1",
            generation: 1,
            phase: "boundary_review",
            draftRevision: 1
        },
        {
            contributionId: "contribution-1",
            generation: 1,
            phase: "published",
            draftRevision: 1,
            messageId: "message-contribution-1-1"
        },
        { managerNoticeSeq: 2 }
    ])("accepts only defined contribution result combinations", (result) => {
        expect(ContributionResultSchema(result)).toEqual(result);
    });

    it("rejects invalid result combinations and invalid read selectors", () => {
        expect(() => ContributionResultSchema({ contributionId: "contribution-1" })).toThrow();
        expect(() =>
            ContributionResultSchema({ managerNoticeSeq: 2, phase: "preparing" })
        ).toThrow();
        expect(() =>
            ReadContributionInputSchema({
                protocolVersion: 1,
                meetingId: "meeting-1",
                contributionId: "contribution-1",
                draftRevision: 0
            })
        ).toThrow();
        expect(() =>
            ReadContributionInputSchema({
                protocolVersion: 1,
                meetingId: "meeting-1",
                contributionId: "contribution-1",
                extra: true
            })
        ).toThrow();
    });
});
