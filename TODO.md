# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

## 待审阅任务项

以下任务按编号顺序执行。`F2.1` 与 `F2.2` 可在 `F1.4` 完成后分别实施，但 `F2.3` 必须等待两者完成；其他任务不得跳过前置项。每项只完成列出的主要目标，不顺带实现会议业务。

- [ ] `F2.3 / plugin module boundary gate`：把模块依赖矩阵实现为可失败检查
    - 依据文档：`docs/30-designs/RUNBOOK-IMPLEMENT-CONVIVIUM-FRAMEWORK.md` §4.4、§8 T2
    - 前置任务：`F2.1`、`F2.2`
    - 关联文件：`plugin/tests/unit/module-boundaries.spec.ts`
    - 处理动作：编码 `ModuleName`、`ModuleBoundary` 和允许/禁止 import 矩阵，并扫描当前 `src` import。
    - 验收点：当前源码通过；临时给 Client 加入一个 Host import 后检查失败；恢复后再次通过。
    - 主验证：`pnpm --dir plugin exec vitest run tests/unit/module-boundaries.spec.ts --environment node`；`F3.1` 完成后改用正式 test script。
    - 停止条件：矩阵与 Implementation Design 冲突时停止并修订设计，不修改测试白名单适配代码。

- [ ] `F3.1 / plugin Vitest environments`：建立 Host、Client 和 contract 测试环境
    - 依据文档：`docs/30-designs/RUNBOOK-IMPLEMENT-CONVIVIUM-FRAMEWORK.md` §6.3、§6.5
    - 前置任务：`F2.3`
    - 关联文件：`plugin/vitest.config.ts`、`plugin/package.json`
    - 处理动作：配置 Node Host、browser-compatible Client 和 contract 测试选择规则及基础 scripts。
    - 验收点：三类测试可被独立选择；Client 环境不继承 Node globals；空的 integration、recovery、stress 明确报告未覆盖而非伪造测试。
    - 主验证：`pnpm --dir plugin test`
    - 停止条件：测试只能在统一 jsdom + Node globals 环境运行时停止并修复环境隔离。

- [ ] `F3.2 / plugin framework tests`：实现模块边界、package manifest 和 Client entry 测试
    - 依据文档：`docs/30-designs/RUNBOOK-IMPLEMENT-CONVIVIUM-FRAMEWORK.md` §6.5
    - 前置任务：`F3.1`
    - 关联文件：`plugin/tests/unit/module-boundaries.spec.ts`、`plugin/tests/contract/package-contract.spec.ts`、`plugin/tests/client/client-entry.client.spec.ts`
    - 处理动作：让三类测试分别验证边界矩阵、静态 package 契约和 Client 加载/dispose。
    - 验收点：三个测试文件均至少包含一个能因真实输入错误而失败的断言；名称不声称会议、恢复或 UI 业务已经可用。
    - 主验证：`pnpm --dir plugin test`
    - 停止条件：测试需要伪造会议结果才能通过时删除该断言，只保留框架覆盖。

- [ ] `F3.3 / plugin package verifier`：实现磁盘产物验证脚本
    - 依据文档：`docs/30-designs/RUNBOOK-IMPLEMENT-CONVIVIUM-FRAMEWORK.md` §6.4
    - 前置任务：`F1.5`、`F3.2`
    - 关联文件：`plugin/scripts/verify-package.mjs`、`plugin/package.json`
    - 处理动作：从真实 package manifest、patch 和 build 产物计算 `PackageVerificationResult`，任一失败字段使进程非零退出。
    - 验收点：正确产物通过；缺少 `lib/client.js`、错误 patch name、开放式 files allowlist 三种故障分别失败，且每次都恢复文件。
    - 主验证：`pnpm --dir plugin verify:package`
    - 停止条件：验证器依赖复制的期望 manifest 或固定成功返回时停止并改为读取磁盘事实。

- [ ] `F3.4 / plugin verify composition`：建立统一且不夸大覆盖的验证入口
    - 依据文档：`docs/30-designs/RUNBOOK-IMPLEMENT-CONVIVIUM-FRAMEWORK.md` §6.3、§8 T3
    - 前置任务：`F3.3`
    - 关联文件：`plugin/package.json`
    - 处理动作：组装 `typecheck`、`test`、`build`、`verify:package` 和 `verify`，并保留 integration、recovery、stress 入口。
    - 验收点：`verify` 按顺序运行所有真实 gate；空业务测试明确为未覆盖；删除一个产物或制造类型错误会使 `verify` 失败。
    - 主验证：`pnpm --dir plugin verify`
    - 停止条件：任一子命令失败时停止并修复该子任务，不用 `|| true`、跳过或假测试绕过。

