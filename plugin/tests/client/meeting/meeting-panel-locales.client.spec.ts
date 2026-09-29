import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProtocolFailure, type MeetingClient } from "@/client/meeting/client.ts";
import { MeetingTranslationProvider } from "@/client/meeting/hooks/index.ts";
import { ConviviumMeetingPanel } from "@/client/meeting/panel.tsx";
import { MeetingPanelOverview } from "@/client/meeting/regions/workspace/overview/index.ts";
import type { MeetingTranslate } from "@/client/meeting/shared/index.ts";
import { meetingProjectionFixture } from "./meeting-panel-fixtures.ts";
import {
    meetingTranslator,
    translatedLayout as renderMeetingPanelLayout,
    translatedPanel,
    withMeetingTranslation
} from "./meeting-panel-locale-fixtures.ts";

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
            listLoading: false,
            listCached: false,
            detailCached: false,
            writePending: false,
            requestRefresh: vi.fn(),
            selectMeeting: vi.fn(),
            pauseMeeting: vi.fn(async () => {}),
            resumeMeeting: vi.fn(async () => {}),
            endMeeting: vi.fn(async () => {})
        },
        locale
    );
}

describe("Meeting panel localized presentation", () => {
    it("localizes known objective statuses and risk levels while preserving authored text", () => {
        const { view } = meetingProjectionFixture();
        const { rerender } = render(
            withMeetingTranslation(createElement(MeetingPanelOverview, { detail: view }), "zh")
        );
        expect(screen.getByText("形成公开证据: 待处理")).toBeTruthy();
        expect(screen.getByText("低")).toBeTruthy();

        rerender(
            withMeetingTranslation(createElement(MeetingPanelOverview, { detail: view }), "en")
        );
        expect(screen.getByText("形成公开证据: Pending")).toBeTruthy();
        expect(screen.getByText("Low")).toBeTruthy();
    });

    it("renders the panel shell in Chinese and English", () => {
        const { rerender } = render(emptyLayout("zh"));
        expect(screen.getByLabelText("Convivium 会议")).toBeTruthy();
        expect(screen.queryByRole("heading", { name: "会议", exact: true })).toBeNull();
        expect(screen.getByRole("heading", { name: "会议导航" })).toBeTruthy();
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
                    listLoading: false,
                    listCached: false,
                    detailCached: false,
                    writePending: false,
                    requestRefresh: vi.fn(),
                    selectMeeting: vi.fn(),
                    pauseMeeting: vi.fn(async () => {}),
                    resumeMeeting: vi.fn(async () => {}),
                    endMeeting: vi.fn(async () => {})
                },
                "zh"
            )
        );
        expect(screen.getByRole("button", { name: "暂停会议" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "异常取消会议" })).toBeTruthy();
        expect(screen.getByLabelText(`会议 ${summary.meetingId}`)).toBeTruthy();

        rerender(
            renderMeetingPanelLayout(
                {
                    meetings: [summary],
                    selectedId: summary.meetingId,
                    detail: { ...view, controls: ["resume_meeting"] },
                    listLoading: false,
                    listCached: false,
                    detailCached: false,
                    writePending: false,
                    requestRefresh: vi.fn(),
                    selectMeeting: vi.fn(),
                    pauseMeeting: vi.fn(async () => {}),
                    resumeMeeting: vi.fn(async () => {}),
                    endMeeting: vi.fn(async () => {})
                },
                "zh"
            )
        );
        expect(screen.getByRole("button", { name: "继续会议" })).toBeTruthy();

        rerender(
            renderMeetingPanelLayout(
                {
                    meetings: [summary],
                    selectedId: summary.meetingId,
                    listLoading: false,
                    listCached: false,
                    detailCached: true,
                    writePending: false,
                    requestRefresh: vi.fn(),
                    selectMeeting: vi.fn(),
                    pauseMeeting: vi.fn(async () => {}),
                    resumeMeeting: vi.fn(async () => {}),
                    endMeeting: vi.fn(async () => {})
                },
                "zh"
            )
        );
        expect(screen.getByText("正在加载会议。")).toBeTruthy();

        rerender(
            renderMeetingPanelLayout(
                {
                    meetings: [summary],
                    selectedId: summary.meetingId,
                    listLoading: false,
                    listCached: false,
                    detailCached: false,
                    writePending: false,
                    requestRefresh: vi.fn(),
                    selectMeeting: vi.fn(),
                    pauseMeeting: vi.fn(async () => {}),
                    resumeMeeting: vi.fn(async () => {}),
                    endMeeting: vi.fn(async () => {})
                },
                "zh"
            )
        );
        expect(screen.getByText("无会议详情。")).toBeTruthy();

        rerender(emptyLayout("en"));
        expect(screen.getByLabelText("Convivium meetings")).toBeTruthy();
        expect(screen.queryByRole("heading", { name: "Meetings", exact: true })).toBeNull();
        expect(screen.getByRole("heading", { name: "Meeting navigator" })).toBeTruthy();
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
        let activeLocale: "zh" | "en" = "zh";
        const seat = ((key: never, params: never) =>
            meetingTranslator(activeLocale)(key, params)) as MeetingTranslate;
        const panel = () =>
            createElement(
                MeetingTranslationProvider,
                { t: seat },
                createElement(ConviviumMeetingPanel, { api: protocolApi })
            );
        const { rerender, unmount } = render(panel());
        expect((await screen.findByRole("alert")).textContent).toBe("会议请求失败（CONFLICT）。");
        expect(screen.queryByText("stale server detail")).toBeNull();
        activeLocale = "en";
        rerender(panel());
        expect(screen.getByRole("alert").textContent).toBe("Meeting request failed (CONFLICT).");
        expect(protocolApi.list).toHaveBeenCalledOnce();
        unmount();

        const unavailableApi = {
            list: vi.fn(async () => {
                throw new Error("network down");
            }),
            subscribeRefresh: vi.fn(inertStream)
        } as unknown as MeetingClient;
        const unavailable = render(translatedPanel({ api: unavailableApi }, "zh"));
        expect((await screen.findByRole("alert")).textContent).toBe("会议数据不可用。");
        unavailable.rerender(translatedPanel({ api: unavailableApi }, "en"));
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
        render(translatedPanel({ api }, "zh"));

        fireEvent.click(
            await screen.findByRole("button", { name: `${summary.objective} (进行中)` })
        );

        expect((await screen.findByRole("alert")).textContent).toBe("会议请求失败（CONFLICT）。");
        expect(screen.queryByText("正在加载会议。")).toBeNull();
    });
});
