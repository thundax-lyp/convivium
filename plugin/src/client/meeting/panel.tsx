import * as React from "react";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import type { MeetingSummary, MeetingView } from "@/protocol/index.ts";
import type { MeetingTranslate } from "./shared/index.ts";
import { ProtocolFailure, useMeetingSubmission, type MeetingClient } from "./client.ts";
import { SubmissionFeedback } from "./submission-feedback.tsx";
import { MeetingPanelLayout } from "./layout/index.ts";
import type { MeetingPanelLayoutProps, MeetingsFreshnessState } from "./shared/index.ts";
import { useMeetingTranslate, useMeetingWorkspace } from "./hooks/index.ts";

const INITIAL_FRESHNESS: MeetingsFreshnessState = {
    connection: "connecting",
    list: "loading",
    detail: "idle"
};

type MeetingPanelFailure = { readonly kind: "protocol" } | { readonly kind: "unavailable" };

const classifyFailure = (error: unknown): MeetingPanelFailure => {
    return error instanceof ProtocolFailure ? { kind: "protocol" } : { kind: "unavailable" };
};

const failureMessage = (failure: MeetingPanelFailure, t: MeetingTranslate): string => {
    return failure.kind === "protocol" ? t("panel.error.protocol") : t("panel.error.unavailable");
};

const endMeetingAction = (detail: MeetingView) => ({
    kind: "end_meeting" as const,
    outcome: "cancelled" as const,
    reason: "Cancelled from Meeting panel.",
    decisionIds: detail.outcomes.decisions
        .filter((item) => item.status === "accepted")
        .map((item) => item.id),
    completionFactIds: detail.outcomes.completionFacts
        .filter((item) => item.status === "active")
        .map((item) => item.id),
    unresolvedQuestionIds: detail.questions
        .filter((item) => item.status === "open" || item.status === "deferred")
        .map((item) => item.id),
    unresolvedIssueIds: detail.issues
        .filter((item) => item.status === "open" || item.status === "deferred")
        .map((item) => item.id)
});

export const ConviviumMeetingPanel = ({
    api,
    locale
}: {
    api: MeetingClient;
    locale?: string;
}): ReactElement => {
    const t = useMeetingTranslate();
    const [meetings, setMeetings] = useState<readonly MeetingSummary[]>([]);
    const meetingWorkspace = useMeetingWorkspace();
    const { workspace } = meetingWorkspace;
    const [freshness, setFreshness] = useState<MeetingsFreshnessState>(INITIAL_FRESHNESS);
    const [detail, setDetail] = useState<MeetingView>();
    const [listFailure, setListFailure] = useState<MeetingPanelFailure>();
    const [detailFailure, setDetailFailure] = useState<MeetingPanelFailure>();
    const [writePending, setWritePending] = useState(false);
    const writeLock = useRef(false);
    const controlClient: MeetingClient = {
        ...api,
        control: async (command, signal) => {
            if (writeLock.current) {
                throw new Error("A user command is already in flight.");
            }
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
                if (selectedRef.current !== meetingId) {
                    return;
                }
                setDetail(result);
                setDetailFailure(undefined);
                setFreshness((current) => ({ ...current, detail: "fresh" }));
            } catch (error) {
                if (selectedRef.current !== meetingId) {
                    return;
                }
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
            ) {
                return;
            }
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
            } else {
                setListFailure(classifyFailure(listResult.reason));
            }
            settledListFreshnessRef.current = listSucceeded ? "fresh" : "stale";
            if (listSucceeded && capturedMeetingId !== undefined && !selectedStillExists) {
                selectedRef.current = undefined;
                meetingWorkspace.clearSelection();
                setDetail(undefined);
                setDetailFailure(undefined);
            } else if (capturedMeetingId !== undefined) {
                if (detailSucceeded) {
                    setDetail(detailResult.value);
                    setDetailFailure(undefined);
                } else {
                    setDetailFailure(
                        classifyFailure((detailResult as PromiseRejectedResult).reason)
                    );
                }
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
        [api, meetingWorkspace.clearSelection]
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
                if (!stopped) {
                    markDisconnected();
                }
            },
            generationReopened: () => {
                if (!stopped && !streamTerminalRef.current) {
                    void refreshAll({ recovery: true });
                }
            }
        });
        void (async () => {
            try {
                for await (const item of stream) {
                    if (stopped) {
                        break;
                    }
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
    const controlsReady =
        freshness.connection === "connected" &&
        freshness.list === "fresh" &&
        freshness.detail === "fresh" &&
        workspace.selectedMeetingId !== undefined &&
        !writePending;
    const localSubmission = useMeetingSubmission(controlClient, !controlsReady, () => {
        void refreshAll({ recovery: false });
    });
    const selectMeeting = useCallback(
        (meetingId: string) => {
            if (selectedRef.current === meetingId) {
                return;
            }
            localSubmission.edit();
            refreshGenerationRef.current += 1;
            selectedRef.current = meetingId;
            meetingWorkspace.selectMeeting(meetingId);
            setDetail(undefined);
            setDetailFailure(undefined);
            setFreshness((current) => ({
                ...current,
                list: settledListFreshnessRef.current,
                detail: "loading"
            }));
            void loadDetail(meetingId);
        },
        [loadDetail, localSubmission.edit, meetingWorkspace.selectMeeting]
    );
    const endMeeting = async () => {
        if (!detail) {
            return;
        }
        await localSubmission.submit(detail.meetingId, detail.version, endMeetingAction(detail));
    };
    const changePause = async (kind: "pause_meeting" | "resume_meeting") => {
        if (!detail) {
            return;
        }
        await localSubmission.submit(detail.meetingId, detail.version, {
            kind,
            reason:
                kind === "pause_meeting"
                    ? "Paused from Meeting panel."
                    : "Resumed from Meeting panel."
        });
    };
    const layoutProps: MeetingPanelLayoutProps = {
        localFeedback: (
            <SubmissionFeedback
                submission={localSubmission}
                disabled={freshness.connection !== "connected" || writePending}
            />
        ),
        locale,
        meetings,
        selectedId: workspace.selectedMeetingId,
        detail,
        listLoading: freshness.list === "loading",
        listCached: freshness.list === "stale",
        detailCached: !controlsReady,
        activeMode: workspace.activeMode,
        setMode: meetingWorkspace.setMode,
        timelineFilters: workspace.timeline,
        viewportRevision: workspace.viewportRevision,
        onTimelineFiltersChange: meetingWorkspace.setTimelineFilters,
        focusTarget: workspace.focusTarget,
        onFocusConsumed: meetingWorkspace.consumeFocus,
        onLocateInOverview: meetingWorkspace.locateInOverview,
        listError: listFailure === undefined ? undefined : failureMessage(listFailure, t),
        detailError: detailFailure === undefined ? undefined : failureMessage(detailFailure, t),
        writePending,
        requestRefresh: refresh,
        selectMeeting,
        pauseMeeting: () => changePause("pause_meeting"),
        resumeMeeting: () => changePause("resume_meeting"),
        endMeeting
    };
    return <MeetingPanelLayout {...layoutProps} />;
};
