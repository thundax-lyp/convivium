# Host 托管 Shell 环境对象

适用 `@deepseek-ai/dsh-shell-env@0.2.0-rc.2`。此 Service 为每次模型 Shell 工具调用构造受信任的 `DSH_*` 环境快照；Shell 执行器丢弃继承来的同名前缀变量，再合并当前快照。它不修改 `process.env`。见 [贡献环境事实](../how-to/how-to-host-shell-env.md)。

## ShellEnvRegistry

**公开导出**：`ShellEnvRegistry` 来自 `@deepseek-ai/dsh-shell-env`。
`ctx.shellEnv.register(contributor)` 在装载时校验贡献者名称、变量名、描述和唯一所有权，返回随注册 fiber 清理的 disposer。`collect(execution)` 每次执行现算，包含 `DSH_HOME`、`DSH_SHELL`、可用时的 `DSH_SESSION_ID`、`DSH_PROFILE`、`DSH_PROFILE_DIR`，再按贡献者名称排序合并值，返回冻结且按 key 排序的快照。`list()` 仅枚举插件声明，不执行 resolver，也不包含内置变量；不能把它当完整运行时环境。

## BashEnvContributor

**公开导出**：`BashEnvContributor` 来自 `@deepseek-ai/dsh-shell-env`。
贡献者声明稳定 `name`、完整的 `variables` 映射及 `resolve(execution)`。每个变量必须是合法大写 `DSH_*` 名称且带非空描述；内置 key 与其他贡献者已占用 key 均不可声明。resolver 只返回本次执行可用的已声明 key，值必须是字符串；返回未声明 key 或非字符串会令该次调用失败。`execution.agent` 可缺省，不能为所有 Shell 调用假设存在 Agent。

## BashEnvVariable

**公开导出**：`BashEnvVariable` 来自 `@deepseek-ai/dsh-shell-env`。
每项声明的 `description` 是这个环境事实的简短解释，不是它的运行时值。秘密不应借 `DSH_*` 扩展直接写入可被模型 Shell 读取的环境；需要凭据时按插件的最小授权路径处理。

## BashEnvVariableInfo

**公开导出**：`BashEnvVariableInfo` 来自 `@deepseek-ai/dsh-shell-env`。
`list()` 返回 `contributor`、`key`、`description`，供诊断注册表所有权使用；实际值因 `execution` 而变，必须调用 `collect` 才能得到。
