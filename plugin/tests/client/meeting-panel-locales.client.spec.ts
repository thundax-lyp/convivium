import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProtocolFailure, type MeetingClient } from "@/client/meeting-client.js";
import { renderMeetingPanelLayout } from "@/client/meeting-panel-layout.js";
import { MeetingPanelOverview } from "@/client/meeting-panel-overview.js";
import { ConviviumMeetingPanel } from "@/client/meeting-panel.js";
import { meetingProjectionFixture } from "./meeting-panel-fixtures.js";
import { meetingTranslator } from "./meeting-panel-locale-fixtures.js";

afterEach(cleanup);

function inertStream() {
    return {
        async *[Symbol.asyncIterator]() {
            await new Promise<void>(() => {});
            yield undefined as never;
        },
        dispose: vi.fn(async () => {})
    };
}

function emptyLayout(locale: "zh" | "en") {
    return renderMeetingPanelLayout(
        {
            meetings: [],
            listCached: false,
            detailCached: false,
            writePending: false,
            requestRefresh: vi.fn(),
            selectMeeting: vi.fn(),
            pauseMeeting: vi.fn(async () => {}),
            resumeMeeting: vi.fn(async () => {}),
            endMeeting: vi.fn(async () => {})
        },
        meetingTranslator(locale)
    );
}

