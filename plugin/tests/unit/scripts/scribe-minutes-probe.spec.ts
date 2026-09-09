import { describe, expect, it, vi } from "vitest";
import { runScribeMinutesScenario } from "../../../scripts/smoke-profile/probe/scenarios/scribe-minutes.js";
import { validateScenarioResult } from "../../../scripts/smoke-profile/result.mjs";
import { createProbeSupport } from "../../../scripts/smoke-profile/probe/support.js";
import { TurnSubmissionSchema } from "@/protocol/commands.js";
import { MeetingStatusResultSchema } from "@/protocol/status.js";
import { projectMeetingStatus } from "@/projection/status.js";
import { materializeArchivePackage } from "@/runtime/services/meeting-archive-service.js";
import { meeting } from "../domain/transitions/fixtures.js";

function fixture() {
    const state = meeting("running");
    state.version = 12;
    state.meetingTasks = [];
    state.transcript = ["a", "b"].map((key, i) => ({
        id: "message-" + key,
        seq: i + 1,
        turnId: "turn-1",
        turnSeq: 1,
        stepId: "step-" + key,
        attemptId: "attempt-" + key,
        speaker: "participant-" + key,
        agendaItemId: "agenda-1",
        kind: i ? ("summary" as const) : ("statement" as const),
        content: i ? "Minutes draft based on source-a" : "source-a",
        mentions: [],
        taskIds: [],
        agendaRelation: "on_topic" as const,
        createdAt: 100 + i,
        ...(i
            ? {
                  minutesDraft: {
                      status: "draft" as const,
                      coverage: { fromSeq: 1, throughSeq: 1 },
                      referencedMessageIds: ["message-a"]
                  }
              }
            : {})
    }));
    const envelope = (result: unknown, version: number) => ({
        protocolVersion: 1,
        ok: true,
        meetingId: state.id,
        meetingVersion: version,
        result
    });
    const status = projectMeetingStatus(state, { kind: "local_host", sessionId: "captain" });
    if (!("messages" in status)) throw new Error("active fixture missing");
    const terminal = {
        ...state,
        status: "partial" as const,
        version: 15,
        termination: meeting("partial").termination!
    };
    const archived = projectMeetingStatus(
        {
            ...terminal,
            status: "archived",
            archive: { package: materializeArchivePackage(terminal, 105), archivedAt: 106 }
        },
        { kind: "local_host", sessionId: "captain" }
    );
    const receipt = envelope(
        {
            messageId: "message-b",
            messageSeq: 2,
            turnStatus: "completed",
            meetingStatus: "running"
        },
        11
    );
    return {
        ok: true,
        scenario: "scribe-minutes",
        browserReady: false,
        meetingId: state.id,
        assertions: [
            "minutes-context-visible",
            "minutes-invalid-atomic",
            "minutes-replay-stable",
            "minutes-remote-equal",
            "minutes-archive-equal",
            "minutes-sessions-drained"
        ],
        observed: {
            source: status.messages[0]!,
            draft: status.messages[1]!,
            afterSubmit: receipt,
            afterReplay: structuredClone(receipt),
            status: envelope(status, 12),
            archived: envelope(archived, 15),
            drainedSessionIds: [
                state.id + "-manager-manager",
                ...["a", "b"].map((key) => state.id + "-participant-participant-" + key)
            ]
        }
    };
}

