import {
    createElement,
    useCallback,
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type ReactElement
} from "react";
import {
    LocalMeetingListResponseConsumerSchema,
    MeetingControlResultSchema,
    MeetingStatusResultSchema,
    validateProtocolError,
    validateProtocolSuccessEnvelope,
    type LocalMeetingListItemV1,
    type LocalMeetingListResponseV1,
    type MeetingControlResultV1,
    type MeetingStatusResultV1,
    type ProtocolErrorV1,
    type ProtocolSuccessV1
} from "../protocol/index.js";

const meetingsPath = "/api/convivium/meetings";

class ProtocolFailure extends Error {}

function meetingPath(meetingId: string): string {
    return `${meetingsPath}/${encodeURIComponent(meetingId)}`;
}

async function responseJson(response: Response): Promise<unknown> {
    return response.json() as Promise<unknown>;
}

function protocolFailure(value: unknown): ProtocolFailure {
    const validated = validateProtocolError(value);
    const error = validated as ProtocolErrorV1;
    return new ProtocolFailure(error.message);
}

async function readList(response: Response): Promise<LocalMeetingListResponseV1> {
    const value = await responseJson(response);
    if (!response.ok) throw protocolFailure(value);
    return LocalMeetingListResponseConsumerSchema(value) as LocalMeetingListResponseV1;
}

async function readStatus(response: Response): Promise<ProtocolSuccessV1<MeetingStatusResultV1>> {
    const value = await responseJson(response);
    if (!response.ok) throw protocolFailure(value);
    return validateProtocolSuccessEnvelope(
        MeetingStatusResultSchema,
        value
    ) as unknown as ProtocolSuccessV1<MeetingStatusResultV1>;
}

async function readControl(response: Response): Promise<ProtocolSuccessV1<MeetingControlResultV1>> {
    const value = await responseJson(response);
    if (!response.ok) throw protocolFailure(value);
    return validateProtocolSuccessEnvelope(
        MeetingControlResultSchema,
        value
    ) as ProtocolSuccessV1<MeetingControlResultV1>;
}

function failureMessage(error: unknown): string {
    return error instanceof ProtocolFailure ? error.message : "Meeting data is unavailable.";
}

