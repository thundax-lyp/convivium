import type { Agent } from "@deepseek-ai/dsh-agent";

export interface CaptainParentBinding {
    readonly kind: "captain";
    readonly sessionId: string;
}

function sessionIdOf(agent: Agent): string {
    return String(agent.id);
}

export function bindCaptainParent(agent: Agent): CaptainParentBinding {
    return { kind: "captain", sessionId: sessionIdOf(agent) };
}
