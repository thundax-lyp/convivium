# 给自定义 Profile 安装运行时自检

## 给插件组合装载包拥有的不变式检查

选择一个确实拥有可变状态或持久事件关系的包，并确认它发布 `./invariant` companion。先读 [InvariantRegistry 契约](../api/api-infra-invariants.md#invariantregistry)；它不替代单元测试、声明编译或 Profile 装载检查。

### 顺序

1. 在自己的 bundle/Profile patch 中装载 `@deepseek-ai/dsh-invariants`，设置 `enabled` 与包名过滤；具体文件见 [完整组合示例](../examples/example-infra-invariants.md)。
2. 在 registry 之后装载目标包的 `./invariant` companion。若写自有 companion，在 installer 中只观察本包负责的事件与快照关系，使用绑定的 `fail` 报告违约；声明所需依赖，确保监听器归子 fiber 清理。
3. 启动 Profile；主动触发一条正常状态变化，确认没有 `INVARIANT`。在隔离测试中制造本包关系的违约，确认 `InvariantError.packageName` 指向本包。再卸载 companion，核对监听器和占有均释放，重载可再次登记。

### 失败与完成判据

重复包名、无效过滤表达式或 installer 安装失败都应让装载失败。一个未发布 companion 的包不会因为 registry 存在而自动受检；一个只检查 service 是否存在的 companion 不能证明运行时关系。完成时必须能在目标 Profile 观察到正常/违约两条路径及卸载清理。
