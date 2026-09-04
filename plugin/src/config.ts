import Schema from "@deepseek-ai/schemastery";

const relativeDataRoot = /^(?!\/)(?![A-Za-z]:[\\/])(?!.*(?:^|[\\/])\.\.(?:[\\/]|$))[^\0]+$/;

export interface Config {
    provider: string;
    dataRoot?: string;
    developerMarkdownWorkspaceId?: string;
    maxParticipants: number;
    speakerTimeoutMs: number;
    outboxPollMs: number;
}

export const Config: Schema<Config> = Schema.object({
    provider: Schema.string().pattern(/\S/).required(),
    dataRoot: Schema.string().pattern(relativeDataRoot),
    developerMarkdownWorkspaceId: Schema.string().pattern(/\S/),
    maxParticipants: Schema.natural().min(3).max(32).default(3),
    speakerTimeoutMs: Schema.natural().min(1).max(300_000).default(60_000),
    outboxPollMs: Schema.natural().min(1).max(60_000).default(1_000)
});
