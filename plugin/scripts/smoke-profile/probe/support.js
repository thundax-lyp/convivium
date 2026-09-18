export function createProbeSupport(outputPath) {
    function assert(condition, message) {
        if (!condition) throw new Error(message);
    }

    async function callTool(ctx, agent, name, input, index) {
        const result = await ctx.tools.execute({
            callId: "convivium-smoke-" + index,
            name,
            arguments: { input },
            agent,
            signal: new AbortController().signal
        });
        if (result.isError) throw new Error(name + "#" + index + ": " + result.error.message);
        if (!result.value?.ok) throw new Error(name + " failed: " + JSON.stringify(result.value));
        return result.value;
    }

    async function callTargetTool(ctx, agent, name, input, index) {
        let result;
        for (let attempt = 0; attempt < 120; attempt += 1) {
            result = await ctx.tools.execute({
                callId: "convivium-target-smoke-" + index,
                name,
                arguments: { input },
                agent,
                signal: new AbortController().signal
            });
            if (!result.isError || !String(result.error?.message).includes("unknown tool")) break;
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (result.isError) throw new Error(name + "#" + index + ": " + result.error.message);
        if (result.value?.kind === "rejected")
            throw new Error(name + " rejected: " + JSON.stringify(result.value));
        return result.value;
    }

    function createInput() {
        return {
            protocolVersion: 1,
            requestId: "smoke-create-1",
            teamId: "smoke-team",
            topic: "Runtime smoke",
            objective: "Verify Convivium tool sequencing",
            selectionMode: "manager",
            objectiveContract: {
                requiredOutputs: [],
                acceptanceCriteria: [{ key: "smoke-order", description: "A/C/B committed" }],
                hardConstraints: [],
                requiredReviewerKeys: [],
                riskAcceptanceAuthorityKeys: [],
                acceptableRiskLevel: "low"
            },
            agenda: [
                {
                    key: "agenda-1",
                    title: "Smoke order",
                    objective: "Commit A then C then B",
                    inScope: ["tool execution"],
                    outOfScope: ["Meeting HTTP route"],
                    completionCriteria: ["smoke-order"],
                    requiredParticipantKeys: ["a", "b", "c"]
                }
            ],
            participants: [
                { participantKey: "a", displayName: "A" },
                { participantKey: "b", displayName: "B" },
                { participantKey: "c", displayName: "C" }
            ]
        };
    }

    async function writeResult(value) {
        if (!outputPath) return;
        const fs = await import("node:fs/promises");
        const tempPath = outputPath + ".tmp";
        await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
        await fs.rename(tempPath, outputPath);
    }

    function observedMessages(agent, observedInboxMessages = new Map()) {
        return [
            ...(agent.inbox.nextTurn ?? []),
            ...(agent.inbox.nextStep ?? []),
            ...(observedInboxMessages.get(String(agent.id)) ?? [])
        ];
    }

    function messageTexts(message) {
        if (!Array.isArray(message.content)) {
            return typeof message.content === "string" ? [message.content] : [];
        }
        return message.content
            .filter((part) => part?.type === "text" && typeof part.text === "string")
            .map((part) => part.text);
    }

    return {
        assert,
        callTool,
        callTargetTool,
        createInput,
        writeResult,
        observedMessages,
        messageTexts
    };
}
