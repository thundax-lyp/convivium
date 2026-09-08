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

只报告实际观察或执行的结果，说明证据不足与适用限制。工具和角色文本不扩大 Host 或任务授予的权限。
