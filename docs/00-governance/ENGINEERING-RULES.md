# Engineering Rules

## Purpose

本文定义实现和评审中的工程取舍与通用验证要求。测试体系与命名由 [Test Rules](./TEST-RULES.md) 定义；系统组成、所有权、依赖方向和模块导入边界由 [Architecture](./ARCHITECTURE.md) 定义；本文不改变产品需求或接口契约。

## Scope

实现、重构、评审和相关验证均适用。按当前任务风险应用规则，不为检查本身新增文档或审批环节；提交与 PR 分别遵循对应治理文档。

## Implementation Economy

- 默认采用满足当前已确认行为和必要不变量的最小安全改动，不为仅有假设性未来价值的能力预建机制。
- 新增抽象、状态、事件、adapter、worker、依赖、兼容层或扩展点前，必须指出至少一项当前依据：需求或接口契约、架构或安全不变量、可复现失败、必要隔离边界，或多个当前消费者需要的稳定共享语义。
- 单一消费者、单一实现、文件数量或代码行数只能触发进一步检查，不能单独证明过度设计；权限、事务、持久化、外部系统和生命周期边界可以因隔离责任而独立存在。
- finding 是否成立与建议方案是否合适必须分别判断；较小方案能够消除同一触发条件并保持必要边界时，采用较小方案。
- 未经当前任务确认，不顺带重构稳定路径、建立通用框架、扩展协议或实现后续阶段；完成当前范围必须扩张时，停止并报告新增范围。
- 同一 command commit 内、外部不可观察且对恢复无价值的中间状态保持为局部值；新增持久状态必须影响跨 command 行为、恢复、授权或公开 projection。
- 接口只约束输入、输出、授权、幂等和失败语义；没有跨边界依据时，不强制内部 Error 子类、结果包装、同义类型或日志 schema。
- 范围收窄不得弱化 caller binding、capability、ownership、stale attempt、幂等和数据完整性；无法安全处理的失败必须 fail closed，不以隐式降级或自动跳过替代正式失败边界。

## Engineering Checks

按任务风险执行以下检查，可复用已有依据和证据，不为检查本身新增文档或审批环节：

- 实现前：从已确认需求和契约中明确关键业务不变量，列出能暴露错误实现的反例；验证预期不得仅从当前代码推导。
- 编写、修改或评审测试：应用 [Test Rules](./TEST-RULES.md) 的行为依据、反馈、资产取舍与命名规则；测试设计与实现由 `test-driven-development` 随相关任务被动触发；`testcase-review` 仅由用户显式调用，普通评审直接遵循 Test Rules。
- 确定性状态和失败分支由单元或 integration test 覆盖；真实 DSH profile 覆盖必须依赖 provider、Session ownership 或 plugin composition 的代表性路径。两类证据不能互相替代；重复真实运行须说明独有证据价值。
- 路径或公开模块入口迁移后，运行 `pnpm --dir plugin lint` 和受影响验证；不得为检查本身新增文档或审批环节。

## Validation And Evidence

- 按改动风险选择能暴露错误实现的最窄验证集合；公共契约、共享基础设施、权限或生命周期变化时扩大范围。纯文档变更通常验证链接、结构和 diff，不默认运行产品套件；CI 必需检查仍按 PR Rules 执行。
- 已有证据的源码、环境和验证范围仍适用时可以复用，注明原基线；不能将历史结果描述为本次重跑。只记录实际执行的命令、断言和结果，失败或阻塞不得标为通过。
- 自动化通过不等于业务、真实运行或发布就绪。未执行、未自动化及刻意排除的范围标为 `Not Covered`；确实不适用的验证说明 `Not Applicable` 及原因。
- 验证如创建临时数据、进程、目录或环境变量，按 `Prepare → Execute → Assert → Restore` 管理；失败路径同样执行 Restore，不清理用户原有资源。
- 交付前确认目标达到可审阅或可运行状态，工作区未混入无关修改，且已运行相关验证并说明边界。文档同步按 [Document Sync](./DOCUMENT-RULES.md#document-sync)；只有涉及已登记 TODO 时才应用 [TODO Rules](./TODO-RULES.md)。

## Test Naming

命名规则统一维护在 [Test Rules — Test Naming](./TEST-RULES.md#test-naming)；本节保留为已有链接的读取入口。