- [ ] `F4.1 / repository plugin CI`：为四个插件 gate 建立独立 CI jobs
    - 依据文档：`docs/30-designs/RUNBOOK-IMPLEMENT-CONVIVIUM-FRAMEWORK.md` §7
    - 前置任务：`F3.4`
    - 关联文件：`.github/workflows/pr-verify.yml`
    - 处理动作：保留 Governance，新增 Plugin Typecheck、Plugin Test、Plugin Build 和 Package Contract；Package Contract 显式依赖 Build。
    - 验收点：五类 job 名称稳定且独立可见；使用 Node 22.19+、frozen lockfile；每个 plugin job 只公开执行对应 gate。
    - 主验证：解析 workflow YAML，并在可用 PR 上确认全部 jobs 至少启动一次。
    - 停止条件：远端不可用时仅记录未验证，不声称 CI 或 Ruleset 已生效。

- [ ] `F4.2 / repository PR governance`：同步 CI 覆盖与分支保护口径
    - 依据文档：`docs/30-designs/RUNBOOK-IMPLEMENT-CONVIVIUM-FRAMEWORK.md` §7；`docs/00-governance/PR-RULES.md`
    - 前置任务：`F4.1`
    - 关联文件：`docs/00-governance/PR-RULES.md`
    - 处理动作：记录实际 CI job 名称、覆盖边界和 Ruleset 未覆盖项，删除“尚未执行插件检查”的旧口径。
    - 验收点：治理文档与 workflow 一一对应；未观察到的远端行为明确标为 `Not Covered`；不把 job 存在等同于必过保护。
    - 主验证：逐项比对 workflow job display name 与 PR Rules，并运行 `git diff --check`。
    - 停止条件：workflow 名称仍在变化时先稳定 `F4.1`，不写预测性治理结论。

- [ ] `F5.1 / framework readiness evidence`：记录框架实现的验证事实和未覆盖边界
    - 依据文档：`docs/30-designs/RUNBOOK-IMPLEMENT-CONVIVIUM-FRAMEWORK.md` §8 T5、§10；`docs/00-governance/DOCUMENT-RULES.md`
    - 前置任务：`F4.2`
    - 关联文件：`docs/40-readiness/CONVIVIUM-FRAMEWORK-EVIDENCE.md`
    - 处理动作：记录日期、环境、commit 边界、命令、结果和 `Not Covered`，不重复设计正文。
    - 验收点：证据明确区分已验证框架与未覆盖的会议业务、SQLite、真实 DSH Session、恢复、压力和 UI；每项结果可追溯到命令或 CI job。
    - 主验证：执行 RUNBOOK §10 的全套命令，并核对 evidence 中每条成功声明。
    - 停止条件：任一必需 gate 未通过时如实记录失败，不能进入 `F5.2`。

- [ ] `F5.2 / framework task closure`：迁移长期结论并清理 RUNBOOK 和已完成 TODO
    - 依据文档：`docs/30-designs/RUNBOOK-IMPLEMENT-CONVIVIUM-FRAMEWORK.md` §11；`docs/00-governance/TODO-RULES.md`
    - 前置任务：`F5.1`
    - 关联文件：`docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md`、`docs/30-designs/RUNBOOK-IMPLEMENT-CONVIVIUM-FRAMEWORK.md`、`TODO.md`
    - 处理动作：确认长期判断已有正式归属；在真正完成任务的 commit 中删除 RUNBOOK 和对应已完成 TODO。
    - 验收点：最终 HEAD 不包含临时 RUNBOOK、已完成 TODO、构建产物、临时 profile、测试数据库、绝对路径或凭据；`git diff --check` 通过。
    - 主验证：`git status --short`、`git diff --check`，并搜索 RUNBOOK 残留引用。
    - 停止条件：存在未完成任务时只收窄 TODO；不得提前删除 RUNBOOK 或把未验证工作描述为完成。

## 待讨论项
