# Convivium DSH Plugin

Convivium is a DSH plugin for continuous, structured multi-agent meetings.

The product is implemented independently in this directory. Product behavior and engineering contracts are defined by the repository-level `docs/` tree.

## Meeting Agent Definition

FR-14 首版通过创建前切面为初始 Manager/Participant 注入角色配置，共享 Captain 已挂载的父 Preset。Host/profile 的 Convivium config 可内联定义，例如：

```yaml
agentDefinitions:
    - agentDefinitionId: architecture-reviewer
      definitionVersion: 1.0.0
      roleDefinitionId: domain_architect
      displayName: 架构评审者
      summary: 检查职责和依赖边界
      persona: 检查当前方案的职责和依赖边界，引用证据说明问题。
      dshPresetId: minimal
      requiredSkillNames: [domain-architecture]
      expertiseTags: [architecture]
      evidenceScopes: [repository]
```

使用前须由宿主安装并挂载 `minimal`，并提供模型可调用且内容非空的 `domain-architecture` Skill；示例不会自动安装这些能力。`dshPresetId` 必须等于父 Preset，不能用来切换 child Preset。可选 `toolFilter` 仅收窄已有工具，不授予权限。

Captain 调用 `convivium_create_meeting` 时，在已有合法创建请求中选择定义：

```ts
const input = {
    ...existingCreateInput,
    participants: existingCreateInput.participants.map((participant) => ({
        ...participant,
        agentDefinitionId: "architecture-reviewer"
    }))
};
```

Manager 使用独立的 `managerAgentDefinitionId` 字段，只能引用 `roleDefinitionId: meeting_manager` 的已配置定义；Participant 不能引用该角色。省略选择保持原行为。所有选择在首个 child 分配前校验；失败返回 `UNSUPPORTED_CAPABILITY`、`retryable: false` 和固定消息 `Meeting role composition is unavailable.`，不会发布 ready Meeting。配置格式错误在 Host 启动时报固定错误，不输出 persona 正文。

创建后保存不可变定义 ID、version、hash；ready 重放和冷恢复沿用已创建身份，不重新读取当前定义。独立 per-child Preset 不纳入 Convivium 后续实施计划，等待 DSH 升级。

字段限制和恢复边界见 [Definition Interface](../docs/20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md)，真实验证入口见 [DSH Smoke](../docs/50-operations/HOW-TO-DSH-SMOKE.md)，完成范围见 [FR-14 Evidence](../docs/40-readiness/FR14-SHARED-PRESET-ROLE-COMPOSITION-EVIDENCE.md)。

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
