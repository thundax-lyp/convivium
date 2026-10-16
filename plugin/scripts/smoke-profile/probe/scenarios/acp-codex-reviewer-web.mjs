import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { readMeetingOutboxForAcceptance } from "@convivium/dsh-plugin";
import { peerCreateCommand, peerSessionId, waitUntil } from "../support.mjs";

const roles = [
    "meeting_manager",
    "verification_reviewer",
    "github_research_analyst",
    "arxiv_research_analyst",
    "web_research_analyst"
];
const domains = ["agentclientprotocol.com", "deepseek-harness.github.io"];
const hash = (text) => createHash("sha256").update(text).digest("hex");
const argsOf = (call) => call.arguments?.output ?? call.arguments?.input ?? call.arguments;
const valueOf = (call) => {
    if (call.value && typeof call.value === "object") {
        return call.value;
    }
    const text = call.content?.find((part) => part.type === "text")?.text;
    if (!text) {
        return undefined;
    }
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
};
const collectWeb = (runtime, view, webId, calls) => {
    const sources = [];
    const blockedSources = [];
    const webAgent =
        runtime.ctx.agents.get(webId) ??
        runtime.observedAgents().find((agent) => String(agent.id) === webId);
    runtime.assert(webAgent, "Original Web Session unavailable for event inspection");
    const sessionEvents = webAgent.session.snapshotEvents();
    const originalCalls = new Map(
        sessionEvents
            .filter((event) => event.type === "tool/call")
            .map((event) => [event.data.callId, event.data])
    );
    const originalFailures = sessionEvents
        .filter(
            (event) =>
                event.type === "tool/result" &&
                event.data.message.isError &&
                event.data.error?.code === "WEB_BLOCKED_URL"
        )
        .map((event) => {
            const original = originalCalls.get(event.data.message.toolCallId);
            return {
                sessionId: webId,
                name: original?.name,
                at: event.time,
                arguments:
                    typeof original?.arguments === "string"
                        ? JSON.parse(original.arguments)
                        : original?.arguments,
                isError: true,
                errorCode: event.data.error.code,
                content: event.data.message.content
            };
        });
    let searchCalls = 0;
    for (let index = 0; index < view.rounds.length; index++) {
        const round = view.rounds[index];
        const next = view.rounds[index + 1]?.openedAt ?? Infinity;
        const records = [...calls, ...originalFailures].filter(
            (call) => call.sessionId === webId && call.at >= round.openedAt && call.at < next
        );
        const searches = records.filter((call) => /search/.test(call.name) && !call.isError);
        runtime.assert(
            searches.length > 0,
            "Web did not perform a real search in round " + round.id
        );
        searchCalls += searches.length;
        const version = view.evidencePackages.find(
            (item) =>
                item.roundId === round.id &&
                item.authorId ===
                    view.identities.find(
                        (identity) => identity.displayName === "web_research_analyst"
                    ).id
        )?.currentVersion;
        runtime.assert(version, "Web evidence missing for round " + round.id);
        for (const domain of domains) {
            const fetch = records.find((call) => {
                if (!/fetch/.test(call.name) || call.at < searches[0].at) {
                    return false;
                }
                const value = valueOf(call);
                try {
                    return (
                        new URL(value?.url ?? argsOf(call)?.url).hostname === domain &&
                        value?.statusCode >= 200 &&
                        value.statusCode < 300 &&
                        typeof value.body?.content === "string" &&
                        value.body.content.length > 200
                    );
                } catch {
                    return false;
                }
            });
            if (!fetch) {
                const blocked = records.find((call) => {
                    try {
                        return (
                            /fetch/.test(call.name) &&
                            call.at >= searches[0].at &&
                            new URL(argsOf(call)?.url).hostname === domain &&
                            call.isError === true &&
                            call.errorCode === "WEB_BLOCKED_URL" &&
                            call.content?.some(
                                (part) =>
                                    part.type === "text" &&
                                    part.text.includes("resolves to a non-public IP address")
                            )
                        );
                    } catch {
                        return false;
                    }
                });
                runtime.assert(
                    blocked,
                    "Web body or exact environment rejection missing for " + domain + "/" + round.id
                );
                blockedSources.push({
                    roundId: round.id,
                    url: argsOf(blocked).url,
                    errorCode: "WEB_BLOCKED_URL",
                    reason: blocked.content.find(
                        (part) =>
                            part.type === "text" &&
                            part.text.includes("resolves to a non-public IP address")
                    ).text
                });
                continue;
            }
            const value = valueOf(fetch);
            const url = value.url ?? argsOf(fetch).url;
            const material = version.materials.find((item) => JSON.stringify(item).includes(url));
            runtime.assert(
                material,
                "Web submitted provenance does not reference actual fetch URL"
            );
            const searchSource = searches
                .flatMap((call) => valueOf(call)?.sources ?? [])
                .find((source) => source.url === url);
            const title =
                searchSource?.title ??
                value.body.content.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
            runtime.assert(
                typeof title === "string" && title.length > 0,
                "Actual source title unavailable"
            );
            sources.push({
                roundId: round.id,
                url,
                title,
                publishedAt: searchSource?.publishedAt ?? "unknown",
                accessedAt: new Date(fetch.at).toISOString(),
                contentSha256: hash(value.body.content)
            });
        }
    }
    return { searchCalls, sources, blockedSources };
};

