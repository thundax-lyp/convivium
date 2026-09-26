import * as React from "react";
import { useMeetingSubmission } from "./meeting-client.js";
import { en, type MeetingLocaleKey, type MeetingTranslate } from "./locales.js";

const formText = (name: string, t?: MeetingTranslate): string => {
    const key = `form.${name}` as MeetingLocaleKey;
    return Object.hasOwn(en, key) ? (t ? t(key) : en[key]) : name;
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
