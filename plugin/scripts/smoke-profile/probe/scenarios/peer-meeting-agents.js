import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { peerCreateCommand, peerSessionId, waitUntil } from "../support.js";

const skillsByRole = {
    meeting_manager: ["meeting-facilitation"],
    domain_architect: ["repository-analysis"],
    runtime_engineer: ["repository-analysis"],
    protocol_ui_engineer: ["repository-analysis"],
    verification_reviewer: ["arxiv", "evidence-review", "github", "repository-analysis"],
    github_research_analyst: ["github"],
    arxiv_research_analyst: ["arxiv"]
};
const abilities = [
    "arxiv",
    "evidence-review",
    "github",
    "meeting-facilitation",
    "repository-analysis"
];
const assertions = [
    "seven-peer-sessions",
    "role-skill-isolation",
    "input-session-independent-delivery",
    "user-control-authorization",
    "github-source",
    "arxiv-source",
    "reviewer-worker",
    "cold-recovery"
];
const bindingHash = (ownership) =>
    createHash("sha256")
        .update(
            JSON.stringify({
                definition: ownership.definition,
                resources: ownership.resources,
                agentOptions: ownership.agentOptions,
                descriptorId: ownership.descriptorId,
                descriptorHash: ownership.descriptorHash
            })
        )
        .digest("hex");
