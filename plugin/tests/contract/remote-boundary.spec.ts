import { describe, expect, it, vi } from "vitest";
import type { MeetingCommand } from "@/protocol/index.js";
import type { LocalMeetingWebRuntime } from "@/runtime/index.js";
import { createRemoteGateway } from "../fixtures/remote-gateway.js";

function runtimeFixture() {
    const calls = {
        list: 0,
        read: 0,
        control: 0
    };
    const runtime = {
        async list() {
            calls.list += 1;
            return { meetings: [] };
        },
        async read() {
            calls.read += 1;
            throw new Error("read should not run for invalid input");
        },
        async control() {
            calls.control += 1;
            return {
                kind: "rejected" as const,
                error: { code: "UNAUTHORIZED" as const, message: "not allowed" }
            };
        },
        async *subscribeRefresh(signal: AbortSignal) {
            yield { kind: "refresh" as const, meetingId: "meeting-1", committedVersion: 3 };
            await new Promise<void>((resolve) =>
                signal.addEventListener("abort", () => resolve(), { once: true })
            );
        }
    } as unknown as LocalMeetingWebRuntime;
    return { runtime, calls };
}

describe("target Remote boundary", () => {
    it("exposes only list/read/control and the refresh stream", async () => {
        const fixture = runtimeFixture();
        const gateway = await createRemoteGateway(fixture.runtime);
        await expect(gateway.invoke("list", {})).resolves.toEqual({ meetings: [] });
        expect(fixture.calls.list).toBe(1);

        await expect(
            gateway.invoke("control", {
                command: {
                    protocolVersion: 1,
                    meetingId: "meeting-1",
                    expectedMeetingVersion: 1,
                    requestId: "request-1",
                    action: { kind: "open_round", agendaId: "agenda-1", planId: "plan-1" }
                }
            })
        ).resolves.toMatchObject({ kind: "rejected", error: { code: "UNAUTHORIZED" } });
        expect(fixture.calls.control).toBe(1);

        await expect(
            gateway.invoke("read", { request: { protocolVersion: 1, meetingId: "" } })
        ).rejects.toMatchObject({ code: "convivium/invalid-request" });
        expect(fixture.calls.read).toBe(0);

        const stream = await gateway.stream("subscribeRefresh", {});
        await expect(stream[Symbol.asyncIterator]().next()).resolves.toEqual({
            done: false,
            value: { kind: "refresh", meetingId: "meeting-1", committedVersion: 3 }
        });
        await gateway.dispose();
    });

    it("maps an incomplete Meeting list to convivium/internal", async () => {
        const fixture = runtimeFixture();
        fixture.runtime.list = async () => {
            throw new Error("Meeting is not ready.");
        };
        const gateway = await createRemoteGateway(fixture.runtime);

        try {
            await expect(gateway.invoke("list", {})).rejects.toMatchObject({
                code: "convivium/internal"
            });
        } finally {
            await gateway.dispose();
        }
    });
});

import {
    activateTargetMeetingApplication,
    getLocalMeetingWebRuntime,
    getMeetingCommandApplication
} from "@/runtime/meeting-lifecycle.js";
import { DomainRepositoryRegistry } from "@/repository/domain/domain-repository-registry.js";
import roleResources from "../../config/definitions.json" with { type: "json" };

