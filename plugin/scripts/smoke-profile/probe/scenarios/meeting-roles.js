import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { foldSubagentDescriptor } from "@deepseek-ai/dsh-subagent";

async function bounded(milliseconds, operation) {
    const controller = new AbortController();
    let timer;
    try {
        return await Promise.race([
            operation(controller.signal),
            new Promise((_resolve, reject) => {
                timer = setTimeout(() => {
                    const error = new Error("Meeting roles probe timed out");
                    controller.abort(error);
                    reject(error);
                }, milliseconds);
            })
        ]);
    } finally {
        clearTimeout(timer);
    }
}

function loadedSkill(events, skillName, methods, sentAt, previousSeq, assert) {
    const calls = new Map();
    let loadedSeq;
    for (const event of events) {
        if (event.seq <= previousSeq || event.time < sentAt) continue;
        if (event.type === "tool/call" && event.data.name === "skill") {
            let args;
            try {
                args = JSON.parse(event.data.arguments);
            } catch {
                continue;
            }
            if (args.name === skillName) calls.set(event.data.callId, event.seq);
        }
        if (event.type === "tool/result") {
            for (const block of event.data.message.content) {
                if (block.type !== "tool-result" || !calls.has(block.toolCallId)) continue;
                assert(
                    !block.isError && !event.data.error,
                    "Native Skill loading failed: " + skillName
                );
                const text = block.content
                    .filter((b) => b.type === "text")
                    .map((b) => b.text)
                    .join("\n");
                assert(
                    methods.every((method) => text.includes(method)),
                    "Native Skill methods missing: " + skillName
                );
                assert(event.seq > calls.get(block.toolCallId), "Skill result preceded its call");
                loadedSeq = event.seq;
            }
        }
        if (
            loadedSeq !== undefined &&
            event.seq > loadedSeq &&
            event.type === "assistant/message" &&
            !event.data.interrupted
        ) {
            const text = event.data.message.content
                .filter((b) => b.type === "text")
                .map((b) => b.text)
                .join("\n");
            if (/\bROLE_READY\b/.test(text)) return true;
        }
    }
    return false;
}

