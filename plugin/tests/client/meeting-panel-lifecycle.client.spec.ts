import type { RemoteStreamOptions } from "@deepseek-ai/dsh-api-gateway/client";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apply, inject, name } from "@/client/index.js";
import { createMeetingClient } from "@/client/meeting-client.js";
import { createControlledMeetingStream } from "../fixtures/remote-stream.js";
import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
import {
    type Rpc,
    api,
    clientFixture,
    streams,
    useRemoteFixture,
    setRpc,
    isWrite,
    ConviviumMeetingPanel,
    mapMeetingPanelView,
    MeetingStatusResultSchema,
    meetingId,
    listItem,
    listResponse,
    statusResult,
    terminalStatusResult,
    factStatus,
    factTerminalStatus,
    factArchiveStatus,
    refreshFactStatus,
    assertRefreshFacts,
    success,
    remoteResult,
    protocolError,
    factDecisions,
    deferred,
    selectMeeting,
    expectSelectedEndOutcome
} from "./meeting-panel-fixtures.js";

useRemoteFixture();
beforeEach(() => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "request-1") });
});

describe("meeting panel and client plugin lifecycle", () => {
    it.each([
        "created",
        "running",
        "waiting",
        "paused",
        "converging",
        "completed",
        "partial",
        "no_consensus",
        "cancelled",
        "failed",
        "archiving",
        "archived"
    ] as const)("fact visibility: decision history schema and mapper for %s", async (status) => {
        const detail = ["created", "running", "waiting", "paused", "converging"].includes(status)
            ? factStatus(status as "created" | "running" | "waiting" | "paused" | "converging")
            : ["completed", "partial", "no_consensus", "cancelled", "failed"].includes(status)
              ? factTerminalStatus(
                    status as "completed" | "partial" | "no_consensus" | "cancelled" | "failed"
                )
              : factArchiveStatus(status as "archiving" | "archived");
        expect(() => MeetingStatusResultSchema(JSON.parse(JSON.stringify(detail)))).not.toThrow();
        expect(mapMeetingPanelView(detail).decisionHistory.map((decision) => decision.id)).toEqual([
            "d-old",
            "d-revoked",
            "d-current"
        ]);
        setRpc(
            vi.fn(async (input: string) =>
                String(input) === "list"
                    ? remoteResult(listResponse())
                    : remoteResult(success(detail, detail.meetingVersion))
            )
        );
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();
        await waitFor(() => {
            const accepted = screen.getByLabelText("Accepted decisions").textContent ?? "";
            const historySection = screen.getByLabelText("Decision history");
            const history = historySection.textContent ?? "";
            const historyIds = [...historySection.querySelectorAll("[data-decision-id]")].map(
                (item) => item.getAttribute("data-decision-id")
            );
            expect(accepted).toContain("d-current");
            expect(historyIds).toEqual(["d-old", "d-revoked", "d-current"]);
            for (const value of [
                "superseded",
                "revoked",
                "accepted",
                "p-old",
                "p-revoked",
                "p-current",
                "Old decision",
                "Revoked decision",
                "Current decision",
                "Old rationale",
                "Revoked rationale",
                "Current rationale",
                "participant-one",
                "agenda-1",
                "position-dissent"
            ])
                expect(history).toContain(value);
            const parking = screen.getByLabelText("Parking Lot");
            expect(
                [...parking.querySelectorAll("[data-candidate-id]")].map((item) =>
                    item.getAttribute("data-candidate-id")
                )
            ).toEqual([
                "candidate-pending",
                "candidate-promoted",
                "candidate-parked",
                "candidate-rejected"
            ]);
        });
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
        setRpc(
            vi
                .fn<Rpc>()
                .mockResolvedValueOnce(remoteResult(listResponse()))
                .mockResolvedValueOnce(remoteResult(listResponse()))
                .mockResolvedValueOnce(remoteResult(success(detail)))
        );
        render(createElement(ConviviumMeetingPanel, { api }));
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

    it("mounts the namespace before registering the meeting panel", async () => {
        const register = vi.fn(() => () => {});
        const slotInject = vi.fn((_key, callback: () => unknown) => callback());
        const ctx = clientFixture.ctx;
        await clientFixture.unmount();
        ctx.provide("slots", { inject: slotInject, register });
        expect(name).toBe("convivium-client");
        expect(inject).toEqual(["remote"]);
        await ctx.plugin({ name, inject, apply });
        await waitFor(() => expect(register).toHaveBeenCalledOnce());
        expect(slotInject).toHaveBeenCalledWith("conversation.view", expect.any(Function));
        expect(register).toHaveBeenCalledWith(
            { name: "conversation.view", id: "convivium-meetings", label: "Meetings", order: 100 },
            expect.any(Function)
        );
    });

    it("loads only the list initially, then renders a validated full paused projection", async () => {
        const rpcMock = vi
            .fn<Rpc>()
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult("paused", 3), 3)));
        setRpc(rpcMock);
        render(createElement(ConviviumMeetingPanel, { api }));

        const item = await screen.findByRole("button", { name: /Runtime smoke/ });
        expect(rpcMock).toHaveBeenCalledTimes(1);
        expect(item.getAttribute("data-meeting-id")).toBe(meetingId);
        expect(screen.getByTestId("convivium-meeting-panel").getAttribute("aria-label")).toBe(
            "Convivium meetings"
        );
        expect(screen.getByLabelText("Meetings")).toBeTruthy();

        fireEvent.click(item);
        await screen.findByLabelText("Meeting summary");
        expect(rpcMock.mock.calls[2]?.[0]).toBe("getStatus");
        expect(screen.getByLabelText("Resume meeting")).toBeTruthy();
        expect(screen.queryByLabelText("Pause meeting")).toBeNull();
        expect(screen.getByLabelText("Meeting summary").textContent).toContain("paused");
        expect(screen.getByLabelText("Pause details").textContent).toContain("Inspect output");
        expect(screen.getByLabelText("Pause details").textContent).toContain("loopback-web");
        expect(screen.getByLabelText("Meeting limits").textContent).toContain("Maximum turns3");
    });

    it("refreshes both the selected detail and list summary when the window regains focus", async () => {
        const pausedListItem = { ...listItem, status: "paused" as const, meetingVersion: 3 };
        const rpcMock = vi
            .fn<Rpc>()
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult())))
            .mockResolvedValueOnce(remoteResult(listResponse([pausedListItem])))
            .mockResolvedValueOnce(remoteResult(success(statusResult("paused", 3), 3)));
        setRpc(rpcMock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();

        window.dispatchEvent(new Event("focus"));

        await screen.findByText("paused");
        expect(screen.getByRole("button", { name: /Runtime smoke \(paused\)/ })).toBeTruthy();
        expect(rpcMock).toHaveBeenCalledTimes(5);
    });

    it.each(["focus", "notice"] as const)(
        "fact visibility: %s replaces complete facts and reopen retains archive",
        async (trigger) => {
            const active = refreshFactStatus("active");
            const terminal = refreshFactStatus("terminal");
            const archived = refreshFactStatus("archived");
            const originals = [active, terminal, archived].map((value) => JSON.stringify(value));
            for (const value of [active, terminal, archived]) {
                expect(() =>
                    MeetingStatusResultSchema(JSON.parse(JSON.stringify(value)))
                ).not.toThrow();
            }
            let selected = active;
            setRpc(
                vi.fn(async (input: string) =>
                    String(input) === "list"
                        ? remoteResult(listResponse())
                        : remoteResult(success(selected, selected.meetingVersion))
                )
            );
            const rendered = render(createElement(ConviviumMeetingPanel, { api }));
            await selectMeeting();
            assertRefreshFacts(active);
            fireEvent.change(screen.getByLabelText("Pause reason"), {
                target: { value: "Inspect facts" }
            });
            expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(false);
            for (const next of [terminal, archived]) {
                selected = next;
                if (trigger === "notice") await act(async () => streams.at(-1)!.push());
                else fireEvent(window, new Event("focus"));
                await waitFor(() => assertRefreshFacts(next));
                const dds = [
                    ...screen.getByLabelText("Decision history").querySelectorAll("dd")
                ].map((dd) => dd.textContent);
                expect(dds).not.toContain(factDecisions()[2].statement);
                if (next === archived) expect(dds).not.toContain("Current decision v5");
                expect(screen.getByLabelText("Current activity").textContent).toContain(
                    "Turn reasonNone"
                );
            }
            rendered.unmount();
            render(createElement(ConviviumMeetingPanel, { api }));
            await selectMeeting();
            assertRefreshFacts(archived);
            expect([active, terminal, archived].map((value) => JSON.stringify(value))).toEqual(
                originals
            );
        }
    );
});

