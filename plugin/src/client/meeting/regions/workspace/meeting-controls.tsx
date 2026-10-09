import * as React from "react";
import type { ReactElement } from "react";
import type { MeetingReadResult } from "@/protocol/index.ts";
import {
    Button,
    IconPauseOutlineMedium,
    IconPlayOutlineMedium,
    IconStopFillMedium,
    Tooltip
} from "@deepseek-ai/dsh-client-ui-primitives";
import { useMeetingTranslate } from "@/client/meeting/hooks/index.ts";
import { ButtonGroup } from "@/client/meeting/components/index.ts";
import type { MeetingPanelLayoutProps } from "@/client/meeting/shared/index.ts";
import styles from "./meeting-controls.module.css";

type MeetingControlsProps = Pick<
    MeetingPanelLayoutProps,
    "writePending" | "detailCached" | "pauseMeeting" | "resumeMeeting" | "endMeeting"
> & { controls: MeetingReadResult["controls"] };

export const MeetingControls = ({
    controls,
    writePending,
    detailCached,
    pauseMeeting,
    resumeMeeting,
    endMeeting
}: MeetingControlsProps): ReactElement | null => {
    const t = useMeetingTranslate();
    const canPause = controls.includes("pause_meeting");
    const canResume = controls.includes("resume_meeting");
    const canEnd = controls.includes("end_meeting");

    if (!canPause && !canResume && !canEnd) return null;

    return (
        <ButtonGroup role="group" aria-label={t("panel.actions.group")}>
            {canPause ? (
                <Tooltip label={t("panel.actions.pause")} side="top" portal>
                    <span className={styles.slot}>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={styles.button}
                            aria-label={t("panel.actions.pause")}
                            disabled={writePending || detailCached}
                            onClick={() => void pauseMeeting()}
                        >
                            <IconPauseOutlineMedium size={16} aria-hidden="true" />
                        </Button>
                    </span>
                </Tooltip>
            ) : null}
            {canResume ? (
                <Tooltip label={t("panel.actions.resume")} side="top" portal>
                    <span className={styles.slot}>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={styles.button}
                            aria-label={t("panel.actions.resume")}
                            disabled={writePending || detailCached}
                            onClick={() => void resumeMeeting()}
                        >
                            <IconPlayOutlineMedium size={16} aria-hidden="true" />
                        </Button>
                    </span>
                </Tooltip>
            ) : null}
            {canEnd ? (
                <Tooltip label={t("panel.actions.end")} side="top" portal>
                    <span className={styles.slot}>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={styles.button}
                            aria-label={t("panel.actions.end")}
                            disabled={writePending || detailCached}
                            onClick={() => void endMeeting()}
                        >
                            <IconStopFillMedium size={16} aria-hidden="true" />
                        </Button>
                    </span>
                </Tooltip>
            ) : null}
        </ButtonGroup>
    );
};