function harness(browserMode = false, fault = "") {
    const f = fixture(),
        o = f.observed,
        log: string[] = [];
    let submissions = 0,
        ended = false,
        invalid = false,
        callId = 0;
    const captain = { agent: { session: { id: "convivium-smoke-captain", append: vi.fn() } } };
    const agents = o.drainedSessionIds.map((id) => ({ id }));
    const runtime = {
        scenario: f.scenario,
        browserMode,
        captain,
        createInput: createProbeSupport("unused").createInput,
        assert: createProbeSupport("unused").assert,
        nextCall: () => ++callId,
        setMeetingId: vi.fn(),
        workspace: { attachSession: vi.fn() },
        writeResult: vi.fn(async (value) => {
            validateScenarioResult(value, f.scenario, MeetingStatusResultSchema);
        }),
        waitForAgent: vi.fn(async () => agents[0]),
        resumeParticipantForProbe: vi.fn(async (_ctx, parent, id, marker) => {
            expect(parent).toBe(captain.agent);
            expect(id).toBe(agents[2]!.id);
            expect(marker).toBe("scribe-minutes-replay");
            log.push("resume");
            return agents[2];
        }),
        waitForSpeakerContext: vi.fn(async (_ctx, id, attempt) => {
            const key = submissions ? "b" : "a";
            expect(id).toBe(f.meetingId + "-participant-participant-" + key);
            expect(attempt).toBe("attempt-" + key);
            log.push("context-" + key);
            return {
                agent: agents[submissions ? 2 : 1],
                value: {
                    turn: { id: "turn-1" },
                    step: { id: "step-" + key },
                    attempt: { attemptId: "attempt-" + key, deliveryId: "delivery-" + key },
                    activeAgendaItem: { id: "agenda-1" },
                    recentMessages: submissions && fault !== "context" ? [o.source] : []
                }
            };
        }),
        callTool: vi.fn(async (_ctx, agent, name, input) => {
            if (name === "convivium_create_meeting") {
                expect(input.participants).toEqual([
                    { participantKey: "a", displayName: "A" },
                    { participantKey: "b", displayName: "B", role: "meeting_scribe" }
                ]);
                expect(input.agenda[0].requiredParticipantKeys).toEqual(["a"]);
                expect(input.objectiveContract).toEqual(
                    createProbeSupport("unused").createInput().objectiveContract
                );
                log.push("create");
                return { result: { meetingId: f.meetingId } };
            }
            if (name === "convivium_meeting_status") {
                expect(agent).toBe(captain.agent);
                log.push("status");
                if (ended) {
                    const value = structuredClone(o.archived);
                    if (fault === "archive") Reflect.set(value.result as object, "archive", {});
                    return value;
                }
                if (submissions >= 2) return structuredClone(o.status);
                return {
                    meetingVersion: fault === "atomic" && invalid ? 8 : 5,
                    result: {
                        activeAgendaItem: { id: "agenda-1" },
                        currentAttemptId: "attempt-b",
                        messages: submissions ? [o.source] : []
                    }
                };
            }
            if (name === "convivium_submit_manager_plan") {
                log.push("plan");
                expect(input.steps.map((s: { participantId: string }) => s.participantId)).toEqual([
                    "participant-a",
                    "participant-b"
                ]);
                return { result: { firstAttemptId: "attempt-a" } };
            }
            if (name === "convivium_submit_turn") {
                TurnSubmissionSchema(input);
                log.push("submit");
                submissions++;
                expect(input).toMatchObject({
                    stepId: submissions === 1 ? "step-a" : "step-b",
                    changes: {},
                    taskIds: [],
                    mentions: []
                });
                if (submissions === 1) {
                    expect(input).not.toHaveProperty("minutesDraft");
                    return { result: { messageId: o.source.id } };
                }
                expect(agent).toBe(agents[2]);
                expect(input.minutesDraft).toEqual({
                    coverage: { fromSeq: 1, throughSeq: 1 },
                    referencedMessageIds: [o.source.id]
                });
                const receipt = structuredClone(o.afterSubmit);
                if (fault === "replay" && submissions === 3) receipt.meetingVersion++;
                return receipt;
            }
            if (name === "convivium_end_meeting") {
                log.push("end");
                ended = true;
                expect(input).toMatchObject({
                    outcome: "partial",
                    reason: "scribe minutes smoke",
                    requestId: "scribe-minutes-end",
                    expectedMeetingVersion: 12,
                    acceptedDecisionIds: [],
                    deferredAgendaItemIds: [],
                    waivers: []
                });
                return { result: { status: "partial" } };
            }
            throw new Error("Unexpected tool " + name);
        }),
        createRemoteProbe: vi.fn(async () => ({
            callRemote: vi.fn(async (method, input) => {
                log.push("http");
                expect(method).toBe("getStatus");
                expect(input).toEqual({ protocolVersion: 1, meetingId: "meeting-1" });
                const value = structuredClone(o.status);
                if (fault === "http") Reflect.set(value.result as object, "messages", []);
                return value;
            })
        })),
        ctx: {
            webServer: { port: 1234 },
            sessions: { flush: vi.fn() },
            tools: {
                execute: vi.fn(async (request) => {
                    TurnSubmissionSchema(request.arguments.input);
                    log.push("invalid");
                    invalid = true;
                    expect(request.arguments.input.minutesDraft.referencedMessageIds).toEqual([
                        "missing-source"
                    ]);
                    expect(request.agent).toBe(agents[2]);
                    expect(request.callId).toMatch(/^convivium-smoke-\d+$/);
                    expect(request.signal).toBeInstanceOf(AbortSignal);
                    if (fault === "throw") throw new Error("transport failed");
                    return {
                        isError: fault === "tool-error",
                        value:
                            fault === "nested"
                                ? { ok: false, error: { code: "INVALID_ARGUMENT" } }
                                : {
                                      ok: false,
                                      code: fault === "code" ? "OTHER" : "INVALID_ARGUMENT"
                                  }
                    };
                })
            },
            agents: { get: () => (fault === "resident" ? agents[0] : undefined) },
            subagents: {
                listChildren: vi.fn(async () => {
                    log.push("drain");
                    return fault === "children"
                        ? []
                        : agents.map((agent) => ({ ...agent, activity: "inactive" }));
                })
            }
        }
    };
    return { runtime, log };
}

