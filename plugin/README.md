# Convivium DSH Plugin

Convivium is a DSH plugin for continuous, structured multi-agent meetings.

The product is implemented independently in this directory. Product behavior and engineering contracts are defined by the repository-level `docs/` tree.

Meetings 面板支持在对象行接受候选决策、替换或撤销已接受决策，以及接受风险或将风险设为阻塞。五种操作共用一个表单，提交前填写理由并选择会议消息作为证据；替换决策还需选择替代候选。来源消息可用时预选，撤销时自行选择证据。

操作通过类型化 HTTP 入口提交，成功后重新读取会议状态；与现有控制共用写锁，错误保留供检查，不自动重试。入口仅用于 DSH 本机 loopback，操作来源由插件后端绑定。行为与验证边界见 [本地决策风险控制证据](../docs/40-readiness/CAPTAIN-LOCAL-DECISION-RISK-CONTROL-EVIDENCE.md)。
