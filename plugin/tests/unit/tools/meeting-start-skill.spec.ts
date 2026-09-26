import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ToolDefinition, ToolRunContext } from "@deepseek-ai/dsh-tools";
import { describe, expect, it, vi } from "vitest";
import {
    MeetingStartGate,
    createMeetingStartCommand,
    registerMeetingStartTool
} from "@/tools/meeting-start-skill.js";

const directMessage = (id: string, text: string) => ({
    id,
    role: "user" as const,
    source: { kind: "user" as const },
    content: [{ type: "text" as const, text }]
});

describe("chat Meeting start", () => {
    it("fills the initial Meeting contract from a direct objective", () => {
        const command = createMeetingStartCommand("调查TypeSafe JEV的最新进展", "skill:input-1");
        expect(command).toMatchObject({
            meetingId: "new",
            expectedMeetingVersion: 0,
            requestId: "skill:input-1",
            action: {
                kind: "create_meeting",
                objective: { statement: "调查TypeSafe JEV的最新进展", acceptableRiskLevel: "low" },
                managerIdentityKey: "meeting_manager",
                evidenceReviewerIdentityKey: "verification_reviewer",
                initialActiveAgendaId: "initial"
            }
        });
        if (command.action.kind !== "create_meeting") throw new Error("not a create command");
        expect(command.action.identities).toHaveLength(7);
        expect(command.action.identities.every((identity) => identity.required)).toBe(true);
        expect(command.action.initialAgenda).toHaveLength(1);
        expect(command.action.objective.requiredOutputs).toHaveLength(1);
        expect(command.action.objective.acceptanceCriteria).toHaveLength(1);
    });

    it("grants one create only for a direct slash Skill message", () => {
        const gate = new MeetingStartGate();
        gate.observe("session-1", 3, [
            directMessage("input-1", "/convivium 调查TypeSafe JEV的最新进展")
        ]);
        expect(gate.take("session-1")).toEqual({
            turn: 3,
            goal: "调查TypeSafe JEV的最新进展",
            requestId: "skill:input-1"
        });
        expect(gate.take("session-1")).toBeUndefined();
    });

    it("rejects ordinary, model-sourced and stale-turn messages", () => {
        const gate = new MeetingStartGate();
        gate.observe("session-1", 3, [directMessage("input-1", "调查TypeSafe JEV的最新进展")]);
        expect(gate.take("session-1")).toBeUndefined();
        gate.observe("session-1", 3, [
            {
                ...directMessage("input-2", "/convivium 调查TypeSafe JEV的最新进展"),
                source: { kind: "plugin" as const, plugin: "other" }
            }
        ]);
        expect(gate.take("session-1")).toBeUndefined();
        gate.observe("session-1", 4, [
            directMessage("input-3", "/convivium 调查TypeSafe JEV的最新进展")
        ]);
        gate.clear("session-1", 4);
        expect(gate.take("session-1")).toBeUndefined();
    });

    it("does not create an empty-goal Meeting", () => {
        const gate = new MeetingStartGate();
        gate.observe("session-1", 3, [directMessage("input-1", "/convivium")]);
        expect(gate.take("session-1")).toBeUndefined();
    });

    it("submits one authorized create and denies unbound tool calls", async () => {
        const gate = new MeetingStartGate();
        let definition: ToolDefinition | undefined;
        const create = vi.fn(async () => ({ kind: "accepted" as const, meetingId: "meeting-1" }));
        registerMeetingStartTool({
            registry: {
                register: (tool) => {
                    definition = tool;
                    return () => undefined;
                }
            },
            gate,
            create,
            isMeetingAgent: vi.fn(async () => false)
        });
        const exec = {
            agent: { id: "session-1" } as Agent,
            signal: new AbortController().signal
        } as ToolRunContext;
        expect(await definition!.execute({}, exec)).toMatchObject({ kind: "rejected" });
        expect(create).not.toHaveBeenCalled();

        gate.observe("session-1", 4, [
            directMessage("input-1", "/convivium 调查TypeSafe JEV的最新进展")
        ]);
        expect(await definition!.execute({}, exec)).toMatchObject({
            kind: "accepted",
            meetingId: "meeting-1"
        });
        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({ requestId: "skill:input-1" }),
            exec.signal
        );
        expect(await definition!.execute({}, exec)).toMatchObject({ kind: "rejected" });
        expect(create).toHaveBeenCalledTimes(1);
    });

    it("refuses a Meeting-owned Agent even if its inbox contains a slash token", async () => {
        const gate = new MeetingStartGate();
        gate.observe("session-1", 4, [
            directMessage("input-1", "/convivium 调查TypeSafe JEV的最新进展")
        ]);
        let definition: ToolDefinition | undefined;
        const create = vi.fn();
        registerMeetingStartTool({
            registry: {
                register: (tool) => {
                    definition = tool;
                    return () => undefined;
                }
            },
            gate,
            create,
            isMeetingAgent: vi.fn(async () => true)
        });
        expect(
            await definition!.execute({}, {
                agent: { id: "session-1" } as Agent,
                signal: new AbortController().signal
            } as ToolRunContext)
        ).toMatchObject({ kind: "rejected", error: { code: "UNAUTHORIZED" } });
        expect(create).not.toHaveBeenCalled();
    });
});
