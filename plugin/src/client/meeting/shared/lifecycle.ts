import type { MeetingView } from "@/protocol/index.ts";
import type { MeetingLocaleKey, MeetingTranslate } from "./locales.ts";

const lifecycleKeys: Record<MeetingView["lifecycle"]["status"], MeetingLocaleKey> = {
    preparing: "enum.lifecycle.preparing",
    running: "enum.lifecycle.running",
    paused: "enum.lifecycle.paused",
    converging: "enum.lifecycle.converging",
    ending: "enum.lifecycle.ending",
    terminal: "enum.lifecycle.terminal",
    archiving: "enum.lifecycle.archiving",
    archived: "enum.lifecycle.archived"
};

export const lifecycleLabel = (
    status: MeetingView["lifecycle"]["status"],
    t: MeetingTranslate
): string => t(lifecycleKeys[status]);