describe("meeting panel refresh and connection lifecycle", () => {
    it.each(["decisionHistory", "parkingLot", "archiveIssues"] as const)(
        "fact visibility: malformed %s keeps cached facts until valid recovery",
        async (kind) => {
            const active = refreshFactStatus("active");
            const initial = active;
            const malformedSource =
                kind === "archiveIssues" ? factArchiveStatus("archived") : active;
            const malformed = JSON.parse(JSON.stringify(malformedSource)) as Record<
                string,
                unknown
            >;
            if (kind === "decisionHistory") delete malformed.decisionHistory;
            if (kind === "parkingLot") delete malformed.parkingLot;
            if (kind === "archiveIssues") {
                delete (
                    (malformed.archive as Record<string, unknown>).package as Record<
                        string,
                        unknown
                    >
                ).issues;
            }
            expect(() => MeetingStatusResultSchema(malformedSource)).not.toThrow();
            expect(() => MeetingStatusResultSchema(malformed)).toThrow();
            const rpcMock = vi
                .fn<Rpc>()
                .mockResolvedValueOnce(remoteResult(listResponse([listItem])))
                .mockResolvedValueOnce(remoteResult(listResponse()))
                .mockResolvedValueOnce(remoteResult(success(initial, 2)))
                .mockResolvedValueOnce(remoteResult(listResponse()))
                .mockResolvedValueOnce(
                    remoteResult(success(malformed, malformedSource.meetingVersion))
                );
            setRpc(rpcMock);
            render(createElement(ConviviumMeetingPanel, { api }));
            await selectMeeting();
            fireEvent.change(screen.getByLabelText("Pause reason"), {
                target: { value: "Inspect facts" }
            });
            expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(false);
            window.dispatchEvent(new Event("focus"));
            await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
            assertRefreshFacts(active);
            expect(screen.getByLabelText("Parking Lot").textContent).toContain("candidate-pending");
            expect(screen.getByLabelText("Risks").textContent).toContain("risk-accepted");
            expect(
                screen.getByRole("button", { name: "Pause meeting" }).hasAttribute("disabled")
            ).toBe(true);
            rpcMock.mockResolvedValueOnce(remoteResult(listResponse()));
            rpcMock.mockResolvedValueOnce(remoteResult(success(refreshFactStatus("archived"), 6)));
            window.dispatchEvent(new Event("focus"));
            await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
            await waitFor(() => assertRefreshFacts(refreshFactStatus("archived")));
            expect(screen.getByLabelText("Decision history").textContent).toContain("d-current");
        }
    );

    it("keeps selected meeting controls disabled until the list and detail both refresh", async () => {
        const listRead = deferred<RemoteResult<unknown>>();
        let holdList = false;
        const mock = vi.fn<Rpc>(async (method) =>
            method === "list"
                ? holdList
                    ? listRead.promise
                    : remoteResult(listResponse())
                : remoteResult(success(statusResult("paused")))
        );
        setRpc(mock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await screen.findByRole("button", { name: /Runtime smoke/ });
        holdList = true;
        await selectMeeting();
        const resume = screen.getByLabelText("Resume meeting");
        expect(resume.hasAttribute("disabled")).toBe(true);
        fireEvent.click(resume);
        expect(mock.mock.calls.some(([method]) => isWrite(method))).toBe(false);
        await act(async () => listRead.resolve(remoteResult(listResponse())));
        await waitFor(() => expect(resume.hasAttribute("disabled")).toBe(false));
    });

    it("disables cached controls on carrier loss until both reconnect reads succeed", async () => {
        const remote = clientFixture.ctx.remote;
        const carrierFailure = vi.fn();
        api.openUpdates = (unavailable) => {
            const fixture = createControlledMeetingStream(
                unavailable,
                true,
                (connection, options, RemoteStream) => {
                    return createMeetingClient({
                        ...remote,
                        conviviumMeetings: {
                            ...remote.conviviumMeetings,
                            watchUpdates: (signal) => options.open(signal!)
                        },
                        $stream: <T>(configuration: RemoteStreamOptions<T>) =>
                            new RemoteStream(connection, configuration)
                    }).openUpdates(() => {
                        carrierFailure();
                        unavailable();
                    });
                }
            );
            streams.push(fixture);
            return fixture.stream;
        };
        let hold = false;
        const detailRead = deferred<RemoteResult<unknown>>();
        setRpc(async (method) =>
            method === "list"
                ? remoteResult(listResponse())
                : hold
                  ? detailRead.promise
                  : remoteResult(success(statusResult()))
        );
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();
        fireEvent.change(screen.getByLabelText("Pause reason"), { target: { value: "Review" } });
        expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(false);
        await act(async () => streams[0]!.disconnect());
        expect(carrierFailure).toHaveBeenCalledOnce();
        expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(true);
        expect(screen.getByLabelText("Meeting summary").textContent).toContain("Meeting version2");
        hold = true;
        await act(async () => streams[0]!.reconnect());
        expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(true);
        await act(async () =>
            detailRead.resolve(remoteResult(success(statusResult("running", 4), 4)))
        );
        await waitFor(() =>
            expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(false)
        );
        expect(screen.getByLabelText("Meeting summary").textContent).toContain("Meeting version4");
    });

    it("coalesces focus while disposing and creates only one replacement stream", async () => {
        setRpc(async (method) =>
            remoteResult(method === "list" ? listResponse() : success(statusResult()))
        );
        const open = vi.spyOn(api, "openUpdates");
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();
        const stream = streams[0]!.stream;
        const dispose = stream.dispose.bind(stream);
        const released = deferred<void>();
        const spy = vi.spyOn(stream, "dispose").mockImplementation(async () => {
            await released.promise;
            await dispose();
        });
        for (let i = 0; i < 3; i++) fireEvent.focus(window);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(open).toHaveBeenCalledTimes(1);
        await act(async () => released.resolve());
        await waitFor(() => expect(open).toHaveBeenCalledTimes(2));
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });

    it("does not perform periodic reads and closes its stream on unmount", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const mock = vi.fn<Rpc>(async (method) =>
            remoteResult(method === "list" ? listResponse() : success(statusResult()))
        );
        setRpc(mock);
        const panel = render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();
        const count = mock.mock.calls.length;
        await act(async () => vi.advanceTimersByTime(15_000));
        expect(mock).toHaveBeenCalledTimes(count);
        panel.unmount();
        expect(streams[0]!.stream.signal.aborted).toBe(true);
        await act(async () => streams[0]!.push());
        expect(mock).toHaveBeenCalledTimes(count);
    });

    it("invalidates pre-frame reads and waits for both fresh projections", async () => {
        api.openUpdates = (unavailable) => {
            const fixture = createControlledMeetingStream(unavailable, false);
            streams.push(fixture);
            return fixture.stream;
        };
        const oldDetail = deferred<RemoteResult<unknown>>();
        const newList = deferred<RemoteResult<unknown>>();
        const newDetail = deferred<RemoteResult<unknown>>();
        let firstFrame = false;
        const mock = vi.fn<Rpc>(async (method) => {
            if (method === "list")
                return firstFrame ? newList.promise : remoteResult(listResponse());
            return firstFrame ? newDetail.promise : oldDetail.promise;
        });
        setRpc(mock);
        render(createElement(ConviviumMeetingPanel, { api }));
        fireEvent.click(screen.getByLabelText("Reload meetings"));
        fireEvent.click(await screen.findByRole("button", { name: /Runtime smoke/ }));
        await waitFor(() =>
            expect(mock.mock.calls.some(([method]) => method === "getStatus")).toBe(true)
        );
        firstFrame = true;
        await act(async () => streams[0]!.push());
        await act(async () =>
            oldDetail.resolve(remoteResult(success(statusResult("running", 3), 3)))
        );
        expect(screen.queryByLabelText("Meeting summary")).toBeNull();
        await act(async () => newList.resolve(remoteResult(listResponse())));
        expect(screen.queryByLabelText("Meeting summary")).toBeNull();
        await act(async () =>
            newDetail.resolve(remoteResult(success(statusResult("running", 4), 4)))
        );
        fireEvent.change(await screen.findByLabelText("Pause reason"), {
            target: { value: "Review" }
        });
        await waitFor(() =>
            expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(false)
        );
        expect(screen.getByLabelText("Meeting summary").textContent).toContain("Meeting version4");
    });
});

