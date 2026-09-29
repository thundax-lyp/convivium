import * as React from "react";
import { useMeetingSubmission } from "./client.ts";
import { en, type MeetingLocaleKey, type MeetingTranslate } from "./shared/index.ts";

const formText = (name: string, t?: MeetingTranslate): string => {
    const key = `form.${name}` as MeetingLocaleKey;
    if (Object.hasOwn(en, key)) {
        return t ? t(key) : en[key];
    }
    return t
        ? t("form.command_rejected", { code: name })
        : en["form.command_rejected"].replace("{code}", name);
};
export const SubmissionFeedback = ({
    submission,
    disabled,
    t
}: {
    submission: ReturnType<typeof useMeetingSubmission>;
    disabled: boolean;
    t?: MeetingTranslate;
}) => (
    <>
        {submission.message && <p role="status">{formText(submission.message, t)}</p>}
        {submission.uncertain && (
            <button
                type="button"
                disabled={disabled || submission.pending}
                onClick={() => void submission.retry()}
            >
                {formText("retry", t)}
            </button>
        )}
    </>
);
