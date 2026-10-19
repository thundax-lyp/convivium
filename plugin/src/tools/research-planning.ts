import { defineTool } from "@deepseek-ai/dsh-tools";
import type { JsonValue } from "@deepseek-ai/dsh-util-values";
import type { MeetingCommandToolDependencies } from "./register-tools.ts";

export const registerResearchPlanningTool = (
    dependencies: MeetingCommandToolDependencies
): (() => void) =>
    dependencies.registry.register(
        defineTool({
            name: "convivium_plan_research",
            description:
                "After explicitly loading research-planning, generate and independently validate research targets from the stored original question. No candidate or PASS fields are accepted. Does not open a round. Read the committed Meeting after success. Failed planning requires explicit user retry; never loop calls to bypass the revision budget.",
            parameters: {
                meetingId: { type: "string", required: true },
                expectedMeetingVersion: { type: "integer", required: true },
                requestId: { type: "string", required: true }
            },
            output: {
                schema: { type: "json" },
                render: (_args, value) => [{ type: "text" as const, text: JSON.stringify(value) }]
            },
            async execute(args, exec) {
                if (!exec.agent) {
                    return { kind: "rejected", error: { code: "UNAUTHORIZED" } };
                }
                const caller = await dependencies.callers.resolve(exec.agent, exec.signal);
                if (!caller || caller.role !== "manager" || caller.meetingId !== args.meetingId) {
                    return { kind: "rejected", error: { code: "UNAUTHORIZED" } };
                }
                const view = await dependencies.reader.read(
                    { protocolVersion: 1, meetingId: args.meetingId },
                    caller,
                    exec.signal
                );
                if (!view || view.version !== args.expectedMeetingVersion) {
                    return { kind: "rejected", error: { code: "VERSION_CONFLICT" } };
                }
                if (view.objective.researchPlanning?.status === "failed") {
                    return {
                        kind: "planning_failed",
                        reason: view.objective.researchPlanning.reason
                    };
                }
                if (view.objective.researchPlanning?.status === "accepted") {
                    return {
                        kind: "already_planned",
                        meetingId: view.meetingId,
                        version: view.version
                    };
                }
                if (
                    !view.objective.researchPlanning ||
                    view.lifecycle.status !== "running" ||
                    view.rounds.some((r) => r.status === "open") ||
                    !dependencies.researchPlanner
                ) {
                    return { kind: "rejected", error: { code: "PRECONDITION_FAILED" } };
                }
                const result = await dependencies.researchPlanner({
                    agent: exec.agent,
                    question: view.objective.statement,
                    signal: exec.signal
                });
                exec.signal.throwIfAborted();
                const agenda = view.agenda.find((a) => a.status === "active");
                if (!agenda) {
                    return { kind: "rejected", error: { code: "PRECONDITION_FAILED" } };
                }
                const committed = await dependencies.application.execute(
                    {
                        protocolVersion: 1,
                        meetingId: view.meetingId,
                        expectedMeetingVersion: view.version,
                        requestId: args.requestId,
                        action: {
                            kind: "submit_manager_plan",
                            agendaId: agenda.id,
                            planKind: "continue_agenda",
                            rationale:
                                result.status === "accepted"
                                    ? "research-planning：研究对象已通过确定性解析和独立审查。"
                                    : "research-planning：目标规划未通过，保留候选与原因，不开启研究轮次。"
                        }
                    },
                    { caller: caller.caller, researchPlanning: result },
                    exec.signal
                );
                return committed as unknown as JsonValue;
            }
        })
    );
