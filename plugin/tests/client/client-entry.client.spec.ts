import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apply, inject, name } from "../../src/client/index.js";
import { ConviviumMeetingPanel } from "../../src/client/meeting-panel.js";

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

function statusResult(status: "running" | "paused" = "running", meetingVersion = 2) {
    return {
        meetingId,
        meetingVersion,
        topic: "Runtime smoke",
        objective: "Verify local control",
        continuationMaterials: [],
        limits: { maxTurns: 3, maxSpeakersPerTurn: 2, maxTotalMessages: 20 },
        messages: [],
        questions: [],
        acceptedDecisions: [],
        blockingFacts: [],
        meetingTasks: [],
        status,
        pendingHandRaises: [],
        pauseControl:
            status === "paused"
                ? {
                      action: "resume" as const,
                      pausedAt: 100,
                      pausedBy: { kind: "local_host" as const, actorId: "loopback-web" },
                      reason: "Inspect output"
                  }
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
    await screen.findByLabelText("Meeting status details");
}

describe("client entry framework", () => {
    beforeEach(() => {
        vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "request-1") });
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
        const projection = await screen.findByLabelText("Meeting status details");
        expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/convivium/meetings/meeting%2F1");
        expect(projection.textContent).toContain('"objective": "Verify local control"');
        expect(screen.getByText("Inspect output")).toBeTruthy();
        expect(screen.getByText("local_host/loopback-web")).toBeTruthy();
        expect(screen.getByText("100")).toBeTruthy();
        expect(screen.getByLabelText("Resume meeting")).toBeTruthy();
        expect(screen.queryByLabelText("Pause meeting")).toBeNull();
        expect(screen.getByText("Status: paused").getAttribute("data-meeting-status")).toBe(
            "paused"
        );
    });

    it("keeps writes exclusive and refetches status after a successful write", async () => {
        const post = deferred<Response>();
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult())))
            .mockImplementationOnce(() => post.promise)
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
        await screen.findByText("Status: paused");
        expect(fetchMock).toHaveBeenCalledTimes(4);
        expect(fetchMock.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(1);
        expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: 2,
            requestId: "request-1",
            reason: "Inspect output"
        });
    });

    it("refetches after a validated protocol error without retrying the POST", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult())))
            .mockResolvedValueOnce(jsonResponse(protocolError("Safe conflict"), 409))
            .mockResolvedValueOnce(jsonResponse(success(statusResult("running", 3), 3)));
        vi.stubGlobal("fetch", fetchMock);
        render(createElement(ConviviumMeetingPanel));
        await selectMeeting();

        fireEvent.change(screen.getByLabelText("Pause reason"), { target: { value: "Reason" } });
        fireEvent.click(screen.getByLabelText("Pause meeting"));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
        expect(fetchMock.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(1);
        await waitFor(() =>
            expect(screen.getByLabelText("Meeting status details").textContent).toContain(
                '"meetingVersion": 3'
            )
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
        expect(screen.getByLabelText("Meeting status details").textContent).toContain(
            '"meetingVersion": 2'
        );
    });

    it("does not expose controls for a terminal projection", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(terminalStatusResult(), 5)));
        vi.stubGlobal("fetch", fetchMock);
        render(createElement(ConviviumMeetingPanel));
        await selectMeeting();

        expect(screen.getByText("Status: completed")).toBeTruthy();
        expect(screen.queryByLabelText("Pause meeting")).toBeNull();
        expect(screen.queryByLabelText("Resume meeting")).toBeNull();
    });

    it("preserves cached data on failures, polls the selection, and aborts on unmount", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult())))
            .mockRejectedValueOnce(new TypeError("network detail"))
            .mockRejectedValueOnce(new TypeError("network list"))
            .mockResolvedValueOnce(jsonResponse(success(statusResult("running", 4), 4)));
        vi.stubGlobal("fetch", fetchMock);
        const rendered = render(createElement(ConviviumMeetingPanel));
        await selectMeeting();

        window.dispatchEvent(new Event("focus"));
        await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
        expect(screen.getByLabelText("Meeting status details").textContent).toContain(
            '"meetingVersion": 2'
        );
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
            expect(screen.getByLabelText("Meeting status details").textContent).toContain(
                '"meetingVersion": 4'
            )
        );
        const lastSignal = fetchMock.mock.calls.at(-1)?.[1]?.signal;
        rendered.unmount();
        expect(lastSignal?.aborted).toBe(true);
    });
});
