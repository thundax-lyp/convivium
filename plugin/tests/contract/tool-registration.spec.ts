import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ToolDefinition, ToolRunContext } from "@deepseek-ai/dsh-tools";
import { describe, expect, it } from "vitest";
import {
    registerCreateAndStatusTools,
    registerSubmitAndControlTools
} from "../../src/tools/index.js";

describe("meeting tool registration", () => {
    it("registers create and status with mandatory canonical outputs", () => {
        const definitions: ToolDefinition[] = [];
        registerCreateAndStatusTools({
            registry: { register: (definition) => (definitions.push(definition), () => undefined) },
            callers: { resolve: async () => ({ sessionId: "captain-session", kind: "captain" }) },
            runtime: {
                createMeeting: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                }),
                getStatus: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "MEETING_NOT_FOUND",
                    message: "not found",
                    retryable: false
                }),
                submitTurn: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                }),
                pause: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                }),
                resume: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                })
            }
        });
        registerSubmitAndControlTools({
            registry: { register: (definition) => (definitions.push(definition), () => undefined) },
            callers: { resolve: async () => ({ sessionId: "captain-session", kind: "captain" }) },
            runtime: {
                createMeeting: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                }),
                getStatus: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                }),
                submitTurn: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                }),
                pause: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                }),
                resume: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                })
            }
        });

        expect(definitions.map((definition) => definition.name)).toEqual([
            "convivium_create_meeting",
            "convivium_meeting_status",
            "convivium_submit_turn",
            "convivium_pause_meeting",
            "convivium_resume_meeting"
        ]);
        expect(definitions.every((definition) => definition.output !== undefined)).toBe(true);
    });

    it("binds status authorization to exec.agent and never caller-controlled input", async () => {
        const definitions: ToolDefinition[] = [];
        const agent = {} as Agent;
        let resolvedAgent: Agent | undefined;
        registerCreateAndStatusTools({
            registry: { register: (definition) => (definitions.push(definition), () => undefined) },
            callers: {
                resolve: async (candidate) => {
                    resolvedAgent = candidate;
                    return { sessionId: "captain-session", kind: "captain" };
                }
            },
            runtime: {
                createMeeting: async () => {
                    throw new Error("create must not run");
                },
                getStatus: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "MEETING_NOT_FOUND",
                    message: "not found",
                    retryable: false
                }),
                submitTurn: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                }),
                pause: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                }),
                resume: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                })
            }
        });

        const status = definitions.find(
            (definition) => definition.name === "convivium_meeting_status"
        );
        expect(status).toBeDefined();
        const outcome = await status?.execute(
            { input: { protocolVersion: 1, meetingId: "meeting-1", caller: "forged" } },
            { agent, signal: new AbortController().signal } as ToolRunContext
        );

        expect(resolvedAgent).toBe(agent);
        expect(outcome).toMatchObject({ ok: false, code: "MEETING_NOT_FOUND" });
    });

    it("rejects calls without an Agent before invoking the runtime", async () => {
        const definitions: ToolDefinition[] = [];
        let runtimeCalls = 0;
        registerCreateAndStatusTools({
            registry: { register: (definition) => (definitions.push(definition), () => undefined) },
            callers: { resolve: async () => ({ sessionId: "captain-session", kind: "captain" }) },
            runtime: {
                createMeeting: async () => {
                    runtimeCalls += 1;
                    throw new Error("must not run");
                },
                getStatus: async () => {
                    runtimeCalls += 1;
                    throw new Error("must not run");
                },
                submitTurn: async () => {
                    runtimeCalls += 1;
                    throw new Error("must not run");
                },
                pause: async () => {
                    runtimeCalls += 1;
                    throw new Error("must not run");
                },
                resume: async () => {
                    runtimeCalls += 1;
                    throw new Error("must not run");
                }
            }
        });

        const status = definitions.find(
            (definition) => definition.name === "convivium_meeting_status"
        );
        const outcome = await status?.execute(
            { input: { protocolVersion: 1, meetingId: "meeting-1" } },
            { signal: new AbortController().signal } as ToolRunContext
        );

        expect(outcome).toMatchObject({ ok: false, code: "UNAUTHORIZED_CALLER" });
        expect(runtimeCalls).toBe(0);
    });
});
