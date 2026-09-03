export function validateColdCheckpoint(value) {
    if (value === null || typeof value !== "object") {
        throw new Error("Cold checkpoint must be an object.");
    }
    const stringFields = [
        "captainSessionId",
        "meetingId",
        "managerSessionId",
        "participantSessionId",
        "managerPlanningAttemptId"
    ];
    if (value.schemaVersion !== 1 || value.scenario !== "cold-rebind" || value.phase !== 1) {
        throw new Error("Cold checkpoint constants are invalid.");
    }
    if (!Number.isInteger(value.hostPid) || value.hostPid <= 0) {
        throw new Error("Cold checkpoint hostPid is invalid.");
    }
    if (!Number.isInteger(value.meetingVersion) || value.meetingVersion < 0) {
        throw new Error("Cold checkpoint meetingVersion is invalid.");
    }
    if (
        !Number.isInteger(value.managerPlanningMeetingVersion) ||
        value.managerPlanningMeetingVersion !== value.meetingVersion
    ) {
        throw new Error("Cold checkpoint planning version is invalid.");
    }
    for (const field of stringFields) {
        if (typeof value[field] !== "string" || value[field] === "") {
            throw new Error(`Cold checkpoint ${field} is invalid.`);
        }
    }
    if (value.captainSessionId !== "convivium-smoke-captain") {
        throw new Error("Cold checkpoint Captain Session is invalid.");
    }
    if (
        !Array.isArray(value.sessionIds) ||
        value.sessionIds.length !== 2 ||
        value.sessionIds[0] !== value.managerSessionId ||
        value.sessionIds[1] !== value.participantSessionId
    ) {
        throw new Error("Cold checkpoint child Session IDs are invalid.");
    }
    if (
        !Array.isArray(value.transcriptMessageIds) ||
        value.transcriptMessageIds.length === 0 ||
        value.transcriptMessageIds.some((id) => typeof id !== "string" || id === "")
    ) {
        throw new Error("Cold checkpoint transcript IDs are invalid.");
    }
    return Object.freeze({
        ...value,
        sessionIds: Object.freeze([...value.sessionIds]),
        transcriptMessageIds: Object.freeze([...value.transcriptMessageIds])
    });
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

    async function callHttp(url, options) {
        const response = await fetch(url, options);
        assert(
            response.status === 200,
            "unexpected HTTP status for " + url + ": " + response.status
        );
        assert(
            response.headers.get("content-type")?.startsWith("application/json") === true,
            "unexpected HTTP content type for " + url
        );
        return response.json();
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

    function messageText(message) {
        return Array.isArray(message.content)
            ? message.content.find((part) => part.type === "text")?.text
            : message.content;
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
        callHttp,
        createInput,
        writeResult,
        observedMessages,
        messageText,
        messageTexts
    };
}
