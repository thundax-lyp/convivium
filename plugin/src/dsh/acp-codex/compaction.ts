import { BasicCompactionEngine } from "@deepseek-ai/dsh-compaction-basic";
import { LlmError } from "@deepseek-ai/dsh-llm";

/** The Preset owns this sole backend; each call retains its actual Agent identity. */
export class CodexCompactionBoundary extends BasicCompactionEngine {
    override async compactIfNeeded(
        ...args: Parameters<BasicCompactionEngine["compactIfNeeded"]>
    ): ReturnType<BasicCompactionEngine["compactIfNeeded"]> {
        if (args[0].options.provider === "acp-codex") {
            return null;
        }
        return super.compactIfNeeded(...args);
    }

    override async compactNow(
        ...args: Parameters<BasicCompactionEngine["compactNow"]>
    ): ReturnType<BasicCompactionEngine["compactNow"]> {
        if (args[0].options.provider === "acp-codex") {
            throw new LlmError(
                "ACP Session compaction is unsupported",
                "ACP_CODEX_UNSUPPORTED_REQUEST"
            );
        }
        return super.compactNow(...args);
    }

    override async compactRegion(
        ...args: Parameters<BasicCompactionEngine["compactRegion"]>
    ): ReturnType<BasicCompactionEngine["compactRegion"]> {
        if (args[2].options.provider === "acp-codex") {
            throw new LlmError(
                "ACP Session compaction is unsupported",
                "ACP_CODEX_UNSUPPORTED_REQUEST"
            );
        }
        return super.compactRegion(...args);
    }
}
export default CodexCompactionBoundary;
