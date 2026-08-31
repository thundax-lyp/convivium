import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apply, inject, name } from "../../src/client/index.js";
import { ConviviumMeetingPanel } from "../../src/client/meeting-panel.js";
import { mapMeetingPanelView } from "../../src/client/meeting-panel-view.js";
import type { MeetingStatusResultV1 } from "../../src/protocol/index.js";

const meetingId = "meeting/1";
const listItem = {
    meetingId,
    teamId: "team-1",
    topic: "Runtime smoke",
    status: "running" as const,
    meetingVersion: 2,
    updatedAt: 10
};

function listResponse(meetings = [listItem]) {
    return { protocolVersion: 1 as const, ok: true as const, result: { meetings } };
}

function statusResult(
    status: "running" | "paused" | "converging" = "running",
    meetingVersion = 2,
    withCurrentAttempt = false
): MeetingStatusResultV1 {
    return {
        meetingId,
        meetingVersion,
        topic: "Runtime smoke",
        objective: "Verify local control",
        continuationMaterials: [],
        limits: { maxTurns: 3, maxSpeakersPerTurn: 2, maxTotalMessages: 20 },
        messages: [],
        questions: [],
        proposals: [],
        acceptedDecisions: [],
        blockingFacts: [],
        meetingTasks: [],
        status,
        pendingHandRaises: [],
        ...(withCurrentAttempt
            ? {
                  currentTurn: {
                      id: "turn-1",
                      seq: 1,
                      agendaItemId: "agenda-1",
                      intent: "Review scope",
                      objective: "Verify local control",
                      expectedOutputs: [],
                      prohibitedTopics: [],
                      steps: [
                          {
                              id: "step-1",
                              participantId: "participant-one",
                              instruction: "Speak",
                              reason: "Current speaker",
                              status: "running" as const
                          }
                      ]
                  },
                  currentSpeakerId: "participant-one",
                  currentAttemptId: "attempt-1"
              }
            : {}),
        pauseControl:
            status === "paused"
                ? {
                      action: "resume" as const,
                      pausedAt: 100,
                      pausedBy: { kind: "local_host" as const, actorId: "loopback-web" },
                      reason: "Inspect output"
                  }
                : status === "converging"
                  ? { action: "none" as const }
                  : { action: "pause" as const }
    };
}

function terminalStatusResult() {
    return {
        ...statusResult("running", 5),
        status: "completed" as const,
        pendingHandRaises: [] as const,
        pauseControl: { action: "none" as const },
        termination: {
            code: "completed",
            reason: "Done",
            decisionIds: [],
            unresolvedQuestionIds: [],
            dissentingPositionIds: [],
            blockingAgendaItemIds: [],
            finalMessage: "Complete",
            endedAt: 200
        },
        completionFactIds: []
    };
}

function success<T>(result: T, meetingVersion = 2) {
    return { protocolVersion: 1 as const, ok: true as const, meetingId, meetingVersion, result };
}

function jsonResponse(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: { "content-type": "application/json" }
    });
}

