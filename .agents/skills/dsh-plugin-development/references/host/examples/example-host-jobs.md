# Example：启用本地后台 Job 能力

目标 DSH `0.2.0-rc.2` 的现成组合使用进程内 registry 和模型控制工具。对象见 [Job 契约](../api/api-host-jobs.md)，生产者步骤见 [HOW-TO](../how-to/how-to-host-jobs.md)。

## 文件清单

```text
scratch-jobs/
└── cordis.yml
```

`scratch-jobs/cordis.yml`：

```yaml
- insert:
    - id: jobs-local
      name: '@deepseek-ai/dsh-jobs-local'
    - id: tool-jobs
      name: '@deepseek-ai/dsh-tool-jobs'
```

## 装载与验证

目标 Profile 还需 Agent、Tools 与 SystemPrompt 服务，且未装载另一个 `ctx.jobs` 实现。在 checkout 根目录运行 `pnpm dsh web --patch ./scratch-jobs/cordis.yml`，再由会启动后台 Job 的 producer 工具创建任务。模型可使用 `job_list`、`job_output`、`job_kill`；观察完成通知及 Session owner 隔离。此配置只提供 registry 与控制器，不会自行生产 Job，且进程重启不恢复本地 Job。
