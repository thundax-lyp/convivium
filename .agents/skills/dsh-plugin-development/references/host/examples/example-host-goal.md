# Example：装载持久目标 Service

本例针对 DSH `0.2.0-rc.2`，为 Session 提供目标日志和投影，不自动持续运行。对象见 [Goal 契约](../api/api-host-goal.md)，状态变更见 [HOW-TO](../how-to/how-to-host-goal.md)。

## 文件清单

```text
scratch-goal/
└── cordis.yml
```

`scratch-goal/cordis.yml`：

```yaml
- insert:
    - id: goal
      name: '@deepseek-ai/dsh-goal'
      config:
        defaultMaxGoalRounds: 256
```

## 装载与验证

目标 Profile 还需 Agent 与 SessionProjection。运行 `pnpm dsh web --patch ./scratch-goal/cordis.yml`，通过已装载的 Goal 工具或命令创建目标，读取 `ctx.goals.get(agent)` 核对 phase、revision 和轮次上限；暂停并重启 Session 后目标仍在，但自动续行不应自行启动。要自动继续，还需单独装载 `dsh-goal-round-driver` 并验证其策略。
