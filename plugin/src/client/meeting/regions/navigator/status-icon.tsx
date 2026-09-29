import * as React from "react";
import type { ReactElement } from "react";
import type { MeetingSummary } from "@/protocol/index.ts";
import {
    IconArchiveOutline20,
    IconCheckOutline16,
    IconClockOutline16,
    IconGoalOutline16,
    IconLoadingOutline16,
    IconPauseOutline16,
    IconPlayOutline16,
    IconStopFill16
} from "@deepseek-ai/dsh-client-ui-primitives";

export const MeetingStatusIcon = ({
    status
}: {
    status: MeetingSummary["lifecycle"];
}): ReactElement => {
    switch (status) {
        case "preparing":
            return <IconClockOutline16 />;
        case "running":
            return <IconPlayOutline16 />;
        case "paused":
            return <IconPauseOutline16 />;
        case "converging":
            return <IconGoalOutline16 />;
        case "ending":
            return <IconStopFill16 />;
        case "terminal":
            return <IconCheckOutline16 />;
        case "archiving":
            return <IconLoadingOutline16 />;
        case "archived":
            return <IconArchiveOutline20 size={16} />;
    }
};
