import * as React from "react";
import { useRef, useState } from "react";
import type { MeetingSummary } from "@/protocol/index.ts";
import { RiskConfirmation } from "@deepseek-ai/dsh-client-ui-primitives";
import { useMeetingTranslate } from "@/client/meeting/hooks/index.ts";

export const MeetingDeleteConfirmation = ({
    meeting,
    disabled,
    remove,
    onClose
}: {
    meeting: MeetingSummary;
    disabled: boolean;
    remove(meeting: MeetingSummary): Promise<void>;
    onClose(): void;
}) => {
    const t = useMeetingTranslate();
    const [acknowledged, setAcknowledged] = useState(false);
    const [pending, setPending] = useState(false);
    const [failed, setFailed] = useState(false);
    const inFlight = useRef(false);
    const confirm = async () => {
        if (!acknowledged || disabled || inFlight.current) {
            return;
        }
        inFlight.current = true;
        setPending(true);
        setFailed(false);
        try {
            await remove(meeting);
            onClose();
        } catch {
            setFailed(true);
        } finally {
            inFlight.current = false;
            setPending(false);
        }
    };
    return (
        <>
            <RiskConfirmation
                open
                title={t("panel.delete.title", { objective: meeting.objective })}
                description={`${t("panel.delete.description")}${failed ? ` ${t("panel.delete.failed")}` : ""}`}
                acknowledgeLabel={t("panel.delete.acknowledge")}
                cancelLabel={t("panel.delete.cancel")}
                closeLabel={t("panel.delete.cancel")}
                confirmLabel={t("panel.delete.action")}
                acknowledged={acknowledged}
                disabled={disabled || pending}
                onAcknowledgedChange={setAcknowledged}
                onCancel={() => {
                    if (!inFlight.current) {
                        onClose();
                    }
                }}
                onConfirm={() => void confirm()}
            />
            {failed ? <p role="alert">{t("panel.delete.failed")}</p> : null}
        </>
    );
};
