import { createElement, type ComponentProps, type ReactNode } from "react";
import { MeetingTranslationProvider } from "@/client/meeting/hooks/index.ts";
import { renderMeetingPanelLayout } from "@/client/meeting/layout/index.ts";
import { ConviviumMeetingPanel } from "@/client/meeting/panel.tsx";
import type { MeetingPanelLayoutProps } from "@/client/meeting/shared/index.ts";
import {
    en,
    zh,
    type MeetingLocaleKey,
    type MeetingTranslate
} from "@/client/meeting/shared/index.ts";

export const meetingTranslator = (locale: "zh" | "en"): MeetingTranslate => {
    const dictionary = locale === "zh" ? zh : en;
    return (key, params) => {
        const template = dictionary[key as MeetingLocaleKey];
        if (template === undefined) {
            return key;
        }
        return template.replace(/\{([^{}]+)\}/g, (token, name: string) =>
            params?.[name] === undefined ? token : String(params[name])
        );
    };
};

export const withMeetingTranslation = (children: ReactNode, locale: "zh" | "en") =>
    createElement(MeetingTranslationProvider, { t: meetingTranslator(locale) }, children);

export const translatedLayout = (props: MeetingPanelLayoutProps, locale: "zh" | "en") =>
    withMeetingTranslation(renderMeetingPanelLayout(props), locale);

export const translatedPanel = (
    props: ComponentProps<typeof ConviviumMeetingPanel>,
    locale: "zh" | "en"
) => withMeetingTranslation(createElement(ConviviumMeetingPanel, props), locale);
