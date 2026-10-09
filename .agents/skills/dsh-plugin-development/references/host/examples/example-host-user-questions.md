# Example：装载模型问答工具

本例针对 DSH `0.2.0-rc.2`，展示最小 Host Service 与模型工具组合。实际回答还需要一个 local 或 Web answerer；对象见 [问答契约](../api/api-host-user-questions.md)，调用步骤见 [HOW-TO](../how-to/how-to-host-user-questions.md)。

## 文件清单

```text
scratch-user-questions/
└── cordis.yml
```

`scratch-user-questions/cordis.yml`：

```yaml
- insert:
    - id: user-questions
      name: '@deepseek-ai/dsh-user-questions'
    - id: tool-ask-user
      name: '@deepseek-ai/dsh-tool-ask-user'
```

## 装载与验证

在已有 Agent、Tools、SessionProjection 和 answerer 的目标 Profile 中运行 `pnpm dsh web --patch ./scratch-user-questions/cordis.yml`。让 Agent 提出单选问题，确认用户回答与工具结果一致；再验证取消和无 answerer 会明确失败。若没有 answerer，此组合不会自己生成浏览器回答界面。
