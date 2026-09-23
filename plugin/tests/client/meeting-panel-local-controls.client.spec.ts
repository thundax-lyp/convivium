import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeetingClient } from "@/client/meeting-client.js";
import { ConviviumMeetingPanel } from "@/client/meeting-panel.js";
import { meetingProjectionFixture } from "./meeting-panel-fixtures.js";
import { meetingTranslator } from "./meeting-panel-locale-fixtures.js";

afterEach(cleanup);
beforeEach(() => vi.stubGlobal("crypto", { randomUUID: () => "request-local" }));

describe("Meeting panel local controls", () => {
    it.each([
        {
            label: "Pause meeting",
            kind: "pause_meeting" as const,
            reason: "Paused from Meeting panel.",
            status: "running" as const,
            controls: ["pause_meeting", "end_meeting"] as const
        },
        {
            label: "Resume meeting",
            kind: "resume_meeting" as const,
            reason: "Resumed from Meeting panel.",
            status: "paused" as const,
            controls: ["resume_meeting", "end_meeting"] as const
        }
    ])("uses the current projection version and rereads after $kind", async (scenario) => {
        const { summary, view } = meetingProjectionFixture();
        const currentView = {
            ...view,
            lifecycle: { ...view.lifecycle, status: scenario.status },
            controls: [...scenario.controls]
        };
        const stream = {
            async *[Symbol.asyncIterator]() {
                await new Promise<void>(() => {});
                yield undefined as never;
            },
            dispose: vi.fn(async () => {})
        };
        const api = {
            list: vi.fn(async () => ({ meetings: [summary] })),
            read: vi.fn(async () => currentView),
            control: vi.fn(async () => ({ kind: "accepted" as const })),
            subscribeRefresh: vi.fn(() => stream)
        } as unknown as MeetingClient;
        render(createElement(ConviviumMeetingPanel, { api, t: meetingTranslator("en") }));
        fireEvent.click(await screen.findByRole("button", { name: /核对议题 A/ }));
        fireEvent.click(await screen.findByRole("button", { name: scenario.label }));
        await waitFor(() => expect(api.control).toHaveBeenCalledOnce());
        expect(api.control).toHaveBeenCalledWith({
            protocolVersion: 1,
            meetingId: summary.meetingId,
            expectedMeetingVersion: currentView.version,
            requestId: "request-local",
            action: { kind: scenario.kind, reason: scenario.reason }
        });
        await waitFor(() => expect(api.read).toHaveBeenCalledTimes(2));
    });

    it("uses the current projection version and rereads after end_meeting", async () => {
        const { summary, view } = meetingProjectionFixture();
        const stream = {
            async *[Symbol.asyncIterator]() {
                await new Promise<void>(() => {});
                yield undefined as never;
            },
            dispose: vi.fn(async () => {})
        };
        const api = {
            list: vi.fn(async () => ({ meetings: [summary] })),
            read: vi.fn(async () => view),
            control: vi.fn(async () => ({
                kind: "rejected" as const,
                error: { code: "CONFLICT", message: "stale" }
            })),
            subscribeRefresh: vi.fn(() => stream)
        } as unknown as MeetingClient;
        render(createElement(ConviviumMeetingPanel, { api, t: meetingTranslator("en") }));
        fireEvent.click(await screen.findByRole("button", { name: /核对议题 A/ }));
        const end = await screen.findByRole("button", { name: "End meeting" });
        fireEvent.click(end);
        await waitFor(() => expect(api.control).toHaveBeenCalledOnce());
        expect(api.control).toHaveBeenCalledWith({
            protocolVersion: 1,
            meetingId: summary.meetingId,
            expectedMeetingVersion: view.version,
            requestId: "request-local",
            action: {
                kind: "end_meeting",
                outcome: "partial",
                reason: "Ended from Meeting panel.",
                decisionIds: [],
                completionFactIds: [],
                unresolvedQuestionIds: [],
                unresolvedIssueIds: []
            }
        });
        await waitFor(() => expect(api.read).toHaveBeenCalledTimes(2));
    });

    it("disables lifecycle controls while an end command is pending", async () => {
        const { summary, view } = meetingProjectionFixture();
        let acceptControl: () => void = () => {};
        const controlPending = new Promise<{ kind: "accepted" }>((resolve) => {
            acceptControl = () => resolve({ kind: "accepted" });
        });
        const stream = {
            async *[Symbol.asyncIterator]() {
                await new Promise<void>(() => {});
                yield undefined as never;
            },
            dispose: vi.fn(async () => {})
        };
        const api = {
            list: vi.fn(async () => ({ meetings: [summary] })),
            read: vi.fn(async () => view),
            control: vi.fn(() => controlPending),
            subscribeRefresh: vi.fn(() => stream)
        } as unknown as MeetingClient;
        render(createElement(ConviviumMeetingPanel, { api, t: meetingTranslator("en") }));
        fireEvent.click(await screen.findByRole("button", { name: /核对议题 A/ }));
        const end = await screen.findByRole("button", { name: "End meeting" });
        fireEvent.click(end);
        await waitFor(() => expect(api.control).toHaveBeenCalledOnce());
        expect(end.disabled).toBe(true);
        expect(screen.getByRole("button", { name: "Pause meeting" }).disabled).toBe(true);
        acceptControl();
        await waitFor(() => expect(api.read).toHaveBeenCalledTimes(2));
    });
});
