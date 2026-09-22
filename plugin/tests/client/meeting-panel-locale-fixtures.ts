import { en, zh, type MeetingLocaleKey, type MeetingTranslate } from "@/client/locales.js";

export function meetingTranslator(locale: "zh" | "en"): MeetingTranslate {
    const dictionary = locale === "zh" ? zh : en;
    return (key, params) => {
        const template = dictionary[key as MeetingLocaleKey];
        if (template === undefined) return key;
        return template.replace(/\{([^{}]+)\}/g, (token, name: string) =>
            params?.[name] === undefined ? token : String(params[name])
        );
    };
}
