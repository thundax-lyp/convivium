import * as React from "react";
import { createContext, useContext, type ReactNode } from "react";
import type { MeetingTranslate } from "@/client/meeting/shared/index.ts";

const MeetingTranslationContext = createContext<MeetingTranslate | null>(null);

export const MeetingTranslationProvider = ({
    t,
    children
}: {
    t: MeetingTranslate;
    children: ReactNode;
}) => <MeetingTranslationContext.Provider value={t}>{children}</MeetingTranslationContext.Provider>;

export const useMeetingTranslate = (): MeetingTranslate => {
    const translation = useContext(MeetingTranslationContext);
    if (translation === null) {
        throw new Error("MeetingTranslationProvider is required.");
    }
    return translation;
};
