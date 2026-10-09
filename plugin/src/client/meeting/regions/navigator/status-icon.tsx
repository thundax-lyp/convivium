import * as React from "react";
import type { ReactElement } from "react";
import type { MeetingSummary } from "@/protocol/index.ts";
import {
    IconArchiveOutlineMedium,
    IconCheckOutlineMedium,
    IconClockOutlineMedium,
    IconGoalOutlineMedium,
    IconLoadingOutlineMedium,
    IconPauseOutlineMedium,
    IconPlayOutlineMedium,
    IconStopFillMedium
} from "@deepseek-ai/dsh-client-ui-primitives";

export const MeetingStatusIcon = ({
    status
}: {
    status: MeetingSummary["lifecycle"];
}): ReactElement => {
    switch (status) {
        case "preparing":
            return <IconClockOutlineMedium />;
        case "running":
            return <IconPlayOutlineMedium />;
        case "paused":
            return <IconPauseOutlineMedium />;
        case "converging":
            return <IconGoalOutlineMedium />;
        case "ending":
            return <IconStopFillMedium />;
        case "terminal":
            return <IconCheckOutlineMedium />;
        case "archiving":
            return <IconLoadingOutlineMedium />;
        case "archived":
            return <IconArchiveOutlineMedium size={16} />;
    }
};
