import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProtocolFailure, type MeetingClient } from "@/client/meeting-client.js";
import { renderMeetingPanelLayout } from "@/client/meeting-panel-layout.js";
import { renderObservabilitySections } from "@/client/meeting-panel-sections.js";
import { ConviviumMeetingPanel } from "@/client/meeting-panel.js";
import type { MeetingView } from "@/protocol/index.js";
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

    it("localizes projection labels while preserving authored content", () => {
        const { view } = meetingProjectionFixture();
        const authoredObjective = view.objective.statement;
        const authoredAgenda = view.agenda.find((item) => item.status === "active")?.title;
        const authoredMessage = view.messages.at(0)?.body;
        const archive = {
            status: "complete",
            publicSnapshotVersion: 7,
            messages: []
        } as unknown as NonNullable<MeetingView["archive"]>;
        const round = {
            id: "round-1",
            status: "open",
            contributions: []
        } as unknown as MeetingView["rounds"][number];
        const archivedView = { ...view, archive, rounds: [round] };

        const { rerender } = render(
            renderObservabilitySections(archivedView, meetingTranslator("zh"))
        );
        expect(screen.getByLabelText("会议摘要")).toBeTruthy();
        expect(screen.getByText("进行中")).toBeTruthy();
        expect(screen.getByText("证据与审核")).toBeTruthy();
        expect(screen.getByText("round-1：开放（0 个贡献）")).toBeTruthy();
        expect(screen.getByText("已完成")).toBeTruthy();
        expect(screen.getByText(authoredObjective)).toBeTruthy();
        if (authoredAgenda !== undefined) expect(screen.getByText(authoredAgenda)).toBeTruthy();
        if (authoredMessage !== undefined) expect(screen.getByText(authoredMessage)).toBeTruthy();

        rerender(renderObservabilitySections(archivedView, meetingTranslator("en")));
        expect(screen.getByLabelText("Meeting summary")).toBeTruthy();
        expect(screen.getByText("Running")).toBeTruthy();
        expect(screen.getByText("Evidence and reviews")).toBeTruthy();
        expect(screen.getByText("round-1: Open (0 contributions)")).toBeTruthy();
        expect(screen.getByText("Complete")).toBeTruthy();
        expect(screen.getByText(authoredObjective)).toBeTruthy();
        if (authoredAgenda !== undefined) expect(screen.getByText(authoredAgenda)).toBeTruthy();
        if (authoredMessage !== undefined) expect(screen.getByText(authoredMessage)).toBeTruthy();
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
});
