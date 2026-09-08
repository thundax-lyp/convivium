# HOW-TO：用 DSH 组合事件驱动的应用

以 DSH 自带的 GitHub 自动评审案例为主线，学习如何从一个场景选择能力、装配插件并确定结果。适用于 `dsh-v0.1.2-rc.1`；这是对上游案例的中文导读与迁移指导，不是已经为目标项目实现的功能。

上游材料位于该 tag 的 `docs/user/guide/github-review.md`、`apps/cli/config/examples/github-review/cordis.yml` 和同目录 `github-ready-review-rule.mjs`。核对时使用精确 tag 的文件，不使用当前分支同名文件。本篇保存理解案例所需的步骤；具体 API 继续按 [Web ingress](web-ingress.md) 核对。

## 要得到什么结果

输入：指定 GitHub 仓库的 PR 从 draft 变为 ready for review。

结果：DSH 在该仓库的 Web Workspace 内创建有标题的 root Session，启动只读评审，评审意见保留在 Session 中。案例不会向 GitHub 发布评论，不自动修复或合并 PR。

先用这句话限定范围，才能判断哪些能力需要组合。这里需要外部事件接入、条件匹配、会话执行和结果查看；不需要新模型工具、Subagent、Workflow 或自建前端。

## 步骤 1：选择承载应用

选择已有 `web` profile：案例需要 Web Workspace 和浏览器会话展示。复用已有 Agent、模型默认选择、preset、权限、标题与持久化能力；在 Web 组合上增加 opt-in overlay，不从空树重建应用。

这一步的产物是装配清单：

| 组件 | 为什么需要 | 案例如何提供 |
| --- | --- | --- |
| Web 应用及 Agent/Workspace 基础能力 | 创建并展示评审会话 | 既有 `web` profile |
| GitHub 入站 adapter | 验证签名、解析事件、交给 runtime | `@deepseek-ai/dsh-webhook-github` |
| Webhook runtime | 调用规则，将其返回值落实为 Workspace Session | `@deepseek-ai/dsh-webhook` |
| 业务规则插件 | 决定哪些 PR 需要评审、在哪执行、给模型什么任务 | `github-ready-review-rule.mjs` |
| 独立 ingress WebServer | 只对外提供 webhook 接口 | isolated `webServer` realm 下的 `@deepseek-ai/dsh-host-webserver` |

不把包已随 CLI 分发等同于默认启用；该案例通过 overlay 激活 webhook 包。

## 步骤 2：把业务选择写成规则

规则插件声明 `inject = ['webhookRuntime']`，通过 `ctx.webhookRuntime.register()` 注册，并用 `ctx.effect()` 托管返回的 disposer。匹配以下条件才返回 Session 请求，否则返回 `null`：

- source 为 `primary-github`；
- event 为 `pull_request`，action 为 `ready_for_review`；
- repository 与配置的完整仓库名一致。

Session 请求包含 `workspacePath`、`title`、`prompt`、`agentPreset` 和 `permissionPreset`。案例使用 `standard` 与 `read-only`，prompt 要求按准确 head SHA 评审、先刷新 PR 元数据、仅做必要只读检查，并把事件字段标成不可信 JSON 数据。

这里的选择理由是：触发条件是确定性业务规则，无需让模型判断是否启动；模型负责后续代码分析，无需新增一个“开始评审”工具。签名验证属于 adapter，业务筛选属于规则，Agent 创建属于 runtime，各自承担已有职责。

## 步骤 3：准备配置与加载路径

需要目标仓库的本地 checkout、可用的 DSH 模型配置、入站 webhook secret，以及 GitHub 能到达的独立 TLS 入口。入站 secret 只验证来源；如果评审要读取私有 PR，出站 GitHub 访问权限须另外具备。

在目标部署中配置仓库名和 Workspace 路径。上游示例硬编码的 `deepseek-harness/deepseek-harness` 是示例匹配值，不会自动取当前 Git remote；直接照搬可能导致事件永远不匹配。

对已安装 DSH，最明确的加载方式是按上游永久 profile 方式，把规则模块放到 `$DSH_HOME/profiles/web/cordis.patch.yml` 旁，将 overlay 的 rows 追加到该 patch，保留已有配置，再运行 `dsh web`。若改用外部 `--patch` 文件，必须核对 Loader 的模块解析锚点；必要时将规则 row 的 `name` 改为规则模块的绝对路径。不能因两个文件放在同一外部目录，就假定 `./github-ready-review-rule.mjs` 相对 patch 文件解析。详见[组合配置](composition-config-credentials.md)。

