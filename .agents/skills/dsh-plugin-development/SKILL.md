---
name: dsh-plugin-development
description: 为基于 DeepSeek Harness 的应用与 Cordis 插件澄清需求、设计能力组合并实现扩展。用于需求与验收定义、DSH 能力选型，以及工具、Provider、持久状态和 UI 开发；不用于普通 DSH 操作或无关文档润色。
---

# DSH 应用与插件开发

将项目需求映射到 DSH 公开扩展点，明确状态与生命周期归属，验证组合后的行为。能力资料固定于 `dsh-v0.1.2-rc.1`；`references/` 提供按任务读取的离线指导，`assets/` 提供配套示例。

## 选择入口

| 当前任务 | 先读 | 交付结果 |
| --- | --- | --- |
| 只有想法，需要明确范围、规则或验收 | [需求澄清](references/requirements-discovery.md) | 有依据的需求、验收条件和未决项 |
| 需求已明确，需要选择能力或设计应用 | [应用设计](references/application-design.md) | 职责、接口、状态、应用组合和验证计划 |
| 实现或修改具体功能 | [开发路由](references/plugin-development-routing.md) | 实现、相关文档与实际验证结果 |
| 想先理解完整应用案例 | [事件驱动应用 HOW-TO](references/how-to-build-event-driven-app.md) | 从触发事件到 Agent 结果的组合方法 |

按用户要求停在相应阶段。已有需求与设计可直接复用；只有缺少会影响当前实现的职责、接口或恢复边界时，才补齐对应设计，不重做整个项目规划。需求草案与设计候选不自动成为已确认的实现依据。

## 核对基线与阅读范围

读取目标仓库及目标路径的贡献规则。使用具体 DSH 契约前，核对目标依赖版本与本 Skill 基线；实现前检查所属包和最接近的现有实现。版本不匹配时说明限制，不套用本版本代码骨架，也不自行升级项目。未选版本的需求或设计任务仍可整理场景与候选方案，但将具体能力标为待核对。

先看所选专题的适用范围、阅读导航和条件补读，再读取相关完整契约。失败、取消、权限、持久化、恢复和清理规则随契约一起读取。只补充当前任务需要的依赖；已读且未变的资料不重复加载，不沿全部链接递归阅读。设计任务需要具体契约时才查开发路由。

## 实现约束

- 使用公开的 plugin、Service 或 event 扩展点；存在扩展点时，不修改 Agent loop。
- 遵循目标仓库的导出约定。DSH 的 Service 包默认导出 Service class；函数插件具名导出 `name`、`apply`，并按依赖与配置需要声明 `inject`、`Config`。
- 为每项注册和资源明确生命周期所有者。`ctx.on()` 及明确自动创建 effect 的注册 API 直接调用；只返回未托管 disposer 的 API 由 `ctx.effect()` 接管。按具体 API 契约判断，不统一重复包装。
- 模型可见输入须能从 Session log 重建。优先使用已有 request header、message 和 tool result；新增事实先做[状态归属选择](references/storage-projections.md#三类状态的选择)。只有属于 Session 回放或模型历史、且现有记录不足时才新增 Session event；插件自有的跨 Session 或非历史持久数据使用 Storage Domain，并遵守目标项目的事实源约束。
- 可替换能力区分 Definition、Provider、Consumer；仅在角色需要独立演进时拆包。Consumer 依赖 Definition，不依赖具体 Provider。
- 使用目标版本公开的类型、id 与事件。输入 acceptance 只表示接受输入，不代表独立 turn 或业务完成。
- 将部署差异放入经过验证的 Config、profile 或 patch；协议常量和安全不变量保持固定。
- 工具返回唯一的规范 JSON 结果。渲染只依赖参数与该结果；实现前明确 render intent 和模型可见文本。

## 验证与交付

需求按[需求交付条件](references/requirements-discovery.md#交付与转入设计)收口；设计按[设计交付条件](references/application-design.md#设计交付与停止条件)收口。明确已确认事实、候选方案与未决项，不将验证计划写成已验证行为。

实现前用[证据选择](references/testing-docs.md#按变更面选择证据)和[验证命令矩阵](references/testing-docs.md#验证命令矩阵)确定检查，实现后执行。产品可见插件需要真实 Loader/应用组合测试；非平凡的模型、协议或用户可见变更需要相应组合快照。同步受影响的公共 API 文档与包 README，按目标仓库惯例记录设计决策。只报告实际执行的检查及其结果，并列出未验证边界。

生成 catalog 应修改其源并运行生成器。示例和实验组件不自动进入默认组合。外部调用、凭证修改、push 与 release 遵循用户授权，不从阅读或使用 Skill 推导额外权限。

## 维护入口

维护本 Skill、升级基线或核对来源时，读取[维护流程](maintenance/skill-maintenance.md)。`maintenance/` 中的 source-map 只记录维护证据，不属于能力指导，不计入能力覆盖，也不作为普通任务的阅读前置。
