import type { Agent } from "@deepseek-ai/dsh-agent";
import type {
    ContinuableStart,
    ContinuableStartSpec,
    SubagentProvider
} from "@deepseek-ai/dsh-subagent";
import type { SessionId } from "@deepseek-ai/dsh-session";
import { encodeMeetingSessionLabel } from "./labels.js";
import {
    createSessionProvisioningEnvelope,
    serializeSessionProvisioningEnvelope
} from "./provisioning.js";

export interface SubagentProviderRegistry {
    getProvider(name: string): SubagentProvider | undefined;
}

/**
 * Resolves the explicitly configured provider without creating or preparing a
 * child Session. Continuable creation remains restricted to later adapter
 * methods and profile smoke tests.
 */
export function requireContinuableProvider(
    providers: SubagentProviderRegistry,
    providerName: string
): SubagentProvider {
    const provider = providers.getProvider(providerName);
    if (provider === undefined) {
        throw new Error(
            `Convivium requires continuable subagent provider "${providerName}" ` +
                "from the host DSH 0.1.1-rc.2 profile; it is not registered."
        );
    }
    if (typeof provider.prepareContinuable !== "function") {
        throw new Error(
            `Convivium requires provider "${providerName}" to implement prepareContinuable() ` +
                "in the host DSH 0.1.1-rc.2 profile."
        );
    }
    return provider;
}

export interface ContinuableStarter {
    startContinuable(spec: ContinuableStartSpec): Promise<ContinuableStart>;
}

export interface StartManagerSessionInput {
    readonly runtime: ContinuableStarter;
    readonly provider: string;
    readonly parent: Agent;
    readonly childId: SessionId;
    readonly teamId: string;
    readonly meetingId: string;
    readonly signal: AbortSignal;
}

export async function startManagerSession(
    input: StartManagerSessionInput
): Promise<ContinuableStart> {
    const label = encodeMeetingSessionLabel({
        role: "manager",
        teamId: input.teamId,
        meetingId: input.meetingId
    });
    const prompt: ContinuableStartSpec["request"]["prompt"] = [
        {
            type: "text",
            text: serializeSessionProvisioningEnvelope(
                createSessionProvisioningEnvelope({
                    role: "manager",
                    teamId: input.teamId,
                    meetingId: input.meetingId
                })
            )
        }
    ];
    const started = await input.runtime.startContinuable({
        provider: input.provider,
        label,
        childId: input.childId,
        request: { parent: input.parent, prompt },
        signal: input.signal
    });
    if (started.childId !== input.childId) {
        throw new Error(
            "Continuable provider returned a Manager childId different from ownership."
        );
    }
    return started;
}
