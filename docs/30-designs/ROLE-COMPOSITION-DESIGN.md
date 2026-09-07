# Role Composition Design

## Purpose

将 FR-14 首版实现为创建前的角色配置切面。共享父 Preset 首版已实现，验证见 [FR-14 Evidence](../40-readiness/FR14-SHARED-PRESET-ROLE-COMPOSITION-EVIDENCE.md)。

## Scope And Non-goals

共享父 Preset；初始 Manager/Participant 可选 Definition；校验、注入、provenance 和恢复一致性。无独立 package、通用 hook registry、Session event 监听器、热更新、动态接纳、模型配置、UI 或新文件读取权限。目录位于既有 plugin 工程内。

## Related Requirements And Interfaces

- [Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)：FR-14、验收 35–40。
- [Definition Interface](../20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md)：完整字段、Hash、失败和兼容契约。
- [Architecture](../00-governance/ARCHITECTURE.md)：DSH 能力与会议事实分离。

## Responsibilities And Dependencies

`plugin/src/role-composition/model.ts` 拥有 Definition/Binding 类型及纯输入校验；`resolve.ts` 拥有快照、指纹及角色选择规则；`dsh-capabilities.ts` 是 DSH Preset/Skill 只读校验边界。模块不导入 runtime、repository、domain、client；仅 dsh-capabilities.ts 可导入 DSH Agent/Skill/Preset 类型。直接函数调用承担创建切面，不注册 Hook service。

Config 提供内联 definitions；createMeetingApplication 向 createMeetingRuntime 传入同一配置快照；createMeetingRuntime 在创建前一次性解析所有显式选择，Session adapter 只接收 persona/toolFilter，repository 只接收三个 provenance 字段。模块不创建 Session、不保存 Meeting、不解释发言或决策。

既有 DSH session-adapter 依赖 persona/toolFilter 的结构类型；不得让它导入角色 resolver。仓库 ownership 仅通过 type import 引用 Binding，不依赖 resolver 或 DSH capability 服务。没有新增运行时循环依赖。

## State And Failure Handling

遵循接口 Runtime Provenance And Failure。现有 create receipt/hash、bootstrap、cleanup、revoke、drain 均保留所有者。配置 preflight 在首个 child 前完成；DSH start 中途失败沿原清理路径。解析返回不可变数据，不建立缓存、队列、状态机或持久配置副本。

ready replay 和冷恢复不运行 resolver；保留 DSH descriptor，会议 provenance 仅用于审计。已有无定义身份保持无定义；配置变化只能作用于新会议。Host Preset/Skill 安装状态不属于 Convivium 历史快照。

## Security And Observability

ID 选择不授予权限，Manager Definition 不能选作 Participant；toolFilter 交给 DSH 同时约束可见性和执行。required Skill 校验不自动注入正文，不建立独占 Skill 集合。persona、filter、Skill 正文不进入公开状态、归档或错误信息。

## Acceptance

配置合法/非法、跨角色选择、父 Preset 不匹配、Skill 不可调用、所有身份预检原子性、子级失败清理、ownership 不可变、ready replay、冷恢复均必须验证。真实 DSH profile 必须证明两种 persona 与工具执行限制隔离、Host 重启后仍成立，才能提升 FR-14 状态。
