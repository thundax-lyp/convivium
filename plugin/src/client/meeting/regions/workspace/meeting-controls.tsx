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
}: MeetingControlsProps): ReactElement => {
    const t = useMeetingTranslate();
    return (
        <ButtonGroup role="group" aria-label={t("panel.actions.group")}>
            <Tooltip label={t("panel.actions.pause")} side="top" portal>
                <span className={styles.slot}>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={styles.button}
                        aria-label={t("panel.actions.pause")}
                        disabled={
                            writePending || detailCached || !controls.includes("pause_meeting")
                        }
                        onClick={() => void pauseMeeting()}
                    >
                        <IconPauseOutlineMedium size={16} aria-hidden="true" />
                    </Button>
                </span>
            </Tooltip>
            <Tooltip label={t("panel.actions.resume")} side="top" portal>
                <span className={styles.slot}>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={styles.button}
                        aria-label={t("panel.actions.resume")}
                        disabled={
                            writePending || detailCached || !controls.includes("resume_meeting")
                        }
                        onClick={() => void resumeMeeting()}
                    >
                        <IconPlayOutlineMedium size={16} aria-hidden="true" />
                    </Button>
                </span>
            </Tooltip>
            <Tooltip label={t("panel.actions.end")} side="top" portal>
                <span className={styles.slot}>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={styles.button}
                        aria-label={t("panel.actions.end")}
                        disabled={writePending || detailCached || !controls.includes("end_meeting")}
                        onClick={() => void endMeeting()}
                    >
                        <IconStopFillMedium size={16} aria-hidden="true" />
                    </Button>
                </span>
            </Tooltip>
        </ButtonGroup>
    );
};