export async function runMeetingRolesScenario(runtime) {
    const { ctx, assert } = runtime;
    const captain = runtime.captain.agent;
    const assetRoot = process.env.CONVIVIUM_MEETING_ROLES_ROOT;
    assert(assetRoot, "Missing tarball role asset root");
    const { definitions } = JSON.parse(await readFile(join(assetRoot, "definitions.json"), "utf8"));
    assert(definitions.length === 9, "Expected nine deployed definitions");
    assert(
        ctx.agentPresets.composedPreset(captain.ctx) === "convivium",
        "Captain did not mount convivium"
    );
    const call = (agent, name, input) =>
        runtime.callTool(ctx, agent, name, input, runtime.nextCall());
    const input = structuredClone(runtime.createInput());
    input.managerAgentDefinitionId = "convivium.meeting_manager";
    input.participants = definitions
        .filter((d) => d.roleDefinitionId !== "meeting_manager")
        .map((d) => ({
            participantKey: d.roleDefinitionId,
            displayName: d.displayName,
            agentDefinitionId: d.agentDefinitionId
        }));
    input.agenda[0].requiredParticipantKeys = input.participants.map((p) => p.participantKey);
    const created = await call(captain, "convivium_create_meeting", input);
    const meetingId = created.result.meetingId;
    runtime.setMeetingId(meetingId);
    assert(created.result.participants.length === 8, "Expected eight created Participants");
    const identities = definitions.map((definition) => {
        if (definition.roleDefinitionId === "meeting_manager")
            return { definition, sessionId: `${meetingId}-manager-manager` };
        const matches = created.result.participants.filter(
            (p) => p.participantKey === definition.roleDefinitionId
        );
        assert(
            matches.length === 1 &&
                matches[0].participantId === `participant-${definition.roleDefinitionId}`,
            "Canonical Participant mapping changed"
        );
        return { definition, sessionId: `${meetingId}-participant-${matches[0].participantId}` };
    });
    const children = await ctx.subagents.listChildren(
        captain.session.id,
        new AbortController().signal
    );
    assert(
        children.length === 9 &&
            new Set(children.map((c) => c.id)).size === 9 &&
            identities.every(({ sessionId }) =>
                children.some((c) => c.id === sessionId && c.mode === "continuable")
            ),
        "Nine independent continuable children missing"
    );
    const read = () => call(captain, "convivium_meeting_status", { protocolVersion: 1, meetingId });
    const initial = await read();
    await call(captain, "convivium_pause_meeting", {
        protocolVersion: 1,
        meetingId,
        expectedMeetingVersion: initial.meetingVersion,
        requestId: "meeting-roles-pause",
        reason: "Verify deployed roles without formal writes"
    });
    await bounded(30000, async () => {
        const residents = identities
            .map(({ sessionId }) => ctx.agents.get(sessionId))
            .filter(Boolean);
        for (const { sessionId } of identities)
            ctx.subagents.interrupt(sessionId, { kind: "ancestor", agent: captain });
        await Promise.all(residents.map((agent) => agent.whenIdle()));
    });
    const paused = await read();
    assert(paused.result.status === "paused", "Meeting did not pause");
    const skillLoads = [];
    const agents = new Map();
    for (const { definition, sessionId } of identities) {
        const skillName = definition.requiredSkillNames[0];
        const body = await readFile(
            join(assetRoot, "presets/convivium/skills", skillName, "SKILL.md"),
            "utf8"
        );
        const methods = [...body.matchAll(/^\d\. (.+)$/gm)].map((match) => match[1]);
        assert(methods.length === 4, "Deployed Skill must contain four methods");
        await bounded(180000, async (signal) => {
            const previous = ctx.sessions.get(sessionId);
            const previousSeq = previous
                ? Math.max(-1, ...[...previous.ownEvents()].map((event) => event.seq))
                : -1;
            const sentAt = Date.now();
            await ctx.subagents.sendMessage(
                captain,
                sessionId,
                [
                    {
                        type: "text",
                        text: "本次只验证角色部署。先调用 skill 加载你的 required Skill，成功后回复 ROLE_READY，不执行正式会议操作或修改文件。"
                    }
                ],
                { signal }
            );
            const agent = await runtime.waitForAgent(ctx, sessionId);
            agents.set(definition.roleDefinitionId, agent);
            const descriptor = foldSubagentDescriptor(agent.session.ownEvents());
            const persona =
                definition.roleDescription +
                "\n\n开始处理会议任务前，调用 DSH 原生 skill 工具依次加载：" +
                definition.requiredSkillNames.join("、") +
                "。加载失败时报告缺失能力，不以角色描述代替 Skill。Skill 不授予会议权限，Runtime 的当前身份和 capability 判定优先。";
            assert(
                descriptor?.persona === persona,
                "Child persona differs from deployed role: " + definition.roleDefinitionId
            );
            while (
                !loadedSkill(
                    agent.session.ownEvents(),
                    skillName,
                    methods,
                    sentAt,
                    previousSeq,
                    assert
                )
            ) {
                signal.throwIfAborted();
                await new Promise((resolveWait) => setTimeout(resolveWait, 100));
            }
            await agent.whenIdle();
        });
        skillLoads.push({
            roleDefinitionId: definition.roleDefinitionId,
            skillName,
            sessionId,
            loaded: true
        });
    }
    const execute = (agent, name, args) =>
        ctx.tools.execute({
            callId: "meeting-roles-" + runtime.nextCall(),
            name,
            arguments: args,
            agent,
            signal: new AbortController().signal
        });
    const research = [];
    for (const [roleDefinitionId, domain, query, url] of [
        [
            "github_research_analyst",
            "github.com",
            "site:github.com/deepseek-ai/deepseek-harness",
            "https://github.com/deepseek-ai/deepseek-harness"
        ],
        [
            "arxiv_research_analyst",
            "arxiv.org",
            "site:arxiv.org Attention Is All You Need",
            "https://arxiv.org/abs/1706.03762"
        ],
        [
            "web_research_analyst",
            "typescriptlang.org",
            "site:typescriptlang.org documentation",
            "https://www.typescriptlang.org/docs/"
        ]
    ]) {
        const agent = agents.get(roleDefinitionId);
        const search = await execute(agent, "web_search", { queries: [query] });
        assert(
            search.isError === false &&
                search.value.sources.some((source) => {
                    const hostname = new URL(source.url).hostname;
                    return hostname === domain || hostname.endsWith("." + domain);
                }),
            "Research search failed: " + roleDefinitionId
        );
        const fetched = await execute(agent, "web_fetch", { url });
        assert(
            fetched.isError === false &&
                fetched.value.statusCode >= 200 &&
                fetched.value.statusCode < 300 &&
                typeof fetched.value.body.content === "string" &&
                fetched.value.body.content.trim().length > 0,
            "Research fetch failed: " + roleDefinitionId
        );
        research.push({ roleDefinitionId, search: true, fetch: true });
    }
    for (const [role, forbidden] of [
        ["meeting_manager", "convivium_submit_turn"],
        ["meeting_scribe", "convivium_submit_manager_plan"]
    ]) {
        const agent = agents.get(role);
        assert(
            ctx.tools.schemas(agent).some((schema) => schema.name === "skill"),
            "Restricted role lost native Skill loader"
        );
        for (const [name, args] of [
            [forbidden, { input: {} }],
            ["web_search", { queries: ["deployment restriction probe"] }]
        ]) {
            const result = await execute(agent, name, args);
            assert(
                result.isError === true && result.error.code === "UNKNOWN_TOOL",
                "Role tool was not denied at lookup: " + role + "/" + name
            );
        }
    }
    for (const agent of agents.values())
        await call(agent, "convivium_meeting_status", { protocolVersion: 1, meetingId });
    const after = await read();
    assert(
        after.result.status === "paused" &&
            after.meetingVersion === paused.meetingVersion &&
            isDeepStrictEqual(after.result.messages, paused.result.messages),
        "Deployment probes changed formal Meeting state"
    );
    await runtime.writeResult({
        ok: true,
        scenario: "meeting-roles",
        assertions: [
            "shared-preset-mounted",
            "nine-independent-sessions",
            "nine-native-skills-loaded",
            "research-tools-operational",
            "meeting-authority-preserved"
        ],
        observed: {
            presetId: "convivium",
            definitionCount: 9,
            participantCount: 8,
            skillLoads,
            research,
            deniedMeetingWrites: 2,
            deniedPresetTools: 2
        }
    });
}
