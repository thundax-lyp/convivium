import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCreateStatusRuntime } from "../../src/tools/meeting-runtime.js";

const roots: string[] = [];
const input = {
    protocolVersion: 1 as const,
    requestId: "create-1",
    teamId: "team-1",
    topic: "Release",
    objective: "Decide scope",
    objectiveContract: {
        requiredOutputs: [],
        acceptanceCriteria: [],
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
            requiredParticipantKeys: ["one", "two", "three"]
        }
    ],
    participants: [
        { participantKey: "one", displayName: "One" },
        { participantKey: "two", displayName: "Two" },
        { participantKey: "three", displayName: "Three" }
    ]
};

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("create/status meeting runtime", () => {
    it("creates through SQLite and projects status only for the bound meeting", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-tools-"));
        roots.push(root);
        const runtime = createCreateStatusRuntime({
            dataRoot: root,
            provider: "spawn",
            continuable: {
                startContinuable: async (spec) => ({
                    childId: spec.childId!,
                    messageId: `initial-${String(spec.childId)}` as never
                })
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            },
            now: () => 100
        });
        const captain = {
            sessionId: "captain-1",
            kind: "captain" as const,
            agent: { id: "captain-1" } as never
        };
        const created = await runtime.createMeeting(input, captain, new AbortController().signal);
        expect(created).toMatchObject({
            ok: true,
            result: { meetingVersion: 0, status: "created" }
        });
        if (!created.ok) throw new Error("create failed");

        const status = await runtime.getStatus(
            { protocolVersion: 1, meetingId: created.result.meetingId },
            { ...captain, meetingId: created.result.meetingId }
        );
        expect(status).toMatchObject({
            ok: true,
            result: { status: "created", meetingVersion: 0 }
        });

        await expect(
            runtime.getStatus(
                { protocolVersion: 1, meetingId: created.result.meetingId },
                { ...captain, meetingId: "other-meeting" }
            )
        ).resolves.toMatchObject({ ok: false, code: "UNAUTHORIZED_CALLER" });
    });
});