describe("meeting panel selection and write lifecycle", () => {
    it("coalesces refresh requests during an active read into one following cycle", async () => {
        const pending = deferred<RemoteResult<unknown>>();
        const mock = vi.fn<Rpc>(async (method) =>
            remoteResult(method === "list" ? listResponse() : success(statusResult()))
        );
        setRpc(mock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();
        mock.mockClear();
        mock.mockImplementationOnce(() => pending.promise);
        fireEvent.click(screen.getByLabelText("Reload meetings"));
        for (let i = 0; i < 3; i++) fireEvent.click(screen.getByLabelText("Reload meetings"));
        expect(mock).toHaveBeenCalledTimes(2);
        await act(async () => pending.resolve(remoteResult(listResponse())));
        await waitFor(() => expect(mock).toHaveBeenCalledTimes(4));
        expect(mock.mock.calls.filter(([method]) => method === "getStatus")).toHaveLength(2);
    });

    it("ignores a read invalidated by a write and shows the post-write version", async () => {
        const pending = deferred<RemoteResult<unknown>>();
        let hold = false;
        let version = 2;
        const mock = vi.fn<Rpc>(async (method) => {
            if (method === "list") return remoteResult(listResponse());
            if (method === "getStatus")
                return hold
                    ? pending.promise
                    : remoteResult(success(statusResult("running", version), version));
            version = 4;
            hold = false;
            return remoteResult(success({ status: "paused", changed: true }, version));
        });
        setRpc(mock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();
        hold = true;
        fireEvent.click(screen.getByLabelText("Reload meetings"));
        fireEvent.change(screen.getByLabelText("Pause reason"), { target: { value: "Review" } });
        fireEvent.click(screen.getByLabelText("Pause meeting"));
        await act(async () =>
            pending.resolve(remoteResult(success(statusResult("running", 3), 3)))
        );
        await waitFor(() =>
            expect(screen.getByLabelText("Meeting summary").textContent).toContain(
                "Meeting version4"
            )
        );
        expect(mock.mock.calls.filter(([method]) => method === "pause")).toHaveLength(1);
    });

    it("keeps the new selection when a previous detail resolves late", async () => {
        const pending = deferred<RemoteResult<unknown>>();
        const other = { ...listItem, meetingId: "meeting/2", topic: "Second meeting" };
        setRpc(async (method, options) => {
            if (method === "list") return remoteResult(listResponse([listItem, other]));
            const input = options.input;
            if (
                input &&
                typeof input === "object" &&
                "meetingId" in input &&
                input.meetingId === meetingId
            )
                return pending.promise;
            return remoteResult({
                ...success({ ...statusResult(), meetingId: other.meetingId, topic: other.topic }),
                meetingId: other.meetingId
            });
        });
        render(createElement(ConviviumMeetingPanel, { api }));
        fireEvent.click(await screen.findByRole("button", { name: /Runtime smoke/ }));
        fireEvent.click(screen.getByRole("button", { name: /Second meeting/ }));
        await act(async () => pending.resolve(remoteResult(success(statusResult()))));
        await waitFor(() =>
            expect(screen.getByLabelText("Meeting summary").textContent).toContain("Second meeting")
        );
        expect(screen.getByLabelText("Meeting summary").textContent).not.toContain("Runtime smoke");
    });

    it("keeps writes exclusive and refetches status after a successful write", async () => {
        const post = deferred<RemoteResult<unknown>>();
        const pausedListItem = { ...listItem, status: "paused" as const, meetingVersion: 3 };
        const rpcMock = vi
            .fn<Rpc>()
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult())))
            .mockImplementationOnce(() => post.promise)
            .mockResolvedValueOnce(remoteResult(listResponse([pausedListItem])))
            .mockResolvedValueOnce(remoteResult(success(statusResult("paused", 3), 3)));
        setRpc(rpcMock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();

        fireEvent.change(screen.getByLabelText("Pause reason"), {
            target: { value: "Inspect output" }
        });
        fireEvent.click(screen.getByLabelText("Pause meeting"));
        expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(true);
        expect(rpcMock).toHaveBeenCalledTimes(4);

        window.dispatchEvent(new Event("focus"));
        await act(async () => Promise.resolve());
        expect(rpcMock).toHaveBeenCalledTimes(4);

        await act(async () => {
            post.resolve(remoteResult(success({ status: "paused", changed: true }, 3)));
            await post.promise;
        });
        await screen.findByText("paused");
        expect(rpcMock).toHaveBeenCalledTimes(6);
        expect(screen.getByRole("button", { name: /Runtime smoke \(paused\)/ })).toBeTruthy();
        expect(rpcMock.mock.calls.filter((call) => isWrite(call[0]))).toHaveLength(1);
        expect(rpcMock.mock.calls[3]?.[1]?.input).toEqual({
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: 2,
            requestId: "request-1",
            reason: "Inspect output"
        });
    });

    it("limits End outcomes and posts the fixed empty completion fields", async () => {
        const rpcMock = vi
            .fn<Rpc>()
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult("converging", 2))))
            .mockResolvedValueOnce(
                remoteResult(
                    success({ status: "no_consensus", terminationCode: "no_consensus" }, 3)
                )
            )
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(terminalStatusResult()));
        setRpc(rpcMock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();

        expectSelectedEndOutcome("Partial");
        expect(screen.queryByRole("radio", { name: "Completed" })).toBeNull();
        fireEvent.click(screen.getByRole("radio", { name: "No consensus", exact: true }));
        expectSelectedEndOutcome("No consensus");
        expect(rpcMock.mock.calls.filter(([method]) => isWrite(method))).toHaveLength(0);
        fireEvent.change(screen.getByLabelText("End reason"), {
            target: { value: "No consensus reached" }
        });
        fireEvent.click(screen.getByLabelText("End meeting"));
        await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(6));
        expect(rpcMock.mock.calls[3]?.[0]).toBe("end");
        expect(rpcMock.mock.calls[3]?.[1]?.input).toEqual({
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

    it("keeps one End outcome selected through keyboard navigation", async () => {
        const rpcMock = vi
            .fn<Rpc>()
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult())));
        setRpc(rpcMock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();
        let selected = expectSelectedEndOutcome("Partial");
        selected.focus();
        for (const [key, name] of [
            ["ArrowRight", "No consensus"],
            ["ArrowDown", "Cancelled"],
            ["ArrowRight", "Partial"],
            ["ArrowLeft", "Cancelled"],
            ["ArrowUp", "No consensus"],
            ["Home", "Partial"],
            ["End", "Cancelled"],
            ["Home", "Partial"]
        ] as const) {
            expect(fireEvent.keyDown(selected, { key })).toBe(false);
            selected = expectSelectedEndOutcome(name);
            expect(document.activeElement).toBe(selected);
        }
        expect(fireEvent.keyDown(selected, { key: "Tab" })).toBe(true);
        fireEvent.click(selected);
        expectSelectedEndOutcome("Partial");
        expect(rpcMock.mock.calls.filter(([method]) => isWrite(method))).toHaveLength(0);
    });

    it("resets End outcome when selecting another meeting", async () => {
        const secondId = "meeting/2";
        const secondDetail = {
            ...statusResult(),
            meetingId: secondId,
            topic: "Second meeting"
        };
        const rpcMock = vi.fn<Rpc>(async (method, options) => {
            if (method === "list")
                return remoteResult(
                    listResponse([
                        listItem,
                        { ...listItem, meetingId: secondId, topic: "Second meeting" }
                    ])
                );
            const input = options.input;
            return remoteResult(
                input &&
                    typeof input === "object" &&
                    "meetingId" in input &&
                    input.meetingId === secondId
                    ? { ...success(secondDetail), meetingId: secondId }
                    : success(statusResult())
            );
        });
        setRpc(rpcMock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();
        fireEvent.click(screen.getByRole("radio", { name: "Cancelled", exact: true }));
        expectSelectedEndOutcome("Cancelled");
        fireEvent.click(
            screen.getByRole("button", { name: "Second meeting (running)", exact: true })
        );
        await waitFor(() =>
            expect(screen.getByLabelText("Meeting summary").textContent).toContain("Second meeting")
        );
        expectSelectedEndOutcome("Partial");
        expect(rpcMock.mock.calls.at(-1)?.[1]?.input).toEqual({
            protocolVersion: 1,
            meetingId: secondId
        });
        expect(rpcMock.mock.calls.filter(([method]) => isWrite(method))).toHaveLength(0);
    });
});

