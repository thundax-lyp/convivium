# Evidence Matrix

证据矩阵把正式文档中的业务约束转换成可审查的实现链路。它是审查工作的中间产物，不是新的需求来源。

## 建立步骤

1. 只从当前 PR 相关的 `docs/10-requirements/`、`docs/20-interfaces/`、`docs/30-designs/`、`docs/00-governance/` 和 `docs/40-readiness/` 提取已确认条款。
2. 为每条条款记录精确来源、适用对象和变更涉及的文件。
3. 沿调用链填写 `source → producer → adapter → validator → consumer/sink`。
4. 增加至少一个相关负向场景；若条款涉及持久化、异步或生命周期，再增加重复、重启、部分失败或交错时序场景。
5. 记录测试、脚本、运行时 smoke 或人工检查等实际证据。
6. 对缺少 validator、consumer/sink、负向场景或证据的条目标记 `deferred` 或 `validation gap`。

## 统一字段

| 文档条款 | 来源位置 | Changed anchor | Producer | Adapter | Validator | Consumer/Sink | 负向场景 | 验证证据 | 状态 |
|---|---|---|---|---|---|---|---|---|---|

## 必查关系

根据当前条款和 changed surfaces，按需建立以下关系；这是方法清单，不是业务约束清单：

- 接口字段 ↔ 类型定义 ↔ schema ↔ 序列化 ↔ 消费者
- 状态定义 ↔ 转换入口 ↔ 事件 ↔ 投影
- 身份来源 ↔ 授权检查 ↔ 资源定位 ↔ 副作用
- 持久化事实 ↔ 幂等记录 ↔ 异步副作用 ↔ 重启恢复
- 资源创建 ↔ ownership ↔ 失败清理 ↔ 关闭/归档
- 正式事实 ↔ 派生输出 ↔ 缓存/日志/归档
- 配置声明 ↔ 实际 enforcement ↔ 运行验证
- 测试前提 ↔ 被测对象 ↔ 断言结果 ↔ 真实运行入口

## 与历史 Review Comments 的关系

历史 Codex comments 可以作为缺陷模式索引，帮助选择上述关系和负向场景；不能直接升级为当前业务规则。每个历史模式都必须回到当前正式文档确认是否适用。
