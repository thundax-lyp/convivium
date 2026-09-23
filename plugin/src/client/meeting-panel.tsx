import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import type { MeetingCommand, MeetingSummary, MeetingView } from "@/protocol/index.js";
import type { MeetingTranslate } from "./locales.js";
import { ProtocolFailure, type MeetingClient } from "./meeting-client.js";
import { renderMeetingPanelLayout } from "./meeting-panel-layout.js";
import {
    INITIAL_FRESHNESS,
    INITIAL_WORKSPACE,
    resetWorkspaceForMeeting,
    type MeetingsFreshnessState,
    type MeetingsWorkspaceState
} from "./meeting-workspace-state.js";

type MeetingPanelFailure =
    { readonly kind: "protocol"; readonly code: string } | { readonly kind: "unavailable" };

function classifyFailure(error: unknown): MeetingPanelFailure {
    return error instanceof ProtocolFailure
        ? { kind: "protocol", code: error.protocolError.code }
        : { kind: "unavailable" };
}

function failureMessage(failure: MeetingPanelFailure, t: MeetingTranslate): string {
    return failure.kind === "protocol"
        ? t("panel.error.protocol", { code: failure.code })
        : t("panel.error.unavailable");
}

export function ConviviumMeetingPanel({
    api,
    t
}: {
    api: MeetingClient;
    t: MeetingTranslate;
}): ReactElement {
    const [meetings, setMeetings] = useState<readonly MeetingSummary[]>([]);
    const [workspace, setWorkspace] = useState<MeetingsWorkspaceState>(INITIAL_WORKSPACE);
    const [freshness, setFreshness] = useState<MeetingsFreshnessState>(INITIAL_FRESHNESS);
    const [detail, setDetail] = useState<MeetingView>();
    const [listFailure, setListFailure] = useState<MeetingPanelFailure>();
    const [detailFailure, setDetailFailure] = useState<MeetingPanelFailure>();
    const [writePending, setWritePending] = useState(false);
    const selectedRef = useRef<string>();

    const loadList = useCallback(async () => {
        try {
            const result = await api.list();
            const selectedMeetingId = selectedRef.current;
            setMeetings(result.meetings);
            setListFailure(undefined);
            if (
                selectedMeetingId !== undefined &&
                !result.meetings.some((meeting) => meeting.meetingId === selectedMeetingId)
            ) {
                selectedRef.current = undefined;
                setWorkspace((current) => ({
                    ...current,
                    selectedMeetingId: undefined,
                    focusTarget: undefined
                }));
                setDetail(undefined);
                setDetailFailure(undefined);
                setFreshness((current) => ({
                    connection:
                        current.connection === "connecting" ? "connected" : current.connection,
                    list: "fresh",
                    detail: "idle"
                }));
                return;
            }
            setFreshness((current) => ({
                ...current,
                connection: current.connection === "connecting" ? "connected" : current.connection,
                list: "fresh"
            }));
        } catch (error) {
            setListFailure(classifyFailure(error));
            setFreshness((current) => ({ ...current, list: "stale" }));
        }
    }, [api]);

    const loadDetail = useCallback(
        async (meetingId: string) => {
            try {
                const result = await api.read({ protocolVersion: 1, meetingId });
                if (selectedRef.current !== meetingId) return;
                setDetail(result);
                setDetailFailure(undefined);
                setFreshness((current) => ({ ...current, detail: "fresh" }));
            } catch (error) {
                if (selectedRef.current !== meetingId) return;
                setDetailFailure(classifyFailure(error));
                setFreshness((current) => ({ ...current, detail: "stale" }));
            }
        },
        [api]
    );

    const refresh = useCallback(() => {
        setFreshness((current) => ({
            ...current,
            list: "loading",
            detail: selectedRef.current === undefined ? "idle" : "loading"
        }));
        void loadList();
        if (selectedRef.current !== undefined) void loadDetail(selectedRef.current);
    }, [loadDetail, loadList]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    useEffect(() => {
        let stopped = false;
        const stream = api.subscribeRefresh(() => {
            if (!stopped) refresh();
        });
        void (async () => {
            try {
                for await (const item of stream) {
                    if (stopped) break;
                    item.accept();
                    refresh();
                }
            } catch {
                if (!stopped) refresh();
            }
        })();
        return () => {
            stopped = true;
            void stream.dispose();
        };
    }, [api, refresh]);

    const selectMeeting = useCallback(
        (meetingId: string) => {
            if (selectedRef.current === meetingId) return;
            selectedRef.current = meetingId;
            setWorkspace((current) =>
                resetWorkspaceForMeeting(meetingId, current.viewportRevision)
            );
            setDetail(undefined);
            setDetailFailure(undefined);
            setFreshness((current) => ({ ...current, detail: "loading" }));
            void loadDetail(meetingId);
        },
        [loadDetail]
    );

    const endMeeting = useCallback(async () => {
        const current = detail;
        const meetingId = selectedRef.current;
        if (current === undefined || meetingId === undefined || writePending) return;
        const command: MeetingCommand = {
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: current.version,
            requestId: crypto.randomUUID(),
            action: {
                kind: "end_meeting",
                outcome: "partial",
                reason: "Ended from Meeting panel.",
                decisionIds: [],
                completionFactIds: [],
                unresolvedQuestionIds: [],
                unresolvedIssueIds: []
            }
        };
        setWritePending(true);
        setFreshness((current) => ({ ...current, detail: "loading" }));
        setDetailFailure(undefined);
        try {
            await api.control(command);
            await loadDetail(meetingId);
            await loadList();
        } catch (error) {
            setDetailFailure(classifyFailure(error));
        } finally {
            setWritePending(false);
        }
    }, [api, detail, loadDetail, loadList, writePending]);

    const changePause = useCallback(
        async (kind: "pause_meeting" | "resume_meeting") => {
            const current = detail;
            const meetingId = selectedRef.current;
            if (current === undefined || meetingId === undefined || writePending) return;
            setWritePending(true);
            setFreshness((current) => ({ ...current, detail: "loading" }));
            setDetailFailure(undefined);
            try {
                await api.control({
                    protocolVersion: 1,
                    meetingId,
                    expectedMeetingVersion: current.version,
                    requestId: crypto.randomUUID(),
                    action: {
                        kind,
                        reason:
                            kind === "pause_meeting"
                                ? "Paused from Meeting panel."
                                : "Resumed from Meeting panel."
                    }
                });
                await loadDetail(meetingId);
                await loadList();
            } catch (error) {
                setDetailFailure(classifyFailure(error));
            } finally {
                setWritePending(false);
            }
        },
        [api, detail, loadDetail, loadList, writePending]
    );

    return renderMeetingPanelLayout(
        {
            meetings,
            selectedId: workspace.selectedMeetingId,
            detail,
            listCached: freshness.list === "stale",
            detailCached: freshness.detail !== "fresh",
            listError: listFailure === undefined ? undefined : failureMessage(listFailure, t),
            detailError: detailFailure === undefined ? undefined : failureMessage(detailFailure, t),
            writePending,
            requestRefresh: refresh,
            selectMeeting,
            pauseMeeting: () => changePause("pause_meeting"),
            resumeMeeting: () => changePause("resume_meeting"),
            endMeeting
        },
        t
    );
}
