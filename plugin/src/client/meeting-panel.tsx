import * as React from "react";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import type { MeetingSummary, MeetingView } from "@/protocol/index.js";
import type { MeetingTranslate } from "./locales.js";
import { ProtocolFailure, useMeetingSubmission, type MeetingClient } from "./meeting-client.js";
import { SubmissionFeedback } from "./meeting-submission-feedback.js";
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
    | {
          readonly kind: "protocol";
          readonly code: string;
      }
    | {
          readonly kind: "unavailable";
      };

const classifyFailure = (error: unknown): MeetingPanelFailure => {
    return error instanceof ProtocolFailure
        ? { kind: "protocol", code: error.protocolError.code }
        : { kind: "unavailable" };
};

const failureMessage = (failure: MeetingPanelFailure, t: MeetingTranslate): string => {
    return failure.kind === "protocol"
        ? t("panel.error.protocol", { code: failure.code })
        : t("panel.error.unavailable");
};

export const ConviviumMeetingPanel = ({
    api,
    t,
    locale
}: {
    api: MeetingClient;
    t: MeetingTranslate;
    locale?: string;
}): ReactElement => {
    const [meetings, setMeetings] = useState<readonly MeetingSummary[]>([]);
    const [workspace, setWorkspace] = useState<MeetingsWorkspaceState>(INITIAL_WORKSPACE);
    const [freshness, setFreshness] = useState<MeetingsFreshnessState>(INITIAL_FRESHNESS);
    const [detail, setDetail] = useState<MeetingView>();
    const [listFailure, setListFailure] = useState<MeetingPanelFailure>();
    const [detailFailure, setDetailFailure] = useState<MeetingPanelFailure>();
    const [writePending, setWritePending] = useState(false);
    const writeLock = useRef(false);
    const controlClient: MeetingClient = {
        ...api,
        control: async (command, signal) => {
            if (writeLock.current) throw new Error("A user command is already in flight.");
            writeLock.current = true;
            setWritePending(true);
            try {
                return await api.control(command, signal);
            } finally {
                writeLock.current = false;
                setWritePending(false);
            }
        }
    };
    const selectedRef = useRef<string>();
    const refreshGenerationRef = useRef(0);
    const carrierFailureEpochRef = useRef(0);
    const connectionRef = useRef(INITIAL_FRESHNESS.connection);
    const settledListFreshnessRef = useRef(INITIAL_FRESHNESS.list);
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
            const carrierFailureEpoch = carrierFailureEpochRef.current;
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
            settledListFreshnessRef.current = listSucceeded ? "fresh" : "stale";
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
                    carrierFailureEpochRef.current === carrierFailureEpoch &&
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
            carrierFailureEpochRef.current += 1;
            connectionRef.current = "disconnected";
            settledListFreshnessRef.current = "stale";
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
    const localSubmission = useMeetingSubmission(
        controlClient,
        !controlsEnabled({
            freshness,
            selectedMeetingId: workspace.selectedMeetingId,
            writePending
        }),
        () => {
            void refreshAll({ recovery: false });
        }
    );
    const selectMeeting = useCallback(
        (meetingId: string) => {
            if (selectedRef.current === meetingId) return;
            localSubmission.edit();
            refreshGenerationRef.current += 1;
            selectedRef.current = meetingId;
            setWorkspace((current) =>
                resetWorkspaceForMeeting(meetingId, current.viewportRevision)
            );
            setDetail(undefined);
            setDetailFailure(undefined);
            setFreshness((current) => ({
                ...current,
                list: settledListFreshnessRef.current,
                detail: "loading"
            }));
            void loadDetail(meetingId);
        },
        [loadDetail, localSubmission.edit]
    );
    const endMeeting = async () => {
        if (!detail) return;
        await localSubmission.submit(detail.meetingId, detail.version, {
            kind: "end_meeting",
            outcome: "partial",
            reason: "Ended from Meeting panel.",
            decisionIds: [],
            completionFactIds: [],
            unresolvedQuestionIds: [],
            unresolvedIssueIds: []
        });
    };
    const changePause = async (kind: "pause_meeting" | "resume_meeting") => {
        if (!detail) return;
        await localSubmission.submit(detail.meetingId, detail.version, {
            kind,
            reason:
                kind === "pause_meeting"
                    ? "Paused from Meeting panel."
                    : "Resumed from Meeting panel."
        });
    };
    return renderMeetingPanelLayout(
        {
            localFeedback: (
                <SubmissionFeedback
                    submission={localSubmission}
                    disabled={freshness.connection !== "connected" || writePending}
                    t={t}
                />
            ),
            locale,
            meetings,
            selectedId: workspace.selectedMeetingId,
            detail,
            listLoading: freshness.list === "loading",
            listCached: freshness.list === "stale",
            detailCached: !controlsEnabled({
                freshness,
                selectedMeetingId: workspace.selectedMeetingId,
                writePending
            }),
            activeMode: workspace.activeMode,
            setMode: (activeMode) => setWorkspace((current) => ({ ...current, activeMode })),
            timelineFilters: workspace.timeline,
            viewportRevision: workspace.viewportRevision,
            onTimelineFiltersChange: (timeline) =>
                setWorkspace((current) => ({ ...current, timeline })),
            focusTarget: workspace.focusTarget,
            onFocusConsumed: () =>
                setWorkspace((current) => ({ ...current, focusTarget: undefined })),
            onLocateInTimeline: (focusTarget) =>
                setWorkspace((current) => ({ ...current, activeMode: "timeline", focusTarget })),
            onLocateInOverview: (focusTarget) =>
                setWorkspace((current) => ({ ...current, activeMode: "overview", focusTarget })),
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
};