it("routes all fourteen user controls through the application with a fixed trusted caller", async () => {
    const registry = { listMeetings: vi.fn(() => []), openMeeting: vi.fn(), close: vi.fn() };
    const open = vi.spyOn(DomainRepositoryRegistry, "open").mockResolvedValue(registry as never);
    const owner = {
        storageDomain: {},
        logger: () => ({ error: vi.fn() }),
        agents: { get: () => undefined },
        subagents: {
            getProvider: () => ({
                name: "spawn",
                capabilities: { outputSchema: true },
                prepareContinuable: async () => ({})
            })
        }
    };
    const dispose = await activateTargetMeetingApplication(
        owner as never,
        {
            provider: "spawn",
            maxParticipants: 7,
            speakerTimeoutMs: 60000,
            outboxPollMs: 1000,
            agentDefinitions: roleResources.definitions
        },
        { rolePackageRoot: "/fixture" }
    );
    const application = getMeetingCommandApplication(owner);
    const execute = vi.spyOn(application, "execute").mockResolvedValue({
        kind: "accepted",
        meetingId: "created-meeting",
        committedVersion: 1,
        receiptId: "receipt",
        factIds: [],
        effects: []
    });
    const gateway = await createRemoteGateway(getLocalMeetingWebRuntime(owner));
    const actions: MeetingCommand["action"][] = [
        {
            kind: "activate_agenda",
            agendaId: "a",
            previousDisposition: "completed",
            reason: "next"
        },
        {
            kind: "dispose_agenda_candidate",
            candidateId: "c",
            disposition: "parked",
            reason: "later"
        },
        {
            kind: "resolve_question",
            questionId: "q",
            status: "deferred",
            rationale: "later",
            evidenceIds: ["v"]
        },
        {
            kind: "dispose_issue",
            issueId: "i",
            status: "resolved",
            rationale: "fixed",
            evidenceIds: ["v"]
        },
        { kind: "abort_round", roundId: "r", reason: "stop" },
        { kind: "decide", candidateId: "c" },
        {
            kind: "change_decision",
            decisionId: "d",
            status: "revoked",
            rationale: "invalid",
            evidenceIds: ["v"]
        },
        {
            kind: "dispose_risk",
            issueId: "i",
            action: "accept",
            scope: "current",
            rationale: "bounded",
            evidenceIds: ["v"]
        },
        {
            kind: "record_completion_fact",
            outputId: "o",
            statement: "done",
            rationale: "verified",
            evidenceIds: ["v"],
            decisionIds: ["d"]
        },
        { kind: "change_completion_fact", factId: "f", status: "revoked", rationale: "invalid" }
    ];
    actions.push(
        { kind: "pause_meeting", reason: "pause" },
        { kind: "resume_meeting", reason: "resume" },
        {
            kind: "end_meeting",
            outcome: "cancelled",
            reason: "end",
            decisionIds: [],
            completionFactIds: [],
            unresolvedQuestionIds: [],
            unresolvedIssueIds: []
        }
    );
    actions.push({
        kind: "create_meeting",
        objective: {
            statement: "goal",
            requiredOutputs: [],
            acceptanceCriteria: [],
            hardConstraints: [],
            acceptableRiskLevel: "low"
        },
        identities: roleResources.definitions.map((d) => ({
            identityKey: d.roleDefinitionId,
            displayName: d.displayName,
            definitionId: d.agentDefinitionId,
            definitionVersion: d.definitionVersion,
            roles: [
                d.roleDefinitionId === "meeting_manager"
                    ? "manager"
                    : d.roleDefinitionId === "verification_reviewer"
                      ? "evidence_reviewer"
                      : "contributor"
            ],
            agendaResponsibilityIds: ["a"],
            riskAuthority: false,
            required: true
        })),
        managerIdentityKey: "meeting_manager",
        evidenceReviewerIdentityKey: "verification_reviewer",
        initialAgenda: [{ id: "a", title: "agenda", question: "question", requiredOutputIds: [] }],
        initialActiveAgendaId: "a",
        limits: {
            maxFormalMessages: 100,
            maxDurationMs: 100000,
            taskDeadlineMs: 1000,
            reviewDeadlineMs: 1000
        }
    });
    try {
        for (const action of actions) {
            const command = {
                protocolVersion: 1,
                meetingId: action.kind === "create_meeting" ? "new" : "m",
                expectedMeetingVersion: action.kind === "create_meeting" ? 0 : 1,
                requestId: action.kind,
                action
            };
            await expect(gateway.invoke("control", { command })).resolves.toMatchObject({
                kind: "accepted"
            });
            expect(execute).toHaveBeenLastCalledWith(
                expect.objectContaining({ action }),
                {
                    caller: { channel: "loopback_remote", principalId: "local-controller" }
                },
                expect.any(AbortSignal)
            );
        }
        expect(execute).toHaveBeenCalledTimes(14);
        expect(registry.openMeeting).not.toHaveBeenCalled();
        await expect(
            gateway.invoke("control", { command: { action: { kind: "decide" } } })
        ).rejects.toMatchObject({ code: "gateway/input-invalid" });
        await expect(
            gateway.invoke("control", {
                command: {
                    protocolVersion: 1,
                    meetingId: "m",
                    expectedMeetingVersion: 1,
                    requestId: "agent",
                    action: { kind: "raise_hand", roundId: "r", purpose: "speak" }
                }
            })
        ).resolves.toMatchObject({ kind: "rejected", error: { code: "UNAUTHORIZED" } });
        expect(execute).toHaveBeenCalledTimes(14);
    } finally {
        await gateway.dispose();
        await dispose();
        open.mockRestore();
    }
});
