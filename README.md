# Convivium

A local evidence-gathering runtime for human-directed agent work.

Convivium 是一个 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/DeepSeek-Harness) 插件，用于在本地执行取证任务，并收集、审核和固化 Agent 产生的证据。它不依靠 Agent 相互说服、投票或共识来提高答案正确率；Meeting 只是受人类目标约束的执行与审计容器。

Captain 授权 Agenda，Manager 将其分解为具体问题和证据缺口，Contributor 在独立 Session 中取证，Evidence Reviewer 审核不可变的 EvidenceVersion。系统以结构化 command 记录来源、审核、发布、决策和停止条件。

当前版本为 `0.1.0-alpha.1`。实现状态见 [Current Implementation Coverage](docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)。

## Research context

Motger、Oriol、Marco 与 Franch 在综述 [_Multi-Agent Debate Strategies: Survey, Taxonomy, and Challenges_](https://arxiv.org/pdf/2607.26212) 中分析了 141 项 Multi-Agent Debate 研究。论文发现，主流设计集中在少数惯用模式，约十余项相互影响的设计选择又使研究结果难以可靠比较；目前没有原则性依据判断哪种 debate 配置在何时、为何有效。

Convivium 因此把多个 Agent 用于扩大和交叉检查证据来源，而不把语言交互本身当作证据。它在本地保存观察、材料、来源、解释、反证条件、不确定性和审核结果，再由明确授权的角色决定继续调查或停止。

## Install and run

Convivium 必须安装到持久 DSH web profile 后由 Host 启动。从源码仓库安装：

```sh
./scripts/install-from-source.sh
```

或者在用户选择的空工作目录安装 npm registry 的当前发布版本：

```sh
npm exec --yes --package @convivium/dsh-plugin@next -- convivium-install
```

在 `dsh-workspace/convivium-user/dev.env` 中设置 `DEEPSEEK_API_KEY`，然后启动：

```sh
./dsh-workspace/convivium-user/start.sh
```

默认 DSH workspace 是当前目录下的 `dsh-workspace/`。两种安装方式都支持 `--workspace <path>`。完整说明见 [安装并运行 Convivium](docs/50-operations/HOW-TO-INSTALL-AND-RUN.md)。

## Development

`plugin/` 是唯一可构建、测试和交付的工程。可从仓库根运行：

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify
```

`pnpm verify` 运行完整的静态检查、测试、构建和 package 验证。真实 DSH runtime 使用 [smoke profile](docs/50-operations/HOW-TO-DSH-SMOKE.md) 单独验证。
