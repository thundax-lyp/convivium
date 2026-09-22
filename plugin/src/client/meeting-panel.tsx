import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import type { MeetingCommand, MeetingSummary, MeetingView } from "@/protocol/index.js";
import type { MeetingTranslate } from "./locales.js";
import { ProtocolFailure, type MeetingClient } from "./meeting-client.js";
import { renderMeetingPanelLayout } from "./meeting-panel-layout.js";

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
    const [selectedId, setSelectedId] = useState<string>();
    const [detail, setDetail] = useState<MeetingView>();
    const [listCached, setListCached] = useState(false);
    const [detailCached, setDetailCached] = useState(false);
    const [listFailure, setListFailure] = useState<MeetingPanelFailure>();
    const [detailFailure, setDetailFailure] = useState<MeetingPanelFailure>();
    const [writePending, setWritePending] = useState(false);
    const selectedRef = useRef<string>();

    const loadList = useCallback(async () => {
        try {
            const result = await api.list();
            setMeetings(result.meetings);
            setListCached(false);
            setListFailure(undefined);
        } catch (error) {
            setListCached(true);
            setListFailure(classifyFailure(error));
        }
    }, [api]);

    const loadDetail = useCallback(
        async (meetingId: string) => {
            try {
                const result = await api.read({ protocolVersion: 1, meetingId });
                if (selectedRef.current !== meetingId) return;
                setDetail(result);
                setDetailCached(false);
                setDetailFailure(undefined);
            } catch (error) {
                if (selectedRef.current !== meetingId) return;
                setDetailCached(true);
                setDetailFailure(classifyFailure(error));
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
            setDetailCached(true);
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
            selectedId,
            detail,
            listCached,
            detailCached,
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