function protocolError(message = "Version changed") {
    return {
        protocolVersion: 1 as const,
        ok: false as const,
        code: "VERSION_CONFLICT",
        message,
        meetingId,
        meetingVersion: 3,
        retryable: true
    };
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

async function selectMeeting(): Promise<void> {
    const item = await screen.findByRole("button", { name: /Runtime smoke/ });
    fireEvent.click(item);
    await screen.findByLabelText("Meeting summary");
}

describe("client entry framework", () => {
    beforeEach(() => {
        vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "request-1") });
    });

    it("maps active and terminal projections without mutating transcript order", () => {
        const active = statusResult("running", 2, true);
        const activeView = mapMeetingPanelView(active);
        expect(activeView.plannedSpeakerOrder).toBe("participant-one");
        expect(activeView.currentSpeaker).toBe("participant-one");
        expect(activeView.termination).toBeUndefined();

        const terminal = terminalStatusResult();
        const terminalView = mapMeetingPanelView(terminal);
        expect(terminalView.termination?.code).toBe("completed");
        expect(terminalView.currentSpeaker).toBe("None");

        const message = {
            id: "m1",
            seq: 1,
            turnId: "turn-1",
            stepId: "step-1",
            speaker: "participant-one",
            agendaItemId: "agenda-1",
            kind: "statement" as const,
            content: "hello",
            mentions: [],
            taskIds: [],
            createdAt: 1
        };
        const messages = [{ ...message, id: "m2", seq: 2 }, message];
        const ordered = mapMeetingPanelView({ ...active, messages });
        expect(ordered.messages.map((message) => message.seq)).toEqual([1, 2]);
        expect(messages.map((message) => message.seq)).toEqual([2, 1]);
        expect(ordered.blockingFacts).toEqual([]);
        expect(ordered.acceptedDecisions).toEqual([]);
    });

    it("renders transcript in seq order and blocking facts with empty-state sections", async () => {
        const message = {
            id: "m1",
            seq: 1,
            turnId: "turn-1",
            stepId: "step-1",
            speaker: "participant-one",
            agendaItemId: "agenda-1",
            kind: "statement" as const,
            content: "hello",
            mentions: [],
            taskIds: [],
            createdAt: 1
        };
        const detail = {
            ...statusResult(),
            messages: [{ ...message, id: "m2", seq: 2 }, message],
            blockingFacts: [{ id: "b1", kind: "risk" as const, subjectId: "s1", summary: "risk" }]
        };
        vi.stubGlobal(
            "fetch",
            vi
                .fn<typeof fetch>()
                .mockResolvedValueOnce(jsonResponse(listResponse()))
                .mockResolvedValueOnce(jsonResponse(success(detail)))
        );
        render(createElement(ConviviumMeetingPanel));
        await selectMeeting();
        const transcript = screen.getByLabelText("Transcript");
        expect(
            [...transcript.querySelectorAll("li")].map((item) =>
                item.getAttribute("data-message-seq")
            )
        ).toEqual(["1", "2"]);
        expect(screen.getByLabelText("Blocking items").textContent).toContain("risk");
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it("registers the meeting panel only through the conversation view injection", () => {
        let contribution: unknown;
        const register = vi.fn((_options, component) => {
            contribution = component;
            return vi.fn();
        });
        const slotInject = vi.fn((_key, callback: () => unknown) => callback());

        expect(name).toBe("convivium-client");
        expect(inject).toEqual(["slots"]);
        apply({ slots: { inject: slotInject, register } } as never);

        expect(slotInject).toHaveBeenCalledTimes(1);
        expect(slotInject).toHaveBeenCalledWith("conversation.view", expect.any(Function));
        expect(register).toHaveBeenCalledWith(
            {
                name: "conversation.view",
                id: "convivium-meetings",
                label: "Meetings",
                order: 100
            },
            ConviviumMeetingPanel
        );
        expect(contribution).toBe(ConviviumMeetingPanel);
    });

    it("loads only the list initially, then renders a validated full paused projection", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult("paused", 3), 3)));
        vi.stubGlobal("fetch", fetchMock);
        render(createElement(ConviviumMeetingPanel));

        const item = await screen.findByRole("button", { name: /Runtime smoke/ });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(item.getAttribute("data-meeting-id")).toBe(meetingId);
        expect(screen.getByTestId("convivium-meeting-panel").getAttribute("aria-label")).toBe(
            "Convivium meetings"
        );
        expect(screen.getByLabelText("Meetings")).toBeTruthy();

        fireEvent.click(item);
        await screen.findByLabelText("Meeting summary");
        expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/convivium/meetings/meeting%2F1");
        expect(screen.getByLabelText("Resume meeting")).toBeTruthy();
        expect(screen.queryByLabelText("Pause meeting")).toBeNull();
        expect(screen.getByLabelText("Meeting summary").textContent).toContain("paused");
    });

    it("refreshes both the selected detail and list summary when the window regains focus", async () => {
        const pausedListItem = { ...listItem, status: "paused" as const, meetingVersion: 3 };
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult())))
            .mockResolvedValueOnce(jsonResponse(listResponse([pausedListItem])))
            .mockResolvedValueOnce(jsonResponse(success(statusResult("paused", 3), 3)));
        vi.stubGlobal("fetch", fetchMock);
        render(createElement(ConviviumMeetingPanel));
        await selectMeeting();

        window.dispatchEvent(new Event("focus"));

        await screen.findByText("paused");
        expect(screen.getByRole("button", { name: /Runtime smoke \(paused\)/ })).toBeTruthy();
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it("keeps writes exclusive and refetches status after a successful write", async () => {
        const post = deferred<Response>();
        const pausedListItem = { ...listItem, status: "paused" as const, meetingVersion: 3 };
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult())))
            .mockImplementationOnce(() => post.promise)
            .mockResolvedValueOnce(jsonResponse(listResponse([pausedListItem])))
            .mockResolvedValueOnce(jsonResponse(success(statusResult("paused", 3), 3)));
        vi.stubGlobal("fetch", fetchMock);
        render(createElement(ConviviumMeetingPanel));
        await selectMeeting();

        fireEvent.change(screen.getByLabelText("Pause reason"), {
            target: { value: "Inspect output" }
        });
        fireEvent.click(screen.getByLabelText("Pause meeting"));
        expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(3);

        window.dispatchEvent(new Event("focus"));
        await act(async () => Promise.resolve());
        expect(fetchMock).toHaveBeenCalledTimes(3);

        await act(async () => {
            post.resolve(jsonResponse(success({ status: "paused", changed: true }, 3)));
            await post.promise;
        });
        await screen.findByText("paused");
        expect(fetchMock).toHaveBeenCalledTimes(5);
        expect(screen.getByRole("button", { name: /Runtime smoke \(paused\)/ })).toBeTruthy();
        expect(fetchMock.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(1);
        expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: 2,
            requestId: "request-1",
            reason: "Inspect output"
        });
    });

    it("shows Skip only for a visible current attempt and posts the fixed skip payload", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult("running", 2, true))))
            .mockResolvedValueOnce(
                jsonResponse(success({ revokedAttemptId: "attempt-1", action: "skip" }, 3))
            )
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult("running", 3))));
        vi.stubGlobal("fetch", fetchMock);
        render(createElement(ConviviumMeetingPanel));
        await selectMeeting();

        expect(screen.getByLabelText("Skip current speaker")).toBeTruthy();
        fireEvent.change(screen.getByLabelText("Skip reason"), {
            target: { value: "Move on" }
        });
        fireEvent.click(screen.getByLabelText("Skip current speaker"));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
        expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/convivium/meetings/meeting%2F1/reassign");
        expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: 2,
            currentAttemptId: "attempt-1",
            action: "skip",
            reason: "Move on",
            requestId: "request-1"
        });
        expect(
            JSON.stringify(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body)))
        ).not.toContain("replacementParticipantId");
    });

    it("limits End outcomes and posts the fixed empty completion fields", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult("converging", 2))))
            .mockResolvedValueOnce(
                jsonResponse(
                    success({ status: "no_consensus", terminationCode: "no_consensus" }, 3)
                )
            )
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(terminalStatusResult()));
        vi.stubGlobal("fetch", fetchMock);
        render(createElement(ConviviumMeetingPanel));
        await selectMeeting();

        expect(screen.queryByRole("option", { name: "Completed" })).toBeNull();
        fireEvent.change(screen.getByLabelText("End outcome"), {
            target: { value: "no_consensus" }
        });
        fireEvent.change(screen.getByLabelText("End reason"), {
            target: { value: "No consensus reached" }
        });
        fireEvent.click(screen.getByLabelText("End meeting"));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
        expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/convivium/meetings/meeting%2F1/end");
        expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: 2,
            outcome: "no_consensus",
            reason: "No consensus reached",
            acceptedDecisionIds: [],
            deferredAgendaItemIds: [],
            waivers: [],
            requestId: "request-1"
        });
    });

    it("refetches after a validated protocol error without retrying the POST", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult())))
            .mockResolvedValueOnce(jsonResponse(protocolError("Safe conflict"), 409))
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult("running", 3), 3)));
        vi.stubGlobal("fetch", fetchMock);
        render(createElement(ConviviumMeetingPanel));
        await selectMeeting();

        fireEvent.change(screen.getByLabelText("Pause reason"), { target: { value: "Reason" } });
        fireEvent.click(screen.getByLabelText("Pause meeting"));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
        expect(fetchMock.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(1);
        await waitFor(() =>
            expect(screen.getByLabelText("Meeting summary").textContent).toContain("3")
        );
        expect(screen.queryByText("Safe conflict")).toBeNull();
    });

    it("does not retry a transport-failed write and keeps the projection read-only", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult())))
            .mockRejectedValueOnce(new TypeError("network write"));
        vi.stubGlobal("fetch", fetchMock);
        render(createElement(ConviviumMeetingPanel));
        await selectMeeting();

        fireEvent.change(screen.getByLabelText("Pause reason"), { target: { value: "Reason" } });
        fireEvent.click(screen.getByLabelText("Pause meeting"));

        await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(fetchMock.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(1);
        expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(true);
        expect(screen.getByLabelText("Meeting summary").textContent).toContain("2");
    });

    it("does not expose controls for a terminal projection", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(terminalStatusResult(), 5)));
        vi.stubGlobal("fetch", fetchMock);
        render(createElement(ConviviumMeetingPanel));
        await selectMeeting();

        expect(screen.getByLabelText("Meeting summary").textContent).toContain("completed");
        expect(screen.queryByLabelText("Pause meeting")).toBeNull();
        expect(screen.queryByLabelText("Resume meeting")).toBeNull();
        expect(screen.queryByLabelText("Skip current speaker")).toBeNull();
        expect(screen.queryByLabelText("End meeting")).toBeNull();
    });

    it("disables meeting writes when the list projection becomes cached", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult())))
            .mockRejectedValueOnce(new TypeError("network list"));
        vi.stubGlobal("fetch", fetchMock);
        render(createElement(ConviviumMeetingPanel));
        await selectMeeting();

        fireEvent.click(screen.getByLabelText("Reload meetings"));

        await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
        expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(true);
    });

    it("preserves cached data on failures, polls the selection, and aborts on unmount", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult())))
            .mockRejectedValueOnce(new TypeError("network list"))
            .mockRejectedValueOnce(new TypeError("network detail"))
            .mockRejectedValueOnce(new TypeError("network list"))
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult("running", 4), 4)));
        vi.stubGlobal("fetch", fetchMock);
        const rendered = render(createElement(ConviviumMeetingPanel));
        await selectMeeting();

        window.dispatchEvent(new Event("focus"));
        await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
        expect(screen.getByLabelText("Meeting summary").textContent).toContain("2");
        expect(screen.getByRole("alert").parentElement?.getAttribute("data-cached")).toBe("true");
        expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(true);

        fireEvent.click(screen.getByLabelText("Reload meetings"));
        await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
        expect(screen.getByLabelText("Meetings").parentElement?.getAttribute("data-cached")).toBe(
            "true"
        );
        expect(screen.getByRole("alert").parentElement?.getAttribute("data-cached")).toBe("true");

        await act(async () => vi.advanceTimersByTime(5_000));
        await waitFor(() =>
            expect(screen.getByLabelText("Meeting summary").textContent).toContain("4")
        );
        const lastSignal = fetchMock.mock.calls.at(-1)?.[1]?.signal;
        rendered.unmount();
        expect(lastSignal?.aborted).toBe(true);
    });
});
