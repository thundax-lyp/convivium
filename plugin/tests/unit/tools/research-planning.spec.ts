import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ToolDefinition, ToolRunContext } from "@deepseek-ai/dsh-tools";
import { expect, it, vi } from "vitest";
import { registerResearchPlanningTool } from "@/tools/research-planning.ts";
import { projectMeetingView } from "@/projection/index.ts";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.ts";
import { peerBindings } from "../../fixtures/peer-ownership.ts";
import { acceptedResearchPlanning } from "../../fixtures/research-planning.ts";

it("binds planning to the stored question and refuses cross-meeting or stale calls before generation", async () => {
    const state = makeRunningMeetingStateV1();
    state.objective.researchPlanning = { status: "pending" };
    const manager = state.identities.find((i) => i.roles.includes("manager"))!;
    const owner = {
        ...peerBindings(state.id, state.identities).initialOwnership.find(
            (o) => o.identityId === manager.id
        )!,
        lifecycleStatus: "active" as const
    };
    let view = projectMeetingView(
        { state, meetingId: state.id, version: state.version, createdAt: 0, updatedAt: 0 },
        { kind: "captain" }
    );
    let tool!: ToolDefinition;
    const planning = acceptedResearchPlanning(state.objective.statement);
    const researchPlanner = vi.fn(async () => planning);
    const execute = vi.fn(async () => ({
        kind: "rejected" as const,
        error: { code: "VERSION_CONFLICT" as const, message: "changed during planning" }
    }));
    registerResearchPlanningTool({
        registry: {
            register: (definition) => {
                tool = definition;
                return () => {};
            }
        },
        application: { execute },
        researchPlanner,
        reader: { read: async () => view },
        reviewWorkers: { start: vi.fn() },
        reviewPrompts: { resolve: vi.fn() },
        callers: {
            resolve: async () => ({
                caller: {
                    channel: "dsh_tool",
                    principalId: manager.id,
                    sessionBindingId: owner.id
                },
                meetingId: state.id,
                identityId: manager.id,
                role: "manager",
                ownership: owner
            })
        }
    });
    const exec = {
        agent: { id: owner.sessionId } as Agent,
        signal: new AbortController().signal
    } as ToolRunContext;
    const args = { meetingId: state.id, expectedMeetingVersion: state.version, requestId: "plan" };
    await tool.execute({ ...args, meetingId: "other" }, exec);
    await tool.execute({ ...args, expectedMeetingVersion: 999 }, exec);
    expect(researchPlanner).not.toHaveBeenCalled();
    await tool.execute({ ...args, question: "伪造问题", status: "PASS" }, exec);
    expect(researchPlanner).toHaveBeenCalledWith({
        agent: exec.agent,
        question: state.objective.statement,
        signal: exec.signal
    });
    expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({ expectedMeetingVersion: state.version }),
        expect.objectContaining({ researchPlanning: planning }),
        exec.signal
    );
    view = { ...view, objective: { ...view.objective, researchPlanning: planning } };
    expect(await tool.execute(args, exec)).toMatchObject({ kind: "already_planned" });
    expect(researchPlanner).toHaveBeenCalledTimes(1);
    view = { ...view, objective: { ...view.objective, researchPlanning: { status: "pending" } } };
    execute.mockClear();
    const failure = new Error("RESEARCH_PLANNING_PERSISTENCE_FAILED");
    researchPlanner.mockRejectedValueOnce(failure);
    await expect(tool.execute(args, exec)).rejects.toBe(failure);
    expect(execute).not.toHaveBeenCalled();
});
