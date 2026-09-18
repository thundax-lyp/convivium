import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeetingClient } from "@/client/meeting-client.js";
import { ConviviumMeetingPanel } from "@/client/meeting-panel.js";
import { meetingProjectionFixture } from "./meeting-panel-v1-fixtures.js";

afterEach(cleanup);
beforeEach(() => vi.stubGlobal("crypto", { randomUUID: () => "request-local" }));

describe("Meeting panel local controls", () => {
    it("uses the current projection version and rereads after end_meeting", async () => {
        const { summary, view } = meetingProjectionFixture();
        const stream = {
            async *[Symbol.asyncIterator]() {
                await new Promise<void>(() => {});
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
        render(createElement(ConviviumMeetingPanel, { api }));
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
});