describe("Meeting panel localized presentation", () => {
    it("localizes known objective statuses and risk levels while preserving authored text", () => {
        const { view } = meetingProjectionFixture();
        const { rerender } = render(
            createElement(MeetingPanelOverview, { detail: view, t: meetingTranslator("zh") })
        );
        expect(screen.getByText("形成公开证据: 待处理")).toBeTruthy();
        expect(screen.getByText("低")).toBeTruthy();

        rerender(createElement(MeetingPanelOverview, { detail: view, t: meetingTranslator("en") }));
        expect(screen.getByText("形成公开证据: Pending")).toBeTruthy();
        expect(screen.getByText("Low")).toBeTruthy();
    });

    it("renders the panel shell in Chinese and English", () => {
        const { rerender } = render(emptyLayout("zh"));
        expect(screen.getByLabelText("Convivium 会议")).toBeTruthy();
        expect(screen.getByRole("heading", { name: "会议" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "刷新" })).toBeTruthy();
        expect(screen.getByLabelText("会议列表")).toBeTruthy();
        expect(screen.getByText("请选择一个会议。")).toBeTruthy();

        const { summary, view } = meetingProjectionFixture();
        rerender(
            renderMeetingPanelLayout(
                {
                    meetings: [summary],
                    selectedId: summary.meetingId,
                    detail: view,
                    listCached: false,
                    detailCached: false,
                    writePending: false,
                    requestRefresh: vi.fn(),
                    selectMeeting: vi.fn(),
                    pauseMeeting: vi.fn(async () => {}),
                    resumeMeeting: vi.fn(async () => {}),
                    endMeeting: vi.fn(async () => {})
                },
                meetingTranslator("zh")
            )
        );
        expect(screen.getByRole("button", { name: "暂停会议" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "结束会议" })).toBeTruthy();
        expect(screen.getByLabelText(`会议 ${summary.meetingId}`)).toBeTruthy();

        rerender(
            renderMeetingPanelLayout(
                {
                    meetings: [summary],
                    selectedId: summary.meetingId,
                    detail: { ...view, controls: ["resume_meeting"] },
                    listCached: false,
                    detailCached: false,
                    writePending: false,
                    requestRefresh: vi.fn(),
                    selectMeeting: vi.fn(),
                    pauseMeeting: vi.fn(async () => {}),
                    resumeMeeting: vi.fn(async () => {}),
                    endMeeting: vi.fn(async () => {})
                },
                meetingTranslator("zh")
            )
        );
        expect(screen.getByRole("button", { name: "继续会议" })).toBeTruthy();

        rerender(
            renderMeetingPanelLayout(
                {
                    meetings: [summary],
                    selectedId: summary.meetingId,
                    listCached: false,
                    detailCached: true,
                    writePending: false,
                    requestRefresh: vi.fn(),
                    selectMeeting: vi.fn(),
                    pauseMeeting: vi.fn(async () => {}),
                    resumeMeeting: vi.fn(async () => {}),
                    endMeeting: vi.fn(async () => {})
                },
                meetingTranslator("zh")
            )
        );
        expect(screen.getByText("正在加载会议。")).toBeTruthy();

        rerender(
            renderMeetingPanelLayout(
                {
                    meetings: [summary],
                    selectedId: summary.meetingId,
                    listCached: false,
                    detailCached: false,
                    writePending: false,
                    requestRefresh: vi.fn(),
                    selectMeeting: vi.fn(),
                    pauseMeeting: vi.fn(async () => {}),
                    resumeMeeting: vi.fn(async () => {}),
                    endMeeting: vi.fn(async () => {})
                },
                meetingTranslator("zh")
            )
        );
        expect(screen.getByText("无会议详情。")).toBeTruthy();

        rerender(emptyLayout("en"));
        expect(screen.getByLabelText("Convivium meetings")).toBeTruthy();
        expect(screen.getByRole("heading", { name: "Meetings" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
        expect(screen.getByLabelText("Meeting list")).toBeTruthy();
        expect(screen.getByText("Select a meeting.")).toBeTruthy();
    });

    it("retranslates mounted errors without refreshing meeting data", async () => {
        const protocolApi = {
            list: vi.fn(async () => {
                throw new ProtocolFailure({
                    protocolVersion: 1,
                    ok: false,
                    code: "CONFLICT",
                    message: "stale server detail",
                    retryable: false
                });
            }),
            subscribeRefresh: vi.fn(inertStream)
        } as unknown as MeetingClient;
        const { rerender, unmount } = render(
            createElement(ConviviumMeetingPanel, {
                api: protocolApi,
                t: meetingTranslator("zh")
            })
        );
        expect((await screen.findByRole("alert")).textContent).toBe("会议请求失败（CONFLICT）。");
        expect(screen.queryByText("stale server detail")).toBeNull();
        rerender(
            createElement(ConviviumMeetingPanel, {
                api: protocolApi,
                t: meetingTranslator("en")
            })
        );
        expect(screen.getByRole("alert").textContent).toBe("Meeting request failed (CONFLICT).");
        expect(protocolApi.list).toHaveBeenCalledOnce();
        unmount();

        const unavailableApi = {
            list: vi.fn(async () => {
                throw new Error("network down");
            }),
            subscribeRefresh: vi.fn(inertStream)
        } as unknown as MeetingClient;
        const unavailable = render(
            createElement(ConviviumMeetingPanel, {
                api: unavailableApi,
                t: meetingTranslator("zh")
            })
        );
        expect((await screen.findByRole("alert")).textContent).toBe("会议数据不可用。");
        unavailable.rerender(
            createElement(ConviviumMeetingPanel, {
                api: unavailableApi,
                t: meetingTranslator("en")
            })
        );
        expect(screen.getByRole("alert").textContent).toBe("Meeting data is unavailable.");
        expect(unavailableApi.list).toHaveBeenCalledOnce();
    });

    it("shows the first detail-read failure instead of remaining in loading state", async () => {
        const { summary } = meetingProjectionFixture();
        const api = {
            list: vi.fn(async () => ({ meetings: [summary] })),
            read: vi.fn(async () => {
                throw new ProtocolFailure({
                    protocolVersion: 1,
                    ok: false,
                    code: "CONFLICT",
                    message: "stale detail",
                    retryable: false
                });
            }),
            subscribeRefresh: vi.fn(inertStream)
        } as unknown as MeetingClient;
        render(createElement(ConviviumMeetingPanel, { api, t: meetingTranslator("zh") }));

        fireEvent.click(
            await screen.findByRole("button", { name: `${summary.objective} (进行中)` })
        );

        expect((await screen.findByRole("alert")).textContent).toBe("会议请求失败（CONFLICT）。");
        expect(screen.queryByText("正在加载会议。")).toBeNull();
    });
});
