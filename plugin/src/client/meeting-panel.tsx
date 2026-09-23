import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import type { MeetingCommand, MeetingSummary, MeetingView } from "@/protocol/index.js";
import type { MeetingTranslate } from "./locales.js";
import { ProtocolFailure, type MeetingClient } from "./meeting-client.js";
import { renderMeetingPanelLayout } from "./meeting-panel-layout.js";
import {
    INITIAL_FRESHNESS,
    INITIAL_WORKSPACE,
    controlsEnabled,
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
    const refreshGenerationRef = useRef(0);
    const connectionRef = useRef(INITIAL_FRESHNESS.connection);
    const streamTerminalRef = useRef(false);

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

    const refreshAll = useCallback(
        async ({ recovery }: { recovery: boolean }) => {
            const generation = refreshGenerationRef.current + 1;
            refreshGenerationRef.current = generation;
            const capturedMeetingId = selectedRef.current;
            setFreshness((current) => ({
                ...current,
                list: "loading",
                detail: capturedMeetingId === undefined ? "idle" : "loading"
            }));
            const [listResult, detailResult] = await Promise.allSettled([
                api.list(),
                capturedMeetingId === undefined
                    ? Promise.resolve(undefined)
                    : api.read({ protocolVersion: 1, meetingId: capturedMeetingId })
            ]);
            if (
                refreshGenerationRef.current !== generation ||
                selectedRef.current !== capturedMeetingId
            )
                return;

            const listSucceeded = listResult.status === "fulfilled";
            const nextMeetings = listSucceeded ? listResult.value.meetings : undefined;
            const selectedStillExists =
                capturedMeetingId !== undefined &&
                nextMeetings?.some((meeting) => meeting.meetingId === capturedMeetingId) !== false;
            const detailSucceeded =
                capturedMeetingId !== undefined &&
                detailResult.status === "fulfilled" &&
                detailResult.value !== undefined;

            if (listSucceeded) {
                setMeetings(listResult.value.meetings);
                setListFailure(undefined);
            } else setListFailure(classifyFailure(listResult.reason));

            if (listSucceeded && capturedMeetingId !== undefined && !selectedStillExists) {
                selectedRef.current = undefined;
                setWorkspace((current) => ({
                    ...current,
                    selectedMeetingId: undefined,
                    focusTarget: undefined
                }));
                setDetail(undefined);
                setDetailFailure(undefined);
            } else if (capturedMeetingId !== undefined) {
                if (detailSucceeded) {
                    setDetail(detailResult.value);
                    setDetailFailure(undefined);
                } else
                    setDetailFailure(
                        classifyFailure((detailResult as PromiseRejectedResult).reason)
                    );
            }

            let connection = connectionRef.current;
            if (recovery) {
                const recovered =
                    !streamTerminalRef.current &&
                    listSucceeded &&
                    (capturedMeetingId === undefined || !selectedStillExists || detailSucceeded);
                connection = recovered ? "connected" : "disconnected";
                connectionRef.current = connection;
            }
            setFreshness({
                connection,
                list: listSucceeded ? "fresh" : "stale",
                detail:
                    capturedMeetingId === undefined || (listSucceeded && !selectedStillExists)
                        ? "idle"
                        : detailSucceeded
                          ? "fresh"
                          : "stale"
            });
        },
        [api]
    );

    const refresh = useCallback(() => {
        const recovery = !streamTerminalRef.current && connectionRef.current !== "connected";
        void refreshAll({ recovery });
    }, [refreshAll]);

    useEffect(() => {
        void refreshAll({ recovery: true });
    }, [refreshAll]);

    useEffect(() => {
        let stopped = false;
        const markDisconnected = () => {
            connectionRef.current = "disconnected";
            setFreshness({
                connection: "disconnected",
                list: "stale",
                detail: selectedRef.current === undefined ? "idle" : "stale"
            });
        };
        const stream = api.subscribeRefresh({
            carrierFailed: () => {
                if (!stopped) markDisconnected();
            },
            generationReopened: () => {
                if (!stopped && !streamTerminalRef.current) void refreshAll({ recovery: true });
            }
        });
        void (async () => {
            try {
                for await (const item of stream) {
                    if (stopped) break;
                    item.accept();
                    void refreshAll({
                        recovery: connectionRef.current !== "connected"
                    });
                }
            } catch {
                if (!stopped) {
                    streamTerminalRef.current = true;
                    markDisconnected();
                }
            }
        })();
        return () => {
            stopped = true;
            void stream.dispose();
        };
    }, [api, refreshAll]);

    useEffect(() => {
        const handleFocus = () => refresh();
        window.addEventListener("focus", handleFocus);
        return () => window.removeEventListener("focus", handleFocus);
    }, [refresh]);

    const selectMeeting = useCallback(
        (meetingId: string) => {
            if (selectedRef.current === meetingId) return;
            refreshGenerationRef.current += 1;
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
            await refreshAll({ recovery: false });
        } catch (error) {
            setDetailFailure(classifyFailure(error));
            setFreshness((current) => ({ ...current, detail: "stale" }));
        } finally {
            setWritePending(false);
        }
    }, [api, detail, refreshAll, writePending]);

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
                await refreshAll({ recovery: false });
            } catch (error) {
                setDetailFailure(classifyFailure(error));
                setFreshness((current) => ({ ...current, detail: "stale" }));
            } finally {
                setWritePending(false);
            }
        },
        [api, detail, refreshAll, writePending]
    );

    return renderMeetingPanelLayout(
        {
            meetings,
            selectedId: workspace.selectedMeetingId,
            detail,
            listCached: freshness.list === "stale",
            detailCached: !controlsEnabled({
                freshness,
                selectedMeetingId: workspace.selectedMeetingId,
                writePending
            }),
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