export function ConviviumMeetingPanel(): ReactElement {
    const [meetings, setMeetings] = useState<readonly LocalMeetingListItemV1[]>([]);
    const [selectedId, setSelectedId] = useState<string>();
    const [detail, setDetail] = useState<MeetingStatusResultV1>();
    const [listCached, setListCached] = useState(false);
    const [detailCached, setDetailCached] = useState(false);
    const [listError, setListError] = useState<string>();
    const [detailError, setDetailError] = useState<string>();
    const [pauseReason, setPauseReason] = useState("");
    const [writePending, setWritePending] = useState(false);

    const mounted = useRef(true);
    const selectedIdRef = useRef<string>();
    const writePendingRef = useRef(false);
    const listController = useRef<AbortController>();
    const detailController = useRef<AbortController>();
    const writeController = useRef<AbortController>();
    const listGeneration = useRef(0);
    const detailGeneration = useRef(0);
    const writeGeneration = useRef(0);

    const clearSelection = useCallback(() => {
        detailController.current?.abort();
        writeController.current?.abort();
        detailGeneration.current += 1;
        writeGeneration.current += 1;
        selectedIdRef.current = undefined;
        writePendingRef.current = false;
        setSelectedId(undefined);
        setDetail(undefined);
        setDetailCached(false);
        setDetailError(undefined);
        setPauseReason("");
        setWritePending(false);
    }, []);

    const loadList = useCallback(async () => {
        listController.current?.abort();
        const controller = new AbortController();
        listController.current = controller;
        const generation = ++listGeneration.current;
        try {
            const response = await fetch(meetingsPath, { signal: controller.signal });
            const validated = await readList(response);
            if (!mounted.current || generation !== listGeneration.current) return;
            const nextMeetings = validated.result.meetings;
            setMeetings(nextMeetings);
            setListCached(false);
            setListError(undefined);
            const currentId = selectedIdRef.current;
            if (
                currentId !== undefined &&
                !nextMeetings.some((item) => item.meetingId === currentId)
            ) {
                clearSelection();
            }
        } catch (error) {
            if (controller.signal.aborted || generation !== listGeneration.current) return;
            setListCached(true);
            setListError(failureMessage(error));
        }
    }, [clearSelection]);

    const loadDetail = useCallback(async (meetingId: string): Promise<boolean> => {
        detailController.current?.abort();
        const controller = new AbortController();
        detailController.current = controller;
        const generation = ++detailGeneration.current;
        try {
            const response = await fetch(meetingPath(meetingId), { signal: controller.signal });
            const validated = await readStatus(response);
            if (
                !mounted.current ||
                generation !== detailGeneration.current ||
                selectedIdRef.current !== meetingId
            ) {
                return false;
            }
            setDetail(validated.result);
            setDetailCached(false);
            setDetailError(undefined);
            return true;
        } catch (error) {
            if (
                controller.signal.aborted ||
                generation !== detailGeneration.current ||
                selectedIdRef.current !== meetingId
            ) {
                return false;
            }
            setDetailCached(true);
            setDetailError(failureMessage(error));
            return false;
        }
    }, []);

    const refreshSelectedMeeting = useCallback(
        async (meetingId: string) => Promise.all([loadList(), loadDetail(meetingId)]),
        [loadDetail, loadList]
    );

    const selectMeeting = useCallback(
        (meetingId: string) => {
            detailController.current?.abort();
            writeController.current?.abort();
            detailGeneration.current += 1;
            writeGeneration.current += 1;
            selectedIdRef.current = meetingId;
            writePendingRef.current = false;
            setSelectedId(meetingId);
            setDetail(undefined);
            setDetailCached(false);
            setDetailError(undefined);
            setPauseReason("");
            setWritePending(false);
            void loadDetail(meetingId);
        },
        [loadDetail]
    );

    const controlMeeting = useCallback(
        async (action: "pause" | "resume") => {
            const meetingId = selectedIdRef.current;
            if (
                meetingId === undefined ||
                detail === undefined ||
                detailCached ||
                writePendingRef.current
            ) {
                return;
            }
            const controller = new AbortController();
            writeController.current = controller;
            const generation = ++writeGeneration.current;
            writePendingRef.current = true;
            setWritePending(true);
            setDetailError(undefined);
            const body = {
                protocolVersion: 1,
                meetingId,
                expectedMeetingVersion: detail.meetingVersion,
                requestId: crypto.randomUUID(),
                ...(action === "pause" ? { reason: pauseReason } : {})
            };
            let shouldRefetch = false;
            try {
                const response = await fetch(`${meetingPath(meetingId)}/${action}`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(body),
                    signal: controller.signal
                });
                try {
                    await readControl(response);
                    shouldRefetch = true;
                } catch (error) {
                    if (error instanceof ProtocolFailure) {
                        shouldRefetch = true;
                        setDetailError(error.message);
                        setDetailCached(true);
                    } else {
                        throw error;
                    }
                }
                if (generation === writeGeneration.current && selectedIdRef.current === meetingId) {
                    await refreshSelectedMeeting(meetingId);
                }
            } catch (error) {
                if (
                    !controller.signal.aborted &&
                    generation === writeGeneration.current &&
                    selectedIdRef.current === meetingId
                ) {
                    setDetailCached(true);
                    setDetailError(failureMessage(error));
                }
            } finally {
                if (
                    mounted.current &&
                    generation === writeGeneration.current &&
                    selectedIdRef.current === meetingId
                ) {
                    writePendingRef.current = false;
                    setWritePending(false);
                    if (!shouldRefetch) setDetailCached(true);
                }
            }
        },
        [detail, detailCached, pauseReason, refreshSelectedMeeting]
    );

    useEffect(() => {
        mounted.current = true;
        void loadList();
        return () => {
            mounted.current = false;
            listController.current?.abort();
            detailController.current?.abort();
            writeController.current?.abort();
            listGeneration.current += 1;
            detailGeneration.current += 1;
            writeGeneration.current += 1;
        };
    }, [loadList]);

    useEffect(() => {
        const onFocus = () => {
            const meetingId = selectedIdRef.current;
            if (meetingId === undefined) void loadList();
            else if (!writePendingRef.current) void refreshSelectedMeeting(meetingId);
        };
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, [loadList, refreshSelectedMeeting]);

    useEffect(() => {
        if (selectedId === undefined) return;
        const timer = window.setInterval(() => {
            if (!writePendingRef.current && selectedIdRef.current !== undefined) {
                void refreshSelectedMeeting(selectedIdRef.current);
            }
        }, 5_000);
        return () => window.clearInterval(timer);
    }, [refreshSelectedMeeting, selectedId]);

    const selectedItem = meetings.find((item) => item.meetingId === selectedId);
    const canPause =
        detail !== undefined && ["created", "running", "waiting"].includes(detail.status);
    const canResume = detail?.status === "paused";
    const writesDisabled = listCached || detailCached || writePending;

    return createElement(
        "section",
        { "data-testid": "convivium-meeting-panel", "aria-label": "Convivium meetings" },
        createElement("h2", null, "Meetings"),
        createElement(
            "button",
            { type: "button", "aria-label": "Reload meetings", onClick: () => void loadList() },
            "Reload"
        ),
        createElement(
            "div",
            { "data-cached": listCached ? "true" : undefined },
            listError === undefined ? null : createElement("p", { role: "status" }, listError),
            meetings.length === 0
                ? createElement("p", null, "No meetings found.")
                : createElement(
                      "ul",
                      { "aria-label": "Meetings" },
                      meetings.map((item) =>
                          createElement(
                              "li",
                              { key: item.meetingId },
                              createElement(
                                  "button",
                                  {
                                      type: "button",
                                      "data-meeting-id": item.meetingId,
                                      onClick: () => selectMeeting(item.meetingId)
                                  },
                                  `${item.topic} (${item.status})`
                              )
                          )
                      )
                  )
        ),
        selectedId === undefined
            ? null
            : createElement(
                  "div",
                  { "data-cached": detailCached ? "true" : undefined },
                  createElement("h3", null, detail?.topic ?? selectedItem?.topic ?? "Meeting"),
                  detailError === undefined
                      ? null
                      : createElement("p", { role: "alert" }, detailError),
                  detail === undefined
                      ? createElement("p", null, "Loading meeting status…")
                      : createElement(
                            "div",
                            null,
                            createElement(
                                "p",
                                { "data-meeting-status": detail.status },
                                `Status: ${detail.status}`
                            ),
                            detail.status === "paused"
                                ? createElement(
                                      "dl",
                                      null,
                                      createElement("dt", null, "Pause reason"),
                                      createElement("dd", null, detail.pauseControl.reason),
                                      createElement("dt", null, "Paused by"),
                                      createElement(
                                          "dd",
                                          null,
                                          `${detail.pauseControl.pausedBy?.kind}/${detail.pauseControl.pausedBy?.actorId}`
                                      ),
                                      createElement("dt", null, "Paused at"),
                                      createElement(
                                          "dd",
                                          null,
                                          String(detail.pauseControl.pausedAt)
                                      )
                                  )
                                : null,
                            createElement(
                                "pre",
                                { "aria-label": "Meeting status details" },
                                JSON.stringify(detail, null, 2)
                            ),
                            canPause
                                ? createElement(
                                      "div",
                                      null,
                                      createElement("input", {
                                          "aria-label": "Pause reason",
                                          value: pauseReason,
                                          onChange: (event: ChangeEvent<HTMLInputElement>) =>
                                              setPauseReason(event.currentTarget.value)
                                      }),
                                      createElement(
                                          "button",
                                          {
                                              type: "button",
                                              "aria-label": "Pause meeting",
                                              disabled: writesDisabled || pauseReason.trim() === "",
                                              onClick: () => void controlMeeting("pause")
                                          },
                                          "Pause"
                                      )
                                  )
                                : null,
                            canResume
                                ? createElement(
                                      "button",
                                      {
                                          type: "button",
                                          "aria-label": "Resume meeting",
                                          disabled: writesDisabled,
                                          onClick: () => void controlMeeting("resume")
                                      },
                                      "Resume"
                                  )
                                : null
                        )
              )
    );
}
