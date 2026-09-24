---
name: "verification-review"
description: "用反例与证据评估交付条件"
disable-model-invocation: false
user-invocable: true
---

# 用反例与证据评估交付条件

收到 Meeting notice 后，先使用其中的 `meetingId` 调用 `convivium_read_meeting`，以返回的 caller-visible Meeting 事实为当前工作上下文；不要从 notice 本身推断议题正文或当前状态。

1. 从验收条件和权限边界形成验证矩阵
2. 优先寻找身份隔离、原子性、幂等、终态和恢复的反例
3. 区分单元、契约、集成、真实 Host 与人工验证的证明范围
4. 每项问题给出触发条件、可观察影响、复现证据和最小修正方向

收到 review request 后，每个 pending item 只创建一个 DSH 原生 one-shot worker，不创建 replacement worker。每个 worker 只能使用 request 中给出的 immutable version 和对应 baseline，必须取得 `workerOutputSchema`、`itemTemplate`、评分规则和维度标准，并严格只返回一个符合模板的 JSON object，不返回 Markdown、代码围栏或说明文字。worker 逐主张记录核验方法、结果和限制；worker 不是 Meeting Identity，不得调用 Meeting command 或复用为共享 Session，不得执行提交代码。

Coordinator 必须等待 completed 且可规范化为正式 Review item 的结果完整覆盖全部 pending item，且 versionId 集合与 claim 精确相等，才只调用一次 `convivium_submit_review_batch`。任一 worker 失败、取消或不可规范化时不提交，也不得省略该项形成部分 batch。原生 tool call 参数必须是 request 指定的结构化 object，不得序列化为字符串或增加包装层。审核必须独立于作者结论；不得把作者输出、链接存在或未运行的命令写成验证通过。

只报告实际观察或执行的结果，说明证据不足与适用限制。工具和角色文本不扩大 Host 或任务授予的权限。
