# Example：启用默认会话压缩

本例针对 DSH `0.2.0-rc.2` 的 Loader 组合，使用目标版本已实现的模型摘要 backend 与手动命令。它不是自定义 backend 的完整实现；事务、工具配对和恢复契约见 [压缩对象](../api/api-host-compaction.md) 与 [HOW-TO](../how-to/how-to-host-compaction.md)。

## 文件清单

```text
scratch-compaction/
└── cordis.yml
```

`scratch-compaction/cordis.yml`：

```yaml
- insert:
    - id: compaction-basic
      name: '@deepseek-ai/dsh-compaction-basic'
    - id: command-compact
      name: '@deepseek-ai/dsh-command-compact'
```

目标 Profile 必须装载这些包所需的 Session、Agent、LLM、token meter 和 commands 服务。若 Profile 已含某个同名插件，先检查其现有装载，不要重复插入。

## 装载与验证

在目标 checkout 根目录用 `pnpm dsh web --patch ./scratch-compaction/cordis.yml` 启动。累积足够长且可压缩的对话后，在支持命令的 UI 输入 `/compact`；检查命令报告被替换数量，以及 Session 日志中的 `compaction/start`、`compaction/summary`、替换 `user/message`、`compaction/end` 顺序。重启恢复后模型历史应继续显示摘要和保留的最近内容；原始日志仍包含被遮蔽事件。此例仅说明装载和可观察结果，未替代 backend 的故障注入验证。