监听默认是 loopback 的 3081 端口和 `/github` 路径，Web UI 保留在 3080。将独立入口转发给 GitHub，配置 Pull requests 事件、JSON content type 和一致的 secret。公网入口、secret 和真实 GitHub 配置属于运行部署步骤；阅读或设计本案例不需要执行这些外部操作。

## 步骤 4：沿一次事件解释全过程

```text
GitHub ready_for_review delivery
  → 独立 ingress：签名与 JSON 校验
  → webhookRuntime：按 provider kind 调用规则
  → 规则：筛选 source/repository/action，返回 Session 请求
  → runtime：验证 preset，解析 Workspace，创建并关联 Agent/Session
  → 应用权限、标题，followup 排入初始评审任务
  → Agent 执行评审，Session 记录普通执行历史
  → 用户在 Web Workspace 查看结果
```

这条路径存在三个不同的结果边界：HTTP `202` 仅表示入站数据通过验证、规则已在内存中安排；规则返回请求也不等于 Agent 已执行；`followup()` 成功才是 webhook 操作的提交点，仍不等于评审成功。该案例没有发布业务完成状态，最终内容需从普通 Session 行为观察。

## 步骤 5：检查失败和恢复边界

| 场景 | 上游案例的语义 | 设计者应如何处理 |
| --- | --- | --- |
| 合法签名但仓库或 action 不匹配 | 规则返回 `null`，不创建评审 Session；仍可能返回 HTTP `202` | 验证业务筛选，不能只看 HTTP 状态 |
| 重复 delivery | 再次运行规则，可能再创建 Session | 只有需求要求去重时才设计持久去重 owner；`deliveryId` 本身不去重 |
| 初始 prompt 尚未接受时进程退出 | 内存中的规则调用可能丢失，无内置队列或重试 | 可靠交付需求需要额外明确协议，不能宣称已满足 |
| prompt 已接受但评审失败 | 后续由普通 Agent/Session 生命周期处理 | 不把入站成功作为业务成功；按需求定义失败展示 |
| 规则卸载 | 先停止接收，再 abort 并等待正在运行的回调 | 自定义异步规则需响应 signal，不能遗留未托管工作 |

## 步骤 6：验证组合，再迁移到自己的场景

设计阶段列出预期即可；实现阶段先用本地 fixture 验证匹配/不匹配、签名失败和重复交付语义，再用真实 Loader 验证依赖、隔离与规则模块解析。上游的 webhook runtime、GitHub handler 和 Loader 测试是可参考证据，不等于目标部署已经验证。真实 GitHub/模型验证另记录实际结果。

迁移时按以下顺序替换，而不是先增加框架：

1. 把“PR ready”替换为目标触发条件，明确期望输出。
2. 入口仍是 GitHub 时复用 adapter，只改规则；改成其他外部协议时核对现有 adapter，缺失才设计新的适配器。
3. 确认仍需“创建 Web Workspace Session”；若要向既有 Session 发送、使用 SDK 或执行确定性动作，重新选择入口和公开契约，不强行返回本案例的 Session 请求。
4. 替换 Workspace、preset、权限与 prompt；只在 Agent 缺少必要执行能力时新增 Tool/Provider。
5. 补齐项目确实要求而案例未提供的去重、可靠交付、业务完成定义或外部发布边界。

最终用[应用设计流程](application-design.md#设计交付与停止条件)的表记录选型、业务 owner、限制和验证；将上游已有行为与项目拟新增行为分开。

## 其他上游 HOW-TO 入口

- `docs/user/develop/basic/index.md`：第一个插件，从文件、overlay 到 Web 加载；适合先理解最小注册与生命周期。
- `docs/user/develop/basic/tool.md`：新增模型工具；在业务需要模型主动调用动作时继续。
- `docs/user/develop/practice/index.md`：三角色能力教程；需要 Provider 独立替换时使用，不把三包拆分当入门必选项。
- `docs/user/guide/github-review.md`：本篇案例的部署与扩展原文；配套源码比纯机制列表更适合学习应用组合。

这些路径均属于固定 tag 的上游仓库，不是目标项目必须创建的目录或复制的工程结构。
