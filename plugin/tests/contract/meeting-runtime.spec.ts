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
                }),
                followup: async () => "followup-message" as never
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
            result: { meetingVersion: 1, status: "running" }
        });
        if (!created.ok) throw new Error("create failed");

        const status = await runtime.getStatus(
            { protocolVersion: 1, meetingId: created.result.meetingId },
            { ...captain, meetingId: created.result.meetingId }
        );
        expect(status).toMatchObject({
            ok: true,
            result: { status: "running", meetingVersion: 1 }
        });

        await expect(
            runtime.getStatus(
                { protocolVersion: 1, meetingId: created.result.meetingId },
                { ...captain, sessionId: "other-captain" }
            )
        ).resolves.toMatchObject({ ok: false, code: "UNAUTHORIZED_CALLER" });
    });

    it("rejects non-Captain creation and mismatched control callers before SQLite access", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-tools-auth-"));
        roots.push(root);
        let starts = 0;
        const runtime = createCreateStatusRuntime({
            dataRoot: root,
            provider: "spawn",
            continuable: {
                startContinuable: async (spec) => {
                    starts += 1;
                    return { childId: spec.childId!, messageId: "initial" as never };
                },
                followup: async () => "followup-message" as never
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            }
        });
        const participant = { sessionId: "participant-1", kind: "participant" as const };
        await expect(
            runtime.createMeeting(input, participant, new AbortController().signal)
        ).resolves.toMatchObject({
            ok: false,
            code: "UNAUTHORIZED_CALLER"
        });
        await expect(
            runtime.pause(
                {
                    protocolVersion: 1,
                    meetingId: "meeting-1",
                    expectedMeetingVersion: 0,
                    requestId: "pause-1",
                    reason: "stop"
                },
                { sessionId: "captain-1", kind: "captain", meetingId: "other-meeting" }
            )
        ).resolves.toMatchObject({ ok: false, code: "UNAUTHORIZED_CALLER" });
        expect(starts).toBe(0);
    });

    it("replays only the same create request for its original Captain", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-tools-idempotency-"));
        roots.push(root);
        let starts = 0;
        const runtime = createCreateStatusRuntime({
            dataRoot: root,
            provider: "spawn",
            continuable: {
                startContinuable: async (spec) => {
                    starts += 1;
                    return { childId: spec.childId!, messageId: "initial" as never };
                },
                followup: async () => "followup-message" as never
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            }
        });
        const captain = {
            sessionId: "captain-1",
            kind: "captain" as const,
            agent: { id: "captain-1" } as never
        };
        const first = await runtime.createMeeting(input, captain, new AbortController().signal);
        const replay = await runtime.createMeeting(input, captain, new AbortController().signal);
        expect(replay).toMatchObject({
            ok: true,
            result: { meetingId: first.ok ? first.result.meetingId : "" }
        });
        expect(starts).toBe(4);

        const conflict = await runtime.createMeeting(
            { ...input, topic: "Different" },
            captain,
            new AbortController().signal
        );
        expect(conflict).toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
    });
});
