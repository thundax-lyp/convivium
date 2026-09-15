const TOPIC =
    "我想做一个面向中小电商商家的 AI 平台，帮助他们减少日常运营工作。首版最值得解决哪个具体问题，为什么？\n\n" +
    "请比较至少三个候选场景，结合使用频率、现有替代方案、AI 的实际价值、数据获取难度和实现成本，推荐一个切入点，并提出可验证用户价值的最小产品方案。允许质疑“平台”是否是合适的首版形态。";

const COMMON_INSTRUCTION = `按明确任务工作；使用“主张、证据、推断、反证条件、不确定性”五项；提交材料具体版本并保留未知；同来源不算独立证据；不编造研究结果；不运行代码，不调用 bash/grep/web_search，不使用旧 Turn 工具。convivium_contribution 的 action 必须是 input 内的扁平字符串字段，绝不使用 action 对象或探索字段。
作者在 submit 前各保存一份只证明自身文本性质的内部材料。save_evidence 精确使用 {input:{protocolVersion:1,meetingId,requestId,expectedMeetingVersion,action:"save_evidence",contributionId,generation,evidenceId,expectedEvidenceRevision:0,material:{title,kind:"document",source:"model-authored meeting material",sourceDate:"2026-09-15",collectedAt:"2026-09-15",locator:"full text",observation:"The material is model-authored and external claims remain assumptions.",methodAndConditions:"Literal inspection of the saved text.",limitations:"Internal material only; it does not validate merchant demand or external facts.",dependencies:"None.",material:{kind:"text",text:"Model-authored meeting material; external claims remain assumptions."}}}}。product 的 evidenceId="product-internal-material"，feasibility 的 evidenceId="feasibility-internal-material"。
submit 精确使用 {input:{protocolVersion:1,meetingId,requestId,expectedMeetingVersion,action:"submit",contributionId,generation,expectedDraftRevision,basedOnSeq,body:{kind,content,mentions:[],taskIds:[],agendaRelation:"on_topic",changes:{}},citations:[{evidenceKey,claim:"The material is model-authored and external claims remain assumptions.",locator:"full text",inference:"Literal comparison only."}]}}，evidenceKey 使用自己 save_evidence 成功回执的值；不得增删字段，content 最多 1200 个中文字符。
evidence_review 前必须按 draft citation 的 evidenceKey 调用 convivium_read_contribution 读取材料；随后精确使用 {input:{protocolVersion:1,meetingId,requestId,expectedMeetingVersion,action:"evidence_review",contributionId,generation,draftRevision,reviews:[{evidenceKey,claim:"The material is model-authored and external claims remain assumptions.",verdict:"supports",method:"Literal comparison.",result:"The cited statement appears in the saved material.",limitations:"This verifies only the saved text, not merchant demand or external facts."}]}}。boundary_review 必须精确使用 {input:{protocolVersion:1,meetingId,requestId,expectedMeetingVersion,action:"boundary_review",contributionId,generation,draftRevision,decision:"approve",reason,checkedThroughSeq}}，不得省略 requestId，不得增加 participantId 或 agendaItemId。
meeting_manager 只 assign participant-product 与 participant-feasibility，不 assign participant-reviewer；两位作者进入 boundary_review 后，Manager 先分别读取相同精确 draftRevision 并 approve，使审核状态进入 pending；随后固定 reviewer 读取已发布 draft 与 evidence 并提交 evidence_review。domain_architect 的 body.kind 必须是字面量 "summary"，content 为指定 JSON，证据数组列自己的 evidenceKey；runtime_engineer 的 body.kind 必须是字面量 "proposal"，content 为五项可行性材料；两者的 body.mentions 与 body.taskIds 必须为 []、body.agendaRelation 必须为 "on_topic"、body.changes 必须为 {}。verification_reviewer 不 submit 自己的材料，只在 Manager approve 后读取两位作者的精确 draftRevision 与 evidenceKey 并分别 evidence_review。工具报 CAS 冲突先读取最新状态、用新 requestId 重试；若 INVALID_ARGUMENT，只报告一次，不盲探协议。`;

const ROLE_TOOL_ALLOW = [
    "skill",
    "convivium_meeting_status",
    "convivium_contribution",
    "convivium_read_contribution"
];