export const runAcpCodexReviewerWebScenario = async (runtime) => {
    const { ctx, assert, remote, writeResult, acpEvents, reviewEvidence, toolEvidence } = runtime;
    const checkpointPath = process.env.CONVIVIUM_SMOKE_PEER_CHECKPOINT;
    const selection = JSON.parse(process.env.CONVIVIUM_ACP_CODEX_SELECTION);
    const cold = process.env.CONVIVIUM_SMOKE_PHASE === "cold-reopen";
    const checkpoint = cold ? JSON.parse(await readFile(checkpointPath, "utf8")) : undefined;
    let meetingId = checkpoint?.meetingId;
    const read = () => remote("read", { request: { protocolVersion: 1, meetingId } });
    const control = async (action, requestId) => {
        const view = await read();
        const result = await remote("control", {
            command: {
                protocolVersion: 1,
                meetingId,
                expectedMeetingVersion: view.version,
                requestId,
                action
            }
        });
        assert(result.kind === "accepted", "User control rejected: " + JSON.stringify(result));
        return result;
    };
    if (!cold) {
        const command = await peerCreateCommand(
            "acp-codex-web-create-" + randomUUID(),
            "DSH通过ACP连接外部Agent的公开机制、权限和恢复边界。真实验收：五身份只做两轮，每轮 GitHub/arXiv/Web 各尝试提交一份真实证据，不额外修订。单人超时按 Runtime 记录退出，不阻塞其他有效贡献；对全部实际提交的 Evidence 审核，允许按原机制发布超时事实并继续收口。Manager 每轮邀请并接纳全部三位 Contributor；第一轮聚焦公开机制，发布后等待用户暂停/冷恢复/继续，不能提前开第二轮或结束。恢复继续后第二轮聚焦权限和恢复边界，发布后正常结束并归档。GitHub/arXiv 保留实际读取来源和局限，不捏造结论。Web 每轮必须在开轮后实际调用 Host Web search，再调用 Host Web fetch 读取 https://agentclientprotocol.com/protocol/v1/session-setup 和 https://deepseek-harness.github.io/deepseek-harness/en/reference/ 两域正文，材料记录真实 URL/标题/时间和局限；不能只 echo URL 或搜索摘要。ACP Reviewer 和 worker 只使用自身原生工具和 Skills；宿主为每份 evidence 启动独立 worker，校验完整 JSON 并提交合法审核，不要求 ACP 调用 Convivium 工具或 Skills。所有正式交流经 Meeting Runtime。权限/网络失败如实报告，不绕过控制。底层非公网 DNS 拒绝属于环境未覆盖，保留真实失败及局限后继续会议职责，不声称正文读取成功。"
        );
        assert(
            command.action.participantRoleNames.length === 3,
            "ACP scenario must create five identities"
        );
        const created = await remote("control", { command });
        assert(
            created.kind === "accepted",
            "ACP meeting creation rejected: " + JSON.stringify(created)
        );
        meetingId = created.meetingId;
        await runtime.inputSession.dispose();
    } else {
        const paused = await read();
        assert(
            paused.lifecycle.status === "paused" && paused.version === checkpoint.version,
            "Cold reopen changed paused facts"
        );
        assert(paused.publications.length === 1, "Cold checkpoint is not exactly one publication");
        await control(
            {
                kind: "resume_meeting",
                reason: "continue second real ACP/Web round after original binding load"
            },
            "acp-cold-resume-" + randomUUID()
        );
    }
    const initial = await read();
    const sessionIds = {};
    for (const role of roles) {
        const identity = initial.identities.find((item) => item.displayName === role);
        assert(identity, "Missing identity: " + role);
        const id = peerSessionId(meetingId, identity.id);
        const agent = await runtime.waitForAgent(ctx, id);
        assert(
            agent.session.header.parentSession === undefined,
            "Meeting identity is not an independent root"
        );
        sessionIds[role] = id;
        if (role === "verification_reviewer") {
            assert(
                agent.options.provider === "acp-codex" && agent.options.model === selection.model,
                "Reviewer model binding mismatch"
            );
        }
    }
    assert(new Set(Object.values(sessionIds)).size === 5, "Meeting Sessions overlap");
    if (cold) {
        assert(
            JSON.stringify(sessionIds) === JSON.stringify(checkpoint.sessionIds),
            "Cold Session IDs changed"
        );
    }
    const reviewerId = sessionIds.verification_reviewer;
    const webId = sessionIds.web_research_analyst;
    const events = () => [...(checkpoint?.events ?? []), ...acpEvents];
    const reviews = () => [...(checkpoint?.reviewEvidence ?? []), ...reviewEvidence];
    const calls = () => [...(checkpoint?.calls ?? []), ...toolEvidence.values()];
    const settled = async () => {
        const agent = ctx.agents.get(reviewerId);
        if (agent) {
            await agent.whenIdle();
        }
        const current = events();
        const deliveries = [
            ...new Set(
                current
                    .filter(
                        (event) =>
                            event.sessionId === reviewerId && event.phase === "delivery-completed"
                    )
                    .map((event) => event.deliveryId)
            )
        ];
        if (
            deliveries.length === 0 ||
            !current.some((event) => event.sessionId === reviewerId && event.phase === "committed")
        ) {
            return false;
        }
        return readMeetingOutboxForAcceptance({
            storageDomain: ctx.storageDomain,
            meetingId,
            deliveryIds: deliveries
        }).every((item) => item.status === "delivered");
    };
    const published = await waitUntil(
        async () => {
            const view = await read();
            assert(
                !view.executionBlocks?.length,
                "ACP execution blocked: " + JSON.stringify(view.executionBlocks)
            );
            assert(
                view.rounds.length <= (cold ? 2 : 1),
                "Manager exceeded current stage round boundary"
            );
            return view.publications.length === (cold ? 2 : 1) ? view : undefined;
        },
        "Real ACP/Web round publication did not complete",
        1800000
    );
    const accepted = reviews().filter((event) => event.rootSessionId === reviewerId);
    const expected = published.evidencePackages.length;
    assert(
        published.rounds.every((round) =>
            published.evidencePackages.some((item) => item.roundId === round.id)
        ),
        "A published round has no real Evidence"
    );
    assert(accepted.length === expected, "Wrong number of Host-validated native reviews");
    assert(
        new Set(accepted.map((event) => event.versionId)).size === expected,
        "Repeated or missing review version"
    );
    assert(
        new Set(accepted.map((event) => event.workerSessionId)).size === expected,
        "Replacement or reused review worker"
    );
    assert(
        accepted.every(
            (event) =>
                event.provider === "acp-codex" &&
                event.model === selection.model &&
                event.parentSession === reviewerId &&
                events().some(
                    (checkpoint) =>
                        checkpoint.sessionId === event.workerSessionId &&
                        checkpoint.rootSessionId === reviewerId &&
                        checkpoint.phase === "committed"
                )
        ),
        "Native worker parent/model/receipt differs"
    );
    assert(
        calls().every((call) => call.provider !== "acp-codex"),
        "ACP Agent invoked a DSH tool"
    );
    assert(
        published.evidenceReviews.length === expected &&
            published.evidenceReviews.every((review) =>
                accepted.some(
                    (event) => event.versionId === review.versionId && event.reviewId === review.id
                )
            ),
        "Host acceptance receipts and committed Reviews differ"
    );
    const web = collectWeb(runtime, published, webId, calls());
    await waitUntil(settled, "ACP delivery/checkpoint and durable outbox did not settle", 600000);
    if (!cold) {
        assert(
            ctx.tools
                .schemas(ctx.agents.get(sessionIds.meeting_manager))
                .some((tool) => tool.name === "convivium_open_round"),
            "Manager control tool is not registered"
        );
        const denied = await runtime.callTargetToolResult(
            ctx,
            ctx.agents.get(sessionIds.github_research_analyst),
            "convivium_open_round",
            {
                protocolVersion: 1,
                meetingId,
                expectedMeetingVersion: published.version,
                requestId: "acp-cross-role-denied",
                action: {
                    kind: "open_round",
                    agendaId: published.rounds[0].agendaId,
                    planId: "authorization-probe-plan"
                }
            },
            runtime.nextCall(),
            { retryUnknown: false }
        );
        assert(
            denied.isError || denied.value?.kind === "rejected",
            "Contributor acquired user control"
        );
        await control(
            { kind: "pause_meeting", reason: "first round complete; cold recovery checkpoint" },
            "acp-hot-pause"
        );
        const paused = await read();
        assert(paused.lifecycle.status === "paused", "Meeting did not pause");
        const bound = acpEvents.find(
            (event) => event.sessionId === reviewerId && event.phase === "bound"
        );
        assert(bound, "Reviewer bound event was not observed before creation");
        for (const id of Object.values(sessionIds)) {
            const agent = ctx.agents.get(id);
            if (agent) {
                await ctx.sessions.flush(agent.session);
            }
        }
        await writeFile(
            checkpointPath,
            JSON.stringify({
                meetingId,
                sessionIds,
                version: paused.version,
                bindingSha256: bound.bindingSha256,
                events: acpEvents,
                reviewEvidence,
                calls: [...toolEvidence.values()],
                web
            }),
            "utf8"
        );
        await writeResult({ ok: true, scenario: "acp-codex-reviewer-web-hot", meetingId });
        return;
    }
    const loaded = acpEvents.find(
        (event) => event.sessionId === reviewerId && event.phase === "loaded"
    );
    assert(
        loaded && loaded.bindingSha256 === checkpoint.bindingSha256,
        "Original ACP binding was not loaded"
    );
    assert(
        acpEvents.some((event) => event.sessionId === reviewerId && event.phase === "committed"),
        "Cold hydration was mistaken for new execution"
    );
    assert(
        reviewEvidence.filter((event) => event.rootSessionId === reviewerId).length ===
            published.evidencePackages.filter((item) => item.roundId === published.rounds[1].id)
                .length,
        "Second round did not use a new native worker per Evidence"
    );
    assert(
        !reviewEvidence.some((event) =>
            checkpoint.reviewEvidence.some((old) => old.workerSessionId === event.workerSessionId)
        ),
        "Cold recovery replayed a consumed worker"
    );
    assert(
        !acpEvents.some(
            (event) =>
                event.phase === "committed" &&
                checkpoint.events.some(
                    (old) => old.phase === "committed" && old.requestId === event.requestId
                )
        ),
        "Cold recovery replayed a consumed ACP request"
    );
    assert(
        !acpEvents.some(
            (event) =>
                event.phase === "committed" &&
                checkpoint.priorCommittedRequestIds?.includes(event.requestId)
        ),
        "Checkpoint recovery replayed an already committed request"
    );
    assert(
        ![...toolEvidence.keys()].some((id) => checkpoint.calls.some((call) => call.callId === id)),
        "Hydration replayed a previous tool call"
    );
    const final = await waitUntil(
        async () => {
            const view = await read();
            assert(!view.executionBlocks?.length, "ACP block before archive");
            return view.lifecycle.status === "archived" && view.archive?.status === "complete"
                ? view
                : undefined;
        },
        "Meeting did not normally archive after second round",
        600000
    );
    assert(
        final.rounds.length === 2 && final.evidenceReviews.length === expected,
        "Final meeting scope differs"
    );
    await writeResult({
        ok: true,
        scenario: "acp-codex-reviewer-web",
        meetingId,
        observed: {
            sessionIds,
            reviewer: {
                provider: "acp-codex",
                model: selection.model,
                ...(selection.reasoningEffort === undefined
                    ? {}
                    : { reasoningEffort: selection.reasoningEffort }),
                workerProvider: "spawn",
                workerModel: selection.model,
                hostValidatedReviews: expected
            },
            web,
            timedOutContributions: final.rounds
                .flatMap((round) => round.contributions)
                .filter((item) => item.status === "submission_missing").length,
            rounds: 2,
            coldRecovery: true,
            authorizationRejected: true,
            archiveComplete: true
        }
    });
};