describe("meeting panel terminal controls and failures", () => {
    it.each(["list", "detail"] as const)(
        "locks End outcome for cached %s and unlocks after a valid refresh",
        async (source) => {
            const rpcMock = vi
                .fn<Rpc>()
                .mockResolvedValueOnce(remoteResult(listResponse()))
                .mockResolvedValueOnce(remoteResult(listResponse()))
                .mockResolvedValueOnce(remoteResult(success(statusResult())));
            setRpc(rpcMock);
            render(createElement(ConviviumMeetingPanel, { api }));
            await selectMeeting();
            fireEvent.click(screen.getByRole("radio", { name: "No consensus", exact: true }));
            if (source === "detail") rpcMock.mockResolvedValueOnce(remoteResult(listResponse()));
            rpcMock.mockRejectedValueOnce(new TypeError("cached " + source));
            if (source === "list") fireEvent.click(screen.getByLabelText("Reload meetings"));
            else fireEvent.focus(window);
            await waitFor(() =>
                expect(screen.getByRole(source === "list" ? "status" : "alert")).toBeTruthy()
            );
            const selected = expectSelectedEndOutcome("No consensus");
            for (const radio of screen.getAllByRole("radio") as HTMLButtonElement[]) {
                expect(radio.disabled).toBe(true);
            }
            fireEvent.click(screen.getByRole("radio", { name: "Cancelled", exact: true }));
            fireEvent.keyDown(selected, { key: "ArrowRight" });
            expectSelectedEndOutcome("No consensus");
            rpcMock.mockResolvedValueOnce(remoteResult(listResponse()));
            rpcMock.mockResolvedValueOnce(remoteResult(success(statusResult("running", 3), 3)));
            if (source === "detail") fireEvent.focus(window);
            else fireEvent.click(screen.getByLabelText("Reload meetings"));
            await waitFor(() => {
                for (const radio of screen.getAllByRole("radio") as HTMLButtonElement[]) {
                    expect(radio.disabled).toBe(false);
                }
            });
            expectSelectedEndOutcome("No consensus");
            expect(rpcMock.mock.calls.filter(([method]) => isWrite(method))).toHaveLength(0);
        }
    );

    it("locks End outcome during a pending write and does not duplicate the POST", async () => {
        const reply = deferred<RemoteResult<unknown>>();
        const rpcMock = vi
            .fn<Rpc>()
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult())))
            .mockReturnValueOnce(reply.promise)
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult("running", 3), 3)));
        setRpc(rpcMock);
        const rendered = render(createElement(ConviviumMeetingPanel, { api }));
        try {
            await selectMeeting();
            fireEvent.change(screen.getByLabelText("End reason"), {
                target: { value: "Reviewed" }
            });
            const end = screen.getByLabelText("End meeting");
            act(() => {
                fireEvent.click(end);
                fireEvent.click(end);
            });
            const selected = expectSelectedEndOutcome("Partial");
            for (const radio of screen.getAllByRole("radio") as HTMLButtonElement[]) {
                expect(radio.disabled).toBe(true);
            }
            fireEvent.click(screen.getByRole("radio", { name: "Cancelled", exact: true }));
            fireEvent.keyDown(selected, { key: "End" });
            expectSelectedEndOutcome("Partial");
            expect(rpcMock.mock.calls.filter(([method]) => isWrite(method))).toHaveLength(1);
            await act(async () => {
                reply.resolve(remoteResult(protocolError("Safe conflict")));
            });
            await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(6));
            await waitFor(() => expect(expectSelectedEndOutcome("Partial").disabled).toBe(false));
            expect(rpcMock.mock.calls.filter(([method]) => isWrite(method))).toHaveLength(1);
        } finally {
            reply.resolve(remoteResult(protocolError("Safe conflict")));
            rendered.unmount();
        }
    });

    it("refetches after a validated protocol error without retrying the write", async () => {
        const rpcMock = vi
            .fn<Rpc>()
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult())))
            .mockResolvedValueOnce(remoteResult(protocolError("Safe conflict")))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult("running", 3), 3)));
        setRpc(rpcMock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();

        fireEvent.change(screen.getByLabelText("Pause reason"), { target: { value: "Reason" } });
        fireEvent.click(screen.getByLabelText("Pause meeting"));

        await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(6));
        expect(rpcMock.mock.calls.filter((call) => isWrite(call[0]))).toHaveLength(1);
        await waitFor(() =>
            expect(screen.getByLabelText("Meeting summary").textContent).toContain("3")
        );
        expect(screen.queryByText("Safe conflict")).toBeNull();
    });

    it("does not retry a transport-failed write and keeps the projection read-only", async () => {
        const rpcMock = vi
            .fn<Rpc>()
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult())))
            .mockRejectedValueOnce(new TypeError("network write"));
        setRpc(rpcMock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();

        fireEvent.change(screen.getByLabelText("Pause reason"), { target: { value: "Reason" } });
        fireEvent.click(screen.getByLabelText("Pause meeting"));

        await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
        expect(rpcMock).toHaveBeenCalledTimes(4);
        expect(rpcMock.mock.calls.filter((call) => isWrite(call[0]))).toHaveLength(1);
        expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(true);
        expect(screen.getByLabelText("Meeting summary").textContent).toContain("2");
    });

    it("does not expose controls for a terminal projection", async () => {
        const rpcMock = vi
            .fn<Rpc>()
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(terminalStatusResult(), 5)));
        setRpc(rpcMock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();

        expect(screen.getByLabelText("Meeting summary").textContent).toContain("completed");
        expect(screen.queryByLabelText("Pause meeting")).toBeNull();
        expect(screen.queryByLabelText("Resume meeting")).toBeNull();
        expect(screen.queryByLabelText("Skip current speaker")).toBeNull();
        expect(screen.queryByLabelText("End meeting")).toBeNull();
    });

    it("disables meeting writes when the list projection becomes cached", async () => {
        const rpcMock = vi
            .fn<Rpc>()
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult())))
            .mockRejectedValueOnce(new TypeError("network list"));
        setRpc(rpcMock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();

        fireEvent.click(screen.getByLabelText("Reload meetings"));

        await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
        expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(true);
    });

    it("preserves cached data on failures, refreshes on notice, and aborts on unmount", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const rpcMock = vi
            .fn<Rpc>()
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult())))
            .mockRejectedValueOnce(new TypeError("network list"))
            .mockRejectedValueOnce(new TypeError("network detail"))
            .mockRejectedValueOnce(new TypeError("network list"))
            .mockRejectedValueOnce(new TypeError("network detail"))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult("running", 4), 4)));
        setRpc(rpcMock);
        const rendered = render(createElement(ConviviumMeetingPanel, { api }));
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

        await act(async () => streams.at(-1)!.push());
        await waitFor(() =>
            expect(screen.getByLabelText("Meeting summary").textContent).toContain("4")
        );
        const lastSignal = rpcMock.mock.calls.at(-1)?.[1]?.signal;
        rendered.unmount();
        expect(lastSignal?.aborted).toBe(true);
    });
});