function definition(
    agentDefinitionId,
    roleDefinitionId,
    displayName,
    persona,
    requiredSkillNames,
    expertiseTags
) {
    return {
        agentDefinitionId,
        definitionVersion: "1.0.0",
        roleDefinitionId,
        displayName,
        summary: persona,
        roleDescription: persona + "\n\n" + COMMON_INSTRUCTION,
        dshPresetId: "convivium",
        requiredSkillNames,
        toolFilter: { allow: ROLE_TOOL_ALLOW },
        expertiseTags,
        evidenceScopes: []
    };
}

export const parallelDiscussionDefinitions = [
    definition(
        "discussion.manager",
        "meeting_manager",
        "林序｜会议主持人",
        "拆问题、安排并行研究、按议题边界审稿，保留分歧并整合路径，不替作者写结论。执行每次 assign 前逐项核对 input 顶层恰有 protocolVersion、meetingId、requestId、expectedMeetingVersion、action、participantId、agendaItemId、instruction、targetIds、requiredForCompletion、requiresEvidenceReview 十一个字段；protocolVersion=1 且 meetingId 绝不省略。第一次成功后重新读 status 获取新 expectedMeetingVersion，再给第二位作者 assign。",
        ["meeting-management"],
        ["product-facilitation"]
    ),
    definition(
        "discussion.product",
        "domain_architect",
        "陈衡｜商家运营分析师",
        "比较商家场景的频率、替代办法与 AI 价值；缺证据明确为假设，不讨论 Convivium 工程。执行 submit 前逐项核对 input 顶层恰有 protocolVersion、meetingId、requestId、expectedMeetingVersion、action、contributionId、generation、expectedDraftRevision、basedOnSeq、body、citations 十一个字段；expectedMeetingVersion 取最新 status 且绝不省略，basedOnSeq 也绝不省略。body.kind=summary，body.content 必须是纯 JSON 字符串，无 Markdown、前后文字或代码围栏；顶层恰有主张、证据、推断、反证条件、不确定性、候选场景、推荐七键。证据是自己 save_evidence 成功回执的 evidenceKey 字符串数组；候选场景至少三项且每项恰有名称、频率、替代方案、AI价值、数据可得性、实现成本、假设七个非空字符串字段；推荐恰有场景、理由、最小产品、价值指标、测量方法、成功条件、否定条件七个非空字符串字段，场景等于候选项名称。主张、推断、反证条件、不确定性都是非空字符串。不要加入第八个顶层键或解释段。",
        [],
        ["merchant-operations"]
    ),
    definition(
        "discussion.feasibility",
        "runtime_engineer",
        "周宁｜产品可行性分析师",
        "比较数据可得性、实现成本和最小用户价值验证；可质疑平台形态，不实施代码。执行 submit 前逐项核对 input 顶层恰有 protocolVersion、meetingId、requestId、expectedMeetingVersion、action、contributionId、generation、expectedDraftRevision、basedOnSeq、body、citations 十一个字段；meetingId 绝不省略，expectedMeetingVersion 取最新 status，basedOnSeq 也绝不省略。",
        [],
        ["product-feasibility"]
    ),
    definition(
        "discussion.reviewer",
        "verification_reviewer",
        "沈知｜证据审核员",
        "实际读取材料，逐主张记录支持程度与限制，不自审、不把作者输出当独立运行。",
        ["verification-review"],
        ["evidence-review"]
    )
];

export const parallelDiscussionModelOverrides = Object.fromEntries(
    parallelDiscussionDefinitions.map(({ agentDefinitionId }) => [
        agentDefinitionId,
        { provider: "deepseek-official", model: "deepseek-v4-flash" }
    ])
);

function parseJson(value) {
    if (typeof value !== "string") return undefined;
    try {
        return JSON.parse(value);
    } catch {
        return undefined;
    }
}

function exactObject(value, keys) {
    return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value).length === keys.length &&
        keys.every((key) => Object.hasOwn(value, key))
    );
}

