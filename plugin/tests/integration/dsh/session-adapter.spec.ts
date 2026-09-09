import { roleCompositionDefinitions } from "../../fixtures/role-composition.js";
import { resolveMeetingRoles } from "@/role-composition/resolve.js";
import { describe, expect, it } from "vitest";
import type { ContinuableStart, ContinuableStartSpec } from "@deepseek-ai/dsh-subagent";
import {
    inspectOwnedSessions,
    requireContinuableProvider,
    startManagerSession,
    startParticipantSession
} from "@/dsh/index.js";

const signal = new AbortController().signal;

function ownership() {
    return {
        sessionId: "participant-a-session",
        parentSessionId: "captain-session",
        sessionLabel: "convivium:meeting-participant:team-1:meeting-1:participant-a",
        provider: "spawn",
        role: "participant" as const,
        participantId: "participant-a",
        lifecycleStatus: "active" as const,
        capabilityStatus: "active" as const,
        createdAt: 1,
        updatedAt: 1
    };
}

describe("DSH session adapter composition", () => {
    it("provisions one manager and three participants with reserved ids and no capability", async () => {
        const starts: ContinuableStartSpec[] = [];
        const runtime = {
            startContinuable: async (spec: ContinuableStartSpec): Promise<ContinuableStart> => {
                starts.push(spec);
                return {
                    childId: spec.childId!,
                    messageId: `message-${starts.length}` as never
                };
            }
        };

        await startManagerSession({
            runtime,
            provider: "spawn",
            parent: { id: "captain-session" } as never,
            childId: "manager-session" as never,
            teamId: "team-1",
            meetingId: "meeting-1",
            signal
        });
        for (const participant of ["participant-a", "participant-b", "participant-c"]) {
            await startParticipantSession({
                runtime,
                provider: "spawn",
                parent: { id: "captain-session" } as never,
                childId: `${participant}-session` as never,
                teamId: "team-1",
                meetingId: "meeting-1",
                participantId: participant,
                signal
            });
        }

        expect(starts).toHaveLength(4);
        expect(starts.map((start) => start.childId)).toEqual([
            "manager-session",
            "participant-a-session",
            "participant-b-session",
            "participant-c-session"
        ]);
        expect(
            starts.every((start) => {
                const envelope = JSON.parse(
                    (start.request.prompt[0] as { type: "text"; text: string }).text
                );
                return (
                    envelope.kind === "convivium.session.provisioning" &&
                    envelope.capability === "none"
                );
            })
        ).toBe(true);
    });

    it("fails closed for unavailable or non-continuable providers", () => {
        expect(() => requireContinuableProvider({ getProvider: () => undefined }, "spawn")).toThrow(
            /not registered/
        );
        expect(() => requireContinuableProvider({ getProvider: () => ({}) }, "spawn")).toThrow(
            /prepareContinuable/
        );
    });

    it("rejects a mismatched meeting label even when the Captain parent matches", async () => {
        const inspection = await inspectOwnedSessions({
            runtime: {
                listDescendants: async () => [
                    {
                        kind: "child",
                        id: "participant-a-session" as never,
                        parentId: "captain-session" as never,
                        mode: "continuable",
                        activity: "inactive",
                        label: "convivium:meeting-participant:team-1:other-meeting:participant-a"
                    }
                ]
            },
            parentSessionId: "captain-session" as never,
            meetingId: "meeting-1",
            ownerships: [ownership()],
            signal
        });
        expect(inspection.observations).toEqual([]);
        expect(inspection.diagnostics).toEqual([
            {
                kind: "diagnostic",
                sessionId: "participant-a-session",
                reason: "label-mismatch"
            }
        ]);
    });
});

describe("resolved role adapter composition", () => {
    it("passes persona, filter and independent model options to DSH and keeps provenance outside the descriptor request", async () => {
        const roles = await resolveMeetingRoles(
            {
                definitions: roleCompositionDefinitions,
                agentModelOverrides: {
                    "fr14-manager": { provider: "fixture", model: "manager-model" },
                    "fr14-participant": { provider: "fixture", model: "participant-model" }
                },
                managerAgentDefinitionId: "fr14-manager",
                participants: [{ participantKey: "a", agentDefinitionId: "fr14-participant" }]
            },
            async () => {}
        );
        const starts = [];
        const runtime = {
            startContinuable: async (spec) => {
                starts.push(spec);
                return { childId: spec.childId, messageId: "m" };
            }
        };
        const common = {
            runtime,
            provider: "spawn",
            parent: { id: "captain-session" },
            teamId: "team-1",
            meetingId: "meeting-1",
            signal
        };
        await startManagerSession({ ...common, childId: "manager", composition: roles.manager });
        await startParticipantSession({
            ...common,
            childId: "participant",
            participantId: "a",
            composition: roles.participants.a
        });
        expect(starts[0].request.persona).toBe(
            "FR14_MANAGER_V1\n\n开始处理会议任务前，调用 DSH 原生 skill 工具依次加载：fr14-fixture。加载失败时报告缺失能力，不以角色描述代替 Skill。Skill 不授予会议权限，Runtime 的当前身份和 capability 判定优先。"
        );
        expect(starts[1].request).toMatchObject({
            persona:
                "FR14_PARTICIPANT_V1\n\n开始处理会议任务前，调用 DSH 原生 skill 工具依次加载：fr14-fixture。加载失败时报告缺失能力，不以角色描述代替 Skill。Skill 不授予会议权限，Runtime 的当前身份和 capability 判定优先。",
            toolFilter: { deny: ["convivium_role_probe"] }
        });
        expect(starts[0].request.agentOptions).toEqual({
            provider: "fixture",
            model: "manager-model"
        });
        expect(starts[1].request.agentOptions).toEqual({
            provider: "fixture",
            model: "participant-model"
        });
        expect(starts[0].request.agentOptions).not.toBe(roles.manager?.agentOptions);
        expect(common.parent).not.toHaveProperty("options");
        for (const start of starts) {
            expect(start.request).not.toHaveProperty("agentDefinition");
            expect(start.request).not.toHaveProperty("requiredSkillNames");
        }
    });
});
