import * as React from "react";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import { useMeetingSubmission } from "./client.ts";
import { en, type MeetingLocaleKey, type MeetingTranslate } from "./shared/index.ts";
import { useMeetingTranslate } from "./hooks/index.ts";

const formText = (name: string, t: MeetingTranslate): string => {
    const key = `form.${name}` as MeetingLocaleKey;
    if (Object.hasOwn(en, key)) {
        return t(key);
    }
    return t("form.command_rejected", { code: name });
};
export const SubmissionFeedback = ({
    submission,
    disabled
}: {
    submission: ReturnType<typeof useMeetingSubmission>;
    disabled: boolean;
}) => {
    const t = useMeetingTranslate();
    return (
        <>
            {submission.message && <p role="status">{formText(submission.message, t)}</p>}
            {submission.uncertain && (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled || submission.pending}
                    onClick={() => void submission.retry()}
                >
                    {formText("retry", t)}
                </Button>
            )}
        </>
    );
};
