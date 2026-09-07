# Convivium DSH Plugin

Convivium is a DSH plugin for continuous, structured multi-agent meetings.

The product is implemented independently in this directory. Product behavior and engineering contracts are defined by the repository-level `docs/` tree.

`convivium_submit_turn` accepts optional `minutesDraft` metadata for a non-authoritative summary. It references only existing messages in the delivered context; the original transcript remains authoritative. The role does not grant additional permissions, and a draft cannot submit decisions or completion claims or block archival. See the [Protocol contract](../docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md#referenced-minutes-draft) for fields and validation.

Meetings 面板支持在对象行接受候选决策、替换或撤销已接受决策，以及接受风险或将风险设为阻塞。五种操作共用一个表单，提交前填写理由并选择会议消息作为证据；替换决策还需选择替代候选。来源消息可用时预选，撤销时自行选择证据。

操作通过类型化 HTTP 入口提交，成功后重新读取会议状态；与现有控制共用写锁，错误保留供检查，不自动重试。入口仅用于 DSH 本机 loopback，操作来源由插件后端绑定。行为与验证边界见 [本地决策风险控制证据](../docs/40-readiness/CAPTAIN-LOCAL-DECISION-RISK-CONTROL-EVIDENCE.md)。

## Captain 参会推荐拒绝

`convivium_dispose_attendance_recommendation` 只允许该会议的 Captain 拒绝一个 pending 推荐，无需新增配置。工具参数为 `{ "input": ... }`，input 示例：

```json
{
    "protocolVersion": 1,
    "meetingId": "meeting-1",
    "expectedMeetingVersion": 3,
    "requestId": "reject-1",
    "recommendationId": "recommendation-1",
    "decision": "reject",
    "reason": "本议题已有相应覆盖"
}
```

成功返回标准协议 envelope，其 `result` 为 `{ "requestId": "reject-1", "recommendationId": "recommendation-1", "disposition": "rejected" }`，并携带已提交 meetingVersion。模型可见文本是该规范结果的 JSON 渲染。

一次成功只写目标推荐、一个领域事件和 receipt，outbox 为空，不新增 Participant 或 Session。原因在提交时 trim；相同请求重放返回原结果，输入变化触发幂等冲突，过期版本拒绝。调用身份来自 DSH Agent，输入不得携带 actor；工具传递既有 AbortSignal，不建立额外后台任务。错误沿用协议的 code/message/retryable；新请求再次拒绝非 pending 推荐返回 `ATTENDANCE_RECOMMENDATION_NOT_PENDING`。

状态只公开原因和时间，归档保存七个脱敏字段。新终态请求拒绝，原 receipt 在恢复后仍可重放。`approve`、admission、provisioning 和 UI 拒绝控制尚未实现；真实生产 Catalog 成功链路未覆盖。完整契约见 [Role Catalog Interface](../docs/20-interfaces/MEETING-AGENT-ROLE-CATALOG-INTERFACE.md#captain-rejection-slice)，实际验证见 [Captain Attendance Rejection Evidence](../docs/40-readiness/CAPTAIN-ATTENDANCE-REJECTION-EVIDENCE.md)。
