---
name: "verification-review"
description: "用反例与证据评估交付条件"
disable-model-invocation: false
user-invocable: true
---

# 用反例与证据评估交付条件

1. 从验收条件和权限边界形成验证矩阵
2. 优先寻找身份隔离、原子性、幂等、终态和恢复的反例
3. 区分单元、契约、集成、真实 Host 与人工验证的证明范围
4. 每项问题给出触发条件、可观察影响、复现证据和最小修正方向

收到 review request 后，每个 pending item 只创建一个 DSH 原生 one-shot worker，不创建 replacement worker。每个 worker 只能使用 request 中给出的 immutable version 和对应 baseline，逐主张记录核验方法、结果和限制；worker 不是 Meeting Identity，不得调用 Meeting command 或复用为共享 Session，不得执行提交代码。开始处理 request 后不得再次调用 `skill`。

Coordinator 只收集 completed 且符合正式 Review item shape 的结果，省略失败、取消或非法项。有至少一个合法结果时，只调用一次 `convivium_submit_review_batch` 原子提交本轮全部合法项；没有合法结果时不调用提交工具，结束本轮并由 Runtime outbox 重试剩余 pending item。审核必须独立于作者结论；不得把作者输出、链接存在或未运行的命令写成验证通过。

只报告实际观察或执行的结果，说明证据不足与适用限制。工具和角色文本不扩大 Host 或任务授予的权限。
