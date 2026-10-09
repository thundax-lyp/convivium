# Example：启用进程内子 Agent

本例针对 DSH `0.2.0-rc.2`，装载 Service、具名 spawn provider 和模型委派工具。对象见 [委派契约](../api/api-host-subagent.md)，自定义 provider 步骤见 [HOW-TO](../how-to/how-to-host-subagent.md)。

## 文件清单

```text
scratch-subagent/
└── cordis.yml
```

`scratch-subagent/cordis.yml`：

```yaml
- insert:
    - id: subagent
      name: '@deepseek-ai/dsh-subagent'
    - id: subagent-spawn
      name: '@deepseek-ai/dsh-subagent-spawn-in-process'
    - id: tool-subagent
      name: '@deepseek-ai/dsh-tool-subagent'
      config:
        provider: spawn
        toolName: subagent
```

## 装载与验证

目标 Profile 需 Agent、Session、Tools 及子 Agent provider 所需的模型与持久化服务。运行 `pnpm dsh web --patch ./scratch-subagent/cordis.yml`，让 Agent 发起一个短 one-shot 子任务，检查工具结果来自子 Agent 最终答案、父级 Session 有委派记录、失败结果不会伪装成功。此例是官方 README 的最小组合；替换为自定义 provider 时必须验证其能力与清理契约。
