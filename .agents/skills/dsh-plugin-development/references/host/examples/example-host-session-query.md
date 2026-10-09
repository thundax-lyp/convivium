# Example：装载 SQLite Session 查询后端

本例针对 DSH `0.2.0-rc.2` 的现成检索 backend。对象见 [SessionQuery 契约](../api/api-host-session-query.md)，插件使用步骤见 [HOW-TO](../how-to/how-to-host-session-query.md)。

## 文件清单

```text
scratch-session-query/
└── cordis.yml
```

`scratch-session-query/cordis.yml`：

```yaml
- insert:
    - id: session-query-sqlite
      name: '@deepseek-ai/dsh-session-query-sqlite'
```

目标 Profile 还需 `sessions` 服务；若要查询冷数据，需装载 SessionPersistence。SQLite 文件与索引配置以目标 package 的配置声明为准，不能从抽象 Service 推断。

## 装载与验证

在目标 checkout 用 `pnpm dsh web --patch ./scratch-session-query/cordis.yml` 启动。插件注入 `sessionQuery` 后，先 `await ctx.sessionQuery.listSessions()`，从返回的一个 id 调 `readSession(id)` 并核查原始事件不被激活为 live Session。对同一历史做 `searchEvents`，验证索引命中、取消和分页；恢复进程后复查结果。此示例只组合现成 backend，不是新索引实现。