describe("scribe minutes scenario", () => {
    it.each([false, true])("drives the ordered scenario with Browser=%s", async (browser) => {
        const { runtime, log } = harness(browser);
        await runScribeMinutesScenario(runtime);
        expect(log).toEqual([
            "create",
            "status",
            "plan",
            "context-a",
            "submit",
            "status",
            "context-b",
            "invalid",
            "status",
            "submit",
            "resume",
            "submit",
            "status",
            "http",
            ...(browser ? [] : ["end", "status", "drain"])
        ]);
        expect(runtime.writeResult).toHaveBeenCalledOnce();
        expect(runtime.workspace.attachSession).toHaveBeenCalledTimes(browser ? 1 : 0);
        expect(runtime.ctx.sessions.flush).toHaveBeenCalledTimes(browser ? 1 : 0);
    });
    it.each([
        "context",
        "atomic",
        "replay",
        "http",
        "archive",
        "resident",
        "children",
        "throw",
        "tool-error",
        "nested",
        "code"
    ])("rejects %s before publishing success", async (fault) => {
        const { runtime } = harness(false, fault);
        await expect(runScribeMinutesScenario(runtime)).rejects.toThrow();
        expect(runtime.writeResult).not.toHaveBeenCalled();
    });
});

describe("scribe minutes result contract", () => {
    const validate = (value: unknown) =>
        validateScenarioResult(value, "scribe-minutes", MeetingStatusResultSchema);
    it("accepts actual archive internal fields without mutating observations", () => {
        const value = fixture(),
            before = structuredClone(value);
        expect(validate(value)).toEqual(before);
        expect(value).toEqual(before);
    });
    it.each([0, 1, 2, 3, 4, 5])("rejects missing assertion %s", (i) => {
        const value = fixture();
        value.assertions.splice(i, 1);
        expect(() => validate(value)).toThrow();
    });
    it.each([
        "source",
        "draft",
        "afterSubmit",
        "afterReplay",
        "status",
        "archived",
        "drainedSessionIds"
    ])("rejects missing observed field %s", (key) => {
        const value = fixture();
        Reflect.deleteProperty(value.observed, key);
        expect(() => validate(value)).toThrow();
    });
    it.each([
        "metadata",
        "version",
        "status-version",
        "missing-source",
        "drain",
        "status",
        "archive-content",
        "archive-metadata",
        "optional-presence",
        "schema-validator"
    ])("rejects %s", (fault) => {
        const value = fixture(),
            o = value.observed;
        if (fault === "metadata") o.draft.minutesDraft!.coverage.fromSeq = 2;
        if (fault === "version") o.afterReplay.meetingVersion++;
        if (fault === "status-version") o.status.meetingVersion = 1;
        if (fault === "missing-source")
            Reflect.set(o.status.result as object, "messages", [o.draft]);
        if (fault === "drain") o.drainedSessionIds.pop();
        if (fault === "status") Reflect.deleteProperty(o.status.result as object, "limits");
        const archived = o.archived.result as {
            archive: { package: { formalTranscript: Record<string, unknown>[] } };
        };
        if (fault === "archive-content")
            archived.archive.package.formalTranscript[1]!.content = "tampered";
        if (fault === "archive-metadata")
            Reflect.deleteProperty(archived.archive.package.formalTranscript[1]!, "minutesDraft");
        if (fault === "optional-presence")
            archived.archive.package.formalTranscript[0]!.replyTo = undefined;
        expect(() =>
            fault === "schema-validator"
                ? validateScenarioResult(value, "scribe-minutes")
                : validate(value)
        ).toThrow();
    });
});
