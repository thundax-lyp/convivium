import * as React from "react";
import { useEffect, useRef, useState, type ReactElement } from "react";
import type { MeetingView } from "@/protocol/index.ts";
import { useMeetingTranslate } from "@/client/meeting/hooks/index.ts";
import type { MeetingFocusTarget } from "@/client/meeting/shared/index.ts";
import { OverviewAgenda } from "./agenda/index.ts";
import { OverviewObjective } from "./objective/index.ts";
import { OverviewOpenItems } from "./open-items/index.ts";
import { OverviewOutcomes } from "./outcomes/index.ts";
import { OverviewRecords } from "./records/index.ts";

interface SectionProps {
    detail: MeetingView;
}

interface OverviewProps extends SectionProps {
    focusTarget?: MeetingFocusTarget;
    onFocusConsumed?(): void;
}

const overviewKey = (kind: string, id: string): string => `${kind}:${id}`;
export const MeetingPanelOverview = (props: OverviewProps): ReactElement => {
    const { detail, focusTarget, onFocusConsumed } = props;
    const t = useMeetingTranslate();
    const overview = useRef<HTMLDivElement>(null);
    const [focusMissing, setFocusMissing] = useState(false);
    useEffect(() => {
        if (!focusTarget) {
            return;
        }
        const item =
            focusTarget.meetingId === detail.meetingId
                ? Array.from(
                      overview.current?.querySelectorAll<HTMLElement>("[data-overview-key]") ?? []
                  ).find(
                      (element) =>
                          element.dataset.overviewKey ===
                          overviewKey(focusTarget.objectKind, focusTarget.objectId)
                  )
                : undefined;
        if (!item) {
            setFocusMissing(true);
        } else {
            setFocusMissing(false);
            item.scrollIntoView?.({ block: "nearest", inline: "center" });
            item.focus();
        }
        onFocusConsumed?.();
    }, [focusTarget, detail.meetingId, onFocusConsumed]);
    return (
        <div ref={overview}>
            <OverviewObjective {...props} />
            <OverviewAgenda {...props} />
            <OverviewOutcomes {...props} />
            <OverviewOpenItems {...props} />
            <OverviewRecords {...props} />
            {focusMissing ? <p role="status">{t("panel.state.focusMissing")}</p> : null}
        </div>
    );
};
