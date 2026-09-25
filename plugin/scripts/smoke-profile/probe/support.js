export function collectAgentPromptEvidence(observedAgents, observedInboxMessages) {
    return [...observedAgents.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([sessionId]) => ({
            sessionId,
            prompts: (observedInboxMessages.get(sessionId) ?? []).map((message, index) => ({
                index,
                texts: Array.isArray(message.content)
                    ? message.content
                          .filter((part) => part?.type === "text" && typeof part.text === "string")
                          .map((part) => part.text)
                    : typeof message.content === "string"
                      ? [message.content]
                      : [],
                source: message.source ?? null
            }))
        }));
}

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
        const result = await callTargetToolResult(ctx, agent, name, input, index);
        if (result.isError) throw new Error(name + "#" + index + ": " + result.error.message);
        if (result.value?.kind === "rejected")
            throw new Error(name + " rejected: " + JSON.stringify(result.value));
        return result.value;
    }

    async function callTargetToolResult(ctx, agent, name, input, index, options = {}) {
        let result;
        const attempts = options.retryUnknown === false ? 1 : 120;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            result = await ctx.tools.execute({
                callId: "convivium-target-smoke-" + index,
                name,
                arguments: ["convivium_read_meeting", "convivium_run_review_worker"].includes(name)
                    ? { input }
                    : input,
                agent,
                signal: new AbortController().signal
            });
            if (!result.isError || !String(result.error?.message).includes("unknown tool")) break;
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
        return result;
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
        callTargetToolResult,
        createInput,
        writeResult,
        observedMessages,
        messageTexts
    };
}

export const stablePeerId = (kind, meetingId, key) => {
    const crypto = process.getBuiltinModule("node:crypto");
    return `${kind}-${crypto
        .createHash("sha256")
        .update(JSON.stringify([meetingId, kind, key]))
        .digest("hex")
        .slice(0, 32)}`;
};
export const peerSessionId = (meetingId, identityId) =>
    stablePeerId("meeting_agent_session", meetingId, identityId);
export const peerCreateCommand = async (requestId, statement) => {
    const fs = process.getBuiltinModule("node:fs/promises");
    const path = process.getBuiltinModule("node:path");
    const definitions = JSON.parse(
        await fs.readFile(
            path.join(process.env.CONVIVIUM_MEETING_ROLES_ROOT, "definitions.json"),
            "utf8"
        )
    ).definitions;
    return {
        protocolVersion: 1,
        meetingId: "new",
        expectedMeetingVersion: 0,
        requestId,
        action: {
            kind: "create_meeting",
            objective: {
                statement,
                requiredOutputs: [],
                acceptanceCriteria: [],
                hardConstraints: [],
                acceptableRiskLevel: "low"
            },
            identities: definitions.map((d) => ({
                identityKey: d.roleDefinitionId,
                definitionId: d.agentDefinitionId,
                definitionVersion: d.definitionVersion,
                displayName: d.roleDefinitionId,
                roles: [
                    d.roleDefinitionId === "meeting_manager"
                        ? "manager"
                        : d.roleDefinitionId === "verification_reviewer"
                          ? "evidence_reviewer"
                          : "contributor"
                ],
                agendaResponsibilityIds: ["agenda"],
                riskAuthority: false,
                required: true
            })),
            managerIdentityKey: "meeting_manager",
            evidenceReviewerIdentityKey: "verification_reviewer",
            initialAgenda: [
                { id: "agenda", title: statement, question: statement, requiredOutputIds: [] }
            ],
            initialActiveAgendaId: "agenda",
            limits: {
                maxFormalMessages: 100,
                maxDurationMs: 900000,
                taskDeadlineMs: 300000,
                reviewDeadlineMs: 180000
            }
        }
    };
};
export const waitUntil = async (check, message, timeout = 300000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const result = await check();
        if (result) return result;
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(message);
};