function toolRecords(agent) {
    const calls = new Map();
    const records = [];
    for (const event of agent.session.ownEvents()) {
        if (event.type === "tool/call" && event.data.name.startsWith("convivium_")) {
            calls.set(String(event.data.callId), {
                sessionSeq: event.seq,
                callTime: event.time,
                sessionId: String(agent.id),
                name: event.data.name,
                args: parseJson(event.data.arguments)
            });
            continue;
        }
        if (event.type !== "tool/result") continue;
        const block = event.data.message.content[0];
        const call = calls.get(String(block.toolCallId));
        if (call === undefined) continue;
        const text = block.content.find((part) => part.type === "text")?.text;
        records.push({
            ...call,
            resultSeq: event.seq,
            resultTime: event.time,
            result: parseJson(text),
            isError: block.isError === true || event.data.error !== undefined
        });
    }
    return records;
}

function validateSummary(content, readableEvidenceKeys, assert) {
    const value = parseJson(content);
    assert(
        exactObject(value, ["主张", "证据", "推断", "反证条件", "不确定性", "候选场景", "推荐"]),
        "Final summary does not have the exact JSON fields: " +
            JSON.stringify({
                parseable: value !== undefined,
                keys: value !== null && typeof value === "object" ? Object.keys(value) : [],
                markdownWrapped: /^```/u.test(content.trim())
            })
    );
    for (const key of ["主张", "推断", "反证条件", "不确定性"])
        assert(
            typeof value[key] === "string" && value[key].trim(),
            `Final summary ${key} is empty`
        );
    assert(Array.isArray(value.证据), "Final summary 证据 must be an array");
    assert(
        value.证据.every(
            (key) => typeof key === "string" && key.trim() && readableEvidenceKeys.has(key)
        ),
        "Final summary references an unreadable evidence key"
    );
    if (value.证据.length === 0)
        assert(value.不确定性.includes("缺少外部证据"), "Empty evidence is not disclosed");
    assert(
        Array.isArray(value.候选场景) && value.候选场景.length >= 3,
        "Too few candidate scenarios"
    );
    const candidateKeys = ["名称", "频率", "替代方案", "AI价值", "数据可得性", "实现成本", "假设"];
    for (const candidate of value.候选场景) {
        assert(exactObject(candidate, candidateKeys), "Candidate scenario fields are invalid");
        assert(
            candidateKeys.every(
                (key) => typeof candidate[key] === "string" && candidate[key].trim()
            ),
            "Candidate scenario contains an empty field"
        );
    }
    const names = value.候选场景.map((candidate) => candidate.名称.trim());
    assert(new Set(names).size === names.length, "Candidate scenario names are not unique");
    const recommendationKeys = [
        "场景",
        "理由",
        "最小产品",
        "价值指标",
        "测量方法",
        "成功条件",
        "否定条件"
    ];
    assert(exactObject(value.推荐, recommendationKeys), "Recommendation fields are invalid");
    assert(
        recommendationKeys.every(
            (key) => typeof value.推荐[key] === "string" && value.推荐[key].trim()
        ),
        "Recommendation contains an empty field"
    );
    assert(names.includes(value.推荐.场景.trim()), "Recommendation is not a candidate scenario");
}

function taskPrompt() {
    return `
你是本次会议的 Captain。只发起并管理一次真实模型会议，不自己代写参会者的贡献。

议题原文：
${TOPIC}

创建参数必须严格使用：
- requestId=parallel-model-create，teamId=parallel-model-team，protocolVersion=1，selectionMode=manager。
- topic 与 objective 都使用上述议题原文。
- managerAgentDefinitionId=discussion.manager。
- participants 为 product/陈衡｜商家运营分析师/discussion.product、feasibility/周宁｜产品可行性分析师/discussion.feasibility、reviewer/沈知｜证据审核员/discussion.reviewer；evidenceReviewerKey=reviewer。
- objectiveContract.requiredOutputs=[{key:"proposal",description:"推荐一个切入点并提出可证伪的最小验证方案"}]。
- objectiveContract.acceptanceCriteria=[{key:"comparison",description:"至少三个场景按五个维度比较并注明假设"}]，hardConstraints=[]，requiredReviewerKeys=["reviewer"]，riskAcceptanceAuthorityKeys=[]，acceptableRiskLevel=low。
- agenda 仅一项：key=merchant-mvp，title=商家运营首版方向，objective=议题原文，inScope=["商家运营问题","三个候选场景比较","最小用户价值验证"]，outOfScope=["Convivium 工程评审","直接开发产品"]，completionCriteria=["comparison"]，requiredParticipantKeys=["product","feasibility","reviewer"]；省略 ownerKey/relatedTaskIds/continuation。
- limits={maxTotalMessages:24,maxDurationMs:1800000}。

创建后让 Manager 只 assign product 与 feasibility 两项并行作者任务，不得把 reviewer 当作者 assign。Manager 的 assign 必须使用扁平 action 字符串及工具描述列出的全部字段。product 提交 kind=summary 的最终结构化比较，feasibility 提交 kind=proposal 的独立可行性材料；每份 content 不超过 1200 个中文字符，并确保完整 submit 输入小于 8192 UTF-8 bytes。两位作者先按角色系统指令保存仅证明自身文本性质的内部材料，再用其真实 evidenceKey 各提交一条 citation；不得把内部材料泛化为商家事实。两份草稿进入 boundary_review 后，Manager 必须先分别读取精确 draft 并以 boundary_review decision=approve 批准发布；然后让 reviewer 分别用 convivium_read_contribution 读取已发布的精确 draftRevision 和 citation evidenceKey，再逐条提交 evidence_review，审核员不得自审。不得使用已淘汰的 Turn/reassign 工具。

你在整个场景中只允许调用 convivium_create_meeting、convivium_meeting_status、convivium_contribution、convivium_read_contribution、convivium_end_meeting；不得调用 bash、grep、文件读取或 sleep，不得查实现，不得等待 deadline 后重试。若任一作者首次出现 INVALID_ARGUMENT，立即以 partial 收口并报告，不做协议字段探索。notify_manager 必须精确使用 {input:{protocolVersion:1,meetingId,requestId,expectedMeetingVersion,action:"notify_manager",reason}}；不得代替 Manager 调用 assign/approve，不得代替 Participant 调用 submit/review。

创建和一次 notify_manager 成功后，结束你当前的响应并等待 Manager 消息唤醒；不要持续轮询。公开 messages=[] 或 contributions.tasks=[] 只表示 Manager 尚未完成分配，是正常等待态，不是失败。至少观察到 product 与 feasibility 两项真实 contribution task 后才可判断协作成败；在两项均 published 且各自 reviewStatus=complete、正式 messages 同时包含 participant-product 的 kind=summary 与 participant-feasibility 的 kind=proposal 前，不得调用 end_meeting。若其中一项在 boundary_review、另一项已 published/complete，这是正常在途状态；继续等待 Manager 审批，不要提前 partial。

最后一条正式 kind=summary 消息的 content 必须是无 Markdown 包裹的 JSON 对象，且精确包含：主张:string、证据:string[]、推断:string、反证条件:string、不确定性:string、候选场景:[{名称,频率,替代方案,AI价值,数据可得性,实现成本,假设}]、推荐:{场景,理由,最小产品,价值指标,测量方法,成功条件,否定条件}。所有字符串非空，候选场景至少三个且名称唯一，推荐场景必须来自候选项。证据只列已公开且能按 archive 白名单回读的 evidenceKey；若为空，不确定性必须包含“缺少外部证据”。内容不得转向 Convivium 工程。

你只根据真实状态收口：两份草稿均已审核、批准并形成正式消息后，以 partial 结束（缺少外部商家事实，不得伪装 objective_satisfied）；end_meeting 精确使用 {input:{protocolVersion:1,meetingId,expectedMeetingVersion,outcome:"partial",reason,acceptedDecisionIds:[],deferredAgendaItemIds:[],waivers:[],requestId}}。结束后持续读状态到 archived，再通过 convivium_read_contribution 按最终 summary 的 contributionId 与 contributionRevision 回读精确草稿；若 summary 的证据数组非空，再回读其中每个 evidenceKey。
`.trim();
}

export async function runParallelContributionModelScenario(runtime) {
    const { ctx, assert } = runtime;
    assert(!runtime.browserMode, "parallel-contribution-model rejects Browser mode");
    const captain = runtime.captain.agent;
    const observedAgents = new Map([[String(captain.id), captain]]);
    const disposeObserver = ctx.on("agent/created", ({ agent }) => {
        observedAgents.set(String(agent.id), agent);
    });
    try {
        const promptId = "parallel-contribution-model-task";
        captain.followup({
            id: promptId,
            role: "user",
            content: [{ type: "text", text: taskPrompt() }],
            source: { kind: "user" }
        });

        const deadline = Date.now() + 1_800_000;
        let meetingId;
        let archived;
        while (Date.now() < deadline) {
            const captainRecords = toolRecords(captain);
            const creation = captainRecords.find(
                (record) =>
                    record.name === "convivium_create_meeting" &&
                    record.result?.ok === true &&
                    typeof record.result.result?.meetingId === "string"
            );
            if (creation !== undefined) {
                meetingId = creation.result.result.meetingId;
            }
            archived = captainRecords
                .filter(
                    (record) =>
                        record.name === "convivium_meeting_status" &&
                        record.result?.ok === true &&
                        record.result.result?.meetingId === meetingId &&
                        record.result.result?.status === "archived"
                )
                .at(-1);
            if (archived !== undefined) {
                await captain.whenIdle();
                break;
            }
            await new Promise((resolveWait) => setTimeout(resolveWait, 500));
        }
        assert(meetingId, "Captain did not create the fixed model discussion");
        assert(archived !== undefined, "Model discussion did not archive before timeout");

        const sessionIds = {
            captain: String(captain.id),
            manager: `${meetingId}-manager-manager`,
            product: `${meetingId}-participant-participant-product`,
            feasibility: `${meetingId}-participant-participant-feasibility`,
            reviewer: `${meetingId}-participant-participant-reviewer`
        };
        const records = Object.entries(sessionIds).flatMap(([role, sessionId]) => {
            const agent = observedAgents.get(sessionId);
            return (agent === undefined ? [] : toolRecords(agent)).map((record) => ({
                ...record,
                role
            }));
        });
        const successful = records.filter(
            (record) => !record.isError && record.result?.ok === true
        );
        const inputs = (record) => record.args?.input;
        const submitted = successful.filter(
            (record) =>
                record.name === "convivium_contribution" && inputs(record)?.action === "submit"
        );
        assert(
            submitted.some((record) => record.role === "product") &&
                submitted.some((record) => record.role === "feasibility"),
            "The two model authors did not submit their own contributions: " +
                JSON.stringify(
                    records.map((record) => ({
                        sessionId: record.sessionId,
                        name: record.name,
                        action: record.args?.input?.action,
                        ok: record.result?.ok === true,
                        ...(record.result?.ok === true
                            ? {}
                            : {
                                  inputKeys: Object.keys(record.args?.input ?? {}),
                                  bodyKeys: Object.keys(record.args?.input?.body ?? {}),
                                  contentBytes: new TextEncoder().encode(
                                      record.args?.input?.body?.content ?? ""
                                  ).byteLength,
                                  bodyKind: record.args?.input?.body?.kind,
                                  agendaRelation: record.args?.input?.body?.agendaRelation,
                                  mentions: record.args?.input?.body?.mentions,
                                  taskIds: record.args?.input?.body?.taskIds,
                                  changes: record.args?.input?.body?.changes,
                                  citations: record.args?.input?.citations,
                                  code: record.result?.code
                              })
                    }))
                )
        );
        const approvals = successful.filter(
            (record) =>
                record.role === "manager" &&
                record.name === "convivium_contribution" &&
                inputs(record)?.action === "boundary_review" &&
                inputs(record)?.decision === "approve"
        );
        const status = archived.result.result;
        const messages = status.archive.package.formalTranscript;
        const materialReads = successful.filter(
            (record) =>
                record.name === "convivium_read_contribution" &&
                record.result.result?.task?.id === inputs(record)?.contributionId &&
                Number.isInteger(inputs(record)?.draftRevision) &&
                record.result.result?.drafts?.some(
                    (draft) => draft.revision === inputs(record).draftRevision
                )
        );
        const managerReads = materialReads.filter((record) => record.role === "manager");
        assert(
            messages.length > 0 &&
                messages.every((message) =>
                    approvals.some(
                        (approval) =>
                            approval.result.result?.messageId === message.id &&
                            approval.result.result?.contributionId === message.contributionId &&
                            approval.result.result?.draftRevision === message.contributionRevision
                    )
                ),
            "A formal message lacks a matching successful Manager boundary approval"
        );
        assert(
            approvals.every((approval) =>
                managerReads.some(
                    (read) =>
                        read.sessionSeq < approval.sessionSeq &&
                        inputs(read).contributionId === inputs(approval).contributionId &&
                        inputs(read).draftRevision === inputs(approval).draftRevision
                )
            ),
            "Manager approved without reading the exact draft"
        );
        const evidenceReads = successful.filter(
            (record) =>
                record.name === "convivium_read_contribution" &&
                typeof inputs(record)?.evidenceKey === "string" &&
                record.result.result?.evidence?.key === inputs(record).evidenceKey
        );
        const reviewerReads = materialReads.filter((record) => record.role === "reviewer");
        const reviewerEvidenceReads = evidenceReads.filter((record) => record.role === "reviewer");
        const reviews = successful.filter(
            (record) =>
                record.role === "reviewer" &&
                record.name === "convivium_contribution" &&
                inputs(record)?.action === "evidence_review"
        );
        assert(
            reviewerReads.length > 0 && reviewerEvidenceReads.length > 0 && reviews.length > 0,
            "Reviewer did not read and review material"
        );
        assert(
            reviews.every(
                (review) =>
                    reviewerReads.some(
                        (read) =>
                            read.result.result?.task?.id === inputs(review).contributionId &&
                            inputs(read).draftRevision === inputs(review).draftRevision &&
                            read.result.result?.task?.participantId !== "participant-reviewer"
                    ) &&
                    inputs(review).reviews.every((item) =>
                        reviewerEvidenceReads.some(
                            (read) =>
                                read.result.result?.task?.id === inputs(review).contributionId &&
                                inputs(read).evidenceKey === item.evidenceKey
                        )
                    )
            ),
            "Reviewer self-reviewed or reviewed without reading the contribution"
        );
        const summary = messages.filter((message) => message.kind === "summary").at(-1);
        assert(
            summary !== undefined,
            "The model discussion has no formal summary: " +
                JSON.stringify({
                    messages: messages.map((message) => ({
                        kind: message.kind,
                        speaker: message.speaker
                    })),
                    submissions: submitted.map((record) => ({
                        role: record.role,
                        kind: inputs(record)?.body?.kind
                    }))
                })
        );
        const archiveMaterialReads = materialReads.filter(
            (record) =>
                record.role === "captain" &&
                record.sessionSeq > archived.resultSeq &&
                inputs(record).contributionId === summary.contributionId &&
                inputs(record).draftRevision === summary.contributionRevision
        );
        assert(archiveMaterialReads.length > 0, "Captain did not read the archived summary draft");
        const archiveEvidenceReads = evidenceReads.filter(
            (record) => record.role === "captain" && record.sessionSeq > archived.resultSeq
        );
        const readableEvidenceKeys = new Set(
            archiveEvidenceReads.map((record) => inputs(record).evidenceKey)
        );
        validateSummary(summary.content, readableEvidenceKeys, assert);
        const ended = successful.find(
            (record) => record.role === "captain" && record.name === "convivium_end_meeting"
        );
        assert(ended !== undefined, "Captain did not end the model discussion");
        assert(
            !messages.some((message) =>
                /Convivium|DSH|meetingVersion|contributionId/u.test(message.content)
            ),
            "Formal discussion content turned toward Convivium engineering"
        );

        if (process.env.CONVIVIUM_SMOKE_MODEL_EVIDENCE) {
            const fs = await import("node:fs/promises");
            await fs.writeFile(
                process.env.CONVIVIUM_SMOKE_MODEL_EVIDENCE,
                JSON.stringify(
                    messages.map(({ id, kind, speaker, content }) => ({
                        id,
                        kind,
                        speaker,
                        content
                    }))
                ),
                "utf8"
            );
        }

        await runtime.writeResult({
            ok: true,
            scenario: "parallel-contribution-model",
            meetingId,
            captainSessionId: String(captain.id),
            assertions: [
                "model-origin-submissions",
                "boundary-before-publication",
                "material-version-readable",
                "review-not-self",
                "structured-comparison",
                "archive-verified"
            ],
            observed: {
                status: "archived",
                messageIds: messages.map((message) => message.id),
                archiveVerified: true,
                interventions: 0
            }
        });
    } finally {
        disposeObserver();
    }
}
