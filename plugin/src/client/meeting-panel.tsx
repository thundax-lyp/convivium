import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import type { MeetingCommand, MeetingSummary, MeetingView } from "@/protocol/index.js";
import { ProtocolFailure, type MeetingClient } from "./meeting-client.js";
import { renderMeetingPanelLayout } from "./meeting-panel-layout.js";

function failureMessage(error: unknown): string {
    return error instanceof ProtocolFailure ? error.message : "Meeting data is unavailable.";
}

export function ConviviumMeetingPanel({ api }: { api: MeetingClient }): ReactElement {
    const [meetings, setMeetings] = useState<readonly MeetingSummary[]>([]);
    const [selectedId, setSelectedId] = useState<string>();
    const [detail, setDetail] = useState<MeetingView>();
    const [listCached, setListCached] = useState(false);
    const [detailCached, setDetailCached] = useState(false);
    const [listError, setListError] = useState<string>();
    const [detailError, setDetailError] = useState<string>();
    const [writePending, setWritePending] = useState(false);
    const selectedRef = useRef<string>();

    const loadList = useCallback(async () => {
        try {
            const result = await api.list();
            setMeetings(result.meetings);
            setListCached(false);
            setListError(undefined);
        } catch (error) {
            setListCached(true);
            setListError(failureMessage(error));
        }
    }, [api]);

    const loadDetail = useCallback(
        async (meetingId: string) => {
            try {
                const result = await api.read({ protocolVersion: 1, meetingId });
                if (selectedRef.current !== meetingId) return;
                setDetail(result);
                setDetailCached(false);
                setDetailError(undefined);
            } catch (error) {
                if (selectedRef.current !== meetingId) return;
                setDetailCached(true);
                setDetailError(failureMessage(error));
            }
        },
        [api]
    );

    const refresh = useCallback(() => {
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
            selectedRef.current = meetingId;
            setSelectedId(meetingId);
            setDetail(undefined);
            setDetailCached(true);
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
        setDetailCached(true);
        setDetailError(undefined);
        try {
            await api.control(command);
            await loadDetail(meetingId);
            await loadList();
        } catch (error) {
            setDetailError(failureMessage(error));
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
            setDetailCached(true);
            setDetailError(undefined);
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
                setDetailError(failureMessage(error));
            } finally {
                setWritePending(false);
            }
        },
        [api, detail, loadDetail, loadList, writePending]
    );

    return renderMeetingPanelLayout({
        meetings,
        selectedId,
        detail,
        listCached,
        detailCached,
        listError,
        detailError,
        writePending,
        requestRefresh: refresh,
        selectMeeting,
        pauseMeeting: () => changePause("pause_meeting"),
        resumeMeeting: () => changePause("resume_meeting"),
        endMeeting
    });
}