const successfulTools = (agent) => {
    const calls = new Map();
    const completed = [];
    for (const event of agent.session.ownEvents()) {
        if (event.type === "tool/call") calls.set(String(event.data.callId), event.data);
        if (event.type !== "tool/result") continue;
        for (const block of event.data.message?.content ?? []) {
            const call = calls.get(String(block.toolCallId));
            if (!call || block.isError || event.data.error) continue;
            completed.push({
                name: call.name,
                arguments: String(call.arguments),
                output: JSON.stringify(block.content)
            });
        }
    }
    return completed;
};
const observeBindings = async (runtime, meetingId, identities) => {
    const { ctx, assert } = runtime;
    const observed = { sessionIds: {}, presetIds: {}, skills: {} };
    const bindings = {};
    for (const [role, assigned] of Object.entries(skillsByRole)) {
        const identity = identities.find((item) => item.displayName === role);
        assert(identity, "missing peer role " + role);
        const id = peerSessionId(meetingId, identity.id);
        const agent = await runtime.waitForAgent(ctx, id);
        assert(agent.session.header.parentSession === undefined, "peer has a parent");
        const ownership = (
            await ctx
                .get("conviviumMeetingRuntime")
                .findBySessionId(id, new AbortController().signal)
        )?.ownership;
        assert(
            ownership?.identityId === identity.id &&
                ownership.lifecycleStatus === "active" &&
                ownership.capabilityStatus === "active",
            "peer ownership mismatch"
        );
        const snapshot = await ctx.skills.snapshot({
            scope: agent,
            cwd: agent.session.header.cwd,
            signal: new AbortController().signal
        });
        const names = snapshot.skills.map((item) => item.name).sort();
        assert(
            snapshot.complete && JSON.stringify(names) === JSON.stringify(assigned),
            "role skill list differs: " + role
        );
        for (const name of abilities) {
            const loaded = await ctx.skills.get(name, {
                scope: agent,
                cwd: agent.session.header.cwd,
                signal: new AbortController().signal
            });
            assert(
                assigned.includes(name)
                    ? loaded?.invocation?.modelInvocable === true &&
                          loaded.content.trim().length > 0
                    : loaded === undefined,
                "role skill loading differs: " + role + "/" + name
            );
        }
        observed.sessionIds[role] = id;
        observed.presetIds[role] = agent.session.header.agentPreset;
        observed.skills[role] = names;
        bindings[role] = bindingHash(ownership);
        assert(await ctx.sessions.flush(agent.session), "peer flush failed");
    }
    return { observed, bindings };
};
export const runPeerMeetingAgentsScenario = async (runtime) => {
    const { ctx, assert, remote, writeResult } = runtime;
    const checkpointPath = process.env.CONVIVIUM_SMOKE_PEER_CHECKPOINT;
    assert(checkpointPath, "peer checkpoint path missing");
    if (process.env.CONVIVIUM_SMOKE_PHASE === "cold-reopen") {
        const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
        const meetingId = checkpoint.result.meetingId;
        const before = await remote("read", { request: { protocolVersion: 1, meetingId } });
        assert(
            before.version === checkpoint.version && before.lifecycle.status === "paused",
            "cold recovery changed facts"
        );
        const resumed = await remote("control", {
            command: {
                protocolVersion: 1,
                meetingId,
                expectedMeetingVersion: before.version,
                requestId: "peer-cold-resume",
                action: { kind: "resume_meeting", reason: "verify original peer recovery" }
            }
        });
        assert(resumed.kind === "accepted", "cold user resume rejected");
        const recovered = await observeBindings(runtime, meetingId, before.identities);
        assert(
            JSON.stringify(recovered.bindings) === JSON.stringify(checkpoint.bindings),
            "cold resource/options binding changed"
        );
        for (const field of ["sessionIds", "presetIds", "skills"])
            assert(
                JSON.stringify(recovered.observed[field]) ===
                    JSON.stringify(checkpoint.result.observed[field]),
                "cold role identity changed"
            );
        await writeResult({
            ...checkpoint.result,
            observed: { ...checkpoint.result.observed, coldRecovery: true }
        });
        return;
    }
    const command = await peerCreateCommand(
        "peer-create",
        "只读验收：Manager 仅组织一轮 GitHub 与 arXiv 两项来源证据，接受这两位研究员的举手，其他工程角色等待。GitHub 研究员须实际读取 https://github.com/deepseek-ai/deepseek-harness 的固定 tag dsh-v0.1.2-rc.1 源码，核对 package 与 AgentSession 接口；arXiv 研究员须实际读取 https://arxiv.org/abs/1706.03762v7 的摘要/正文并说明读取范围。使用 Host 查询工具，至少保留一个实际内容读取工具结果（不是 echo URL）。分别通过 convivium_submit_evidence 提交含来源、固定版本、实际观察和局限的证据；缺工具或网络如实报告。Reviewer 对两份证据分别运行真实 worker 并提交审核。所有正式交流只经 Meeting Runtime，不做外部写操作。模型发现轮次未开时等待，不提前举手。"
    );
    await runtime.inputSession.dispose();
    assert(!ctx.agents.get(runtime.inputSession.agent.id), "input Session still resident");
    const created = await remote("control", { command });
    assert(created.kind === "accepted", "peer creation rejected: " + JSON.stringify(created));
    const meetingId = created.meetingId;
    const read = () => remote("read", { request: { protocolVersion: 1, meetingId } });
    const initial = await read();
    const { observed, bindings } = await observeBindings(runtime, meetingId, initial.identities);
    assert(new Set(Object.values(observed.sessionIds)).size === 7, "peer sessions overlap");
    await waitUntil(
        () =>
            Object.values(observed.sessionIds).every((id) =>
                runtime
                    .observedMessages(ctx.agents.get(id))
                    .flatMap(runtime.messageTexts)
                    .some((text) => text.includes("meeting_started"))
            ),
        "notice missing after input Session closed"
    );
    const github = await runtime.waitForAgent(ctx, observed.sessionIds.github_research_analyst);
    const arxiv = await runtime.waitForAgent(ctx, observed.sessionIds.arxiv_research_analyst);
    const reviewer = await runtime.waitForAgent(ctx, observed.sessionIds.verification_reviewer);
    const sourceRead = (agent, fragments) =>
        successfulTools(agent).some(
            (call) =>
                !call.name.startsWith("convivium_") &&
                call.name !== "skill" &&
                fragments.every((fragment) => call.arguments.includes(fragment)) &&
                call.output.length > 200
        );
    const research = await waitUntil(
        async () => {
            const view = await read();
            const sourceVersion = (role, fragments) =>
                view.evidencePackages.find(
                    (pkg) =>
                        pkg.authorId ===
                            initial.identities.find((i) => i.displayName === role).id &&
                        pkg.currentVersion.materials.some((material) =>
                            fragments.every((fragment) =>
                                JSON.stringify(material).includes(fragment)
                            )
                        )
                )?.currentVersion;
            const githubVersion = sourceVersion("github_research_analyst", [
                "deepseek-harness",
                "dsh-v0.1.2-rc.1"
            ]);
            const arxivVersion = sourceVersion("arxiv_research_analyst", ["1706.03762", "v7"]);
            const review = view.evidenceReviews.find(
                (item) =>
                    item.versionId === githubVersion?.id || item.versionId === arxivVersion?.id
            );
            return githubVersion &&
                arxivVersion &&
                review &&
                sourceRead(github, ["deepseek-harness", "dsh-v0.1.2-rc.1"]) &&
                sourceRead(arxiv, ["1706.03762"]) &&
                successfulTools(reviewer).some(
                    (call) =>
                        call.name === "convivium_run_review_worker" &&
                        call.output.includes("completed")
                )
                ? { view, review }
                : undefined;
        },
        "real source reads, submitted provenance, or reviewer worker evidence missing",
        600000
    );
    const denied = await runtime.callTargetToolResult(
        ctx,
        github,
        "convivium_create_meeting",
        command,
        runtime.nextCall(),
        { retryUnknown: false }
    );
    assert(
        denied.isError || denied.value?.kind === "rejected",
        "Agent acquired user create control"
    );
    const latest = await read();
    const pause = await remote("control", {
        command: {
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: latest.version,
            requestId: "peer-pause",
            action: { kind: "pause_meeting", reason: "cold recovery checkpoint" }
        }
    });
    assert(pause.kind === "accepted", "reconnected local user pause rejected");
    const result = {
        ok: true,
        scenario: "peer-meeting-agents",
        meetingId,
        assertions,
        observed: {
            ...observed,
            userControl: {
                inputSessionIndependent: true,
                agentRejected: true,
                reconnectedUserAccepted: true
            },
            github: {
                url: "https://github.com/deepseek-ai/deepseek-harness",
                ref: "dsh-v0.1.2-rc.1"
            },
            arxiv: { url: "https://arxiv.org/abs/1706.03762v7", id: "1706.03762", version: "v7" },
            review: { versionId: research.review.versionId, reviewId: research.review.id },
            coldRecovery: false
        }
    };
    await writeFile(
        checkpointPath,
        JSON.stringify({ result, bindings, version: pause.committedVersion }),
        "utf8"
    );
    await writeResult(result);
};
