# Example：模型发起一次 Workflow

本例展示 DSH `0.2.0-rc.2` 公开 Workflow 脚本形态。需要已装载具体 engine、子 Agent provider 与 `dsh-tool-workflow`。对象见 [Workflow 契约](../api/api-host-workflow.md)，插件直接调用及清理见 [HOW-TO](../how-to/how-to-host-workflow.md)。

## 提交的脚本

传给 `workflow` 工具的 `meta`：

```json
{"name":"review-two-files","description":"独立检查两个文件的正确性"}
```

`script` 是以下 JS 正文：

```js
const reviews = await parallel([
  () => agent('检查 src/a.ts 的正确性'),
  () => agent('检查 src/b.ts 的正确性'),
])
return { reviewed: reviews.length, reviews }
```

## 验证

通过目标版本的 `dsh-tool-workflow` 提交同一 `meta` 和 `script`，确认完成时返回 run id、启动的子 Agent 数和 JSON 结果；有子任务失败时脚本须明确处理对应 `null`。取消时 `stopReason` 应为 `cancelled`，caller 须等待 run dispose。这个脚本不装载 engine，也不证明自定义 engine 的生命周期实现。
