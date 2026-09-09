# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

以下任务按 M01—M13、M13a、M14—M16 顺序执行，前一步 PASS 才能进入下一步；关联文件来自对应 RUNBOOK 的允许修改清单，保留“新”和“删除”标记；命令、文件内修改范围与 STOP 仍以 RUNBOOK 为准。各步骤另可同步本文件对应任务，文件列表不扩大修改许可。环境与迁移前 baseline 已完成，不另列环境确认任务。任务关闭遵循 [TODO Rules](docs/00-governance/TODO-RULES.md#closure-rules)，不在此保留执行日志。

- [ ] `runtime/meeting-refresh-feed`：M01 实现有界刷新通知
    - 依据文档：[Meeting Remote Migration RUNBOOK][remote-migration-runbook]，M01。
    - 关联文件：[plugin/src/protocol/types.ts](plugin/src/protocol/types.ts)；新 `plugin/src/runtime/services/meeting-refresh-feed.ts`；新 `plugin/tests/unit/meeting-refresh-feed.spec.ts`。
    - 确认依据：2026-09-09 本任务中用户确认九接口一次迁移、替换五秒轮询及 review 修复；设计提交 `f7b6812`；本轮要求据此制定 TODO。
    - 处理动作：实现 refresh 类型及可取消、可关闭的内存 feed。
    - 验收点：首帧、版本去重、通知合并及 abort/return/dispose 的计数与 done 断言通过。

- [ ] `runtime/application-service`：M02 接入提交后刷新通知
    - 依据文档：[Meeting Remote Migration RUNBOOK][remote-migration-runbook]，M02。
    - 关联文件：[plugin/src/runtime/application-service/types.ts](plugin/src/runtime/application-service/types.ts)；[plugin/src/runtime/application-service/index.ts](plugin/src/runtime/application-service/index.ts)；[plugin/tests/contract/meeting-runtime.spec.ts](plugin/tests/contract/meeting-runtime.spec.ts)；[plugin/tests/contract/http-boundary.spec.ts](plugin/tests/contract/http-boundary.spec.ts) 仅补 fixture 的新 watch 方法。
    - 确认依据：2026-09-09 本任务中用户确认九接口一次迁移、替换五秒轮询及 review 修复；设计提交 `f7b6812`；本轮要求据此制定 TODO。
    - 处理动作：将 feed 接入既有 onProjectionCommitted 和 Runtime 生命周期。
    - 验收点：成功提交后状态可读再通知；失败提交无通知；重开首帧与清理测试通过。

- [ ] `remote`：M03 实现九方法 Remote Service
    - 依据文档：[Meeting Remote Migration RUNBOOK][remote-migration-runbook]，M03。
    - 关联文件：新 `plugin/src/remote/index.ts`、新 `plugin/src/remote/types.ts`；[plugin/package.json](plugin/package.json)、[plugin/pnpm-lock.yaml](plugin/pnpm-lock.yaml)、[plugin/eslint.config.js](plugin/eslint.config.js)。
    - 确认依据：2026-09-09 本任务中用户确认九接口一次迁移、替换五秒轮询及 review 修复；设计提交 `f7b6812`；本轮要求据此制定 TODO。
    - 处理动作：按既定输入、错误契约实现 Service、wire 类型和 Service 私有取消生命周期。
    - 验收点：Host 类型检查通过；仅新增规定的五个 DSH 依赖，业务 DTO/Schema 不变。

- [ ] `plugin/build`：M04 生成可发布 Remote contract
    - 依据文档：[Meeting Remote Migration RUNBOOK][remote-migration-runbook]，M04。
    - 关联文件：新 `plugin/scripts/generate-typert.mjs`；[plugin/package.json](plugin/package.json)、[plugin/tsdown.config.ts](plugin/tsdown.config.ts)；[plugin/scripts/verify-package.mjs](plugin/scripts/verify-package.mjs)；[plugin/tests/contract/package-contract.spec.ts](plugin/tests/contract/package-contract.spec.ts)；新 `plugin/tests/contract/remote-generation.spec.ts`。
    - 确认依据：2026-09-09 本任务中用户确认九接口一次迁移、替换五秒轮询及 review 修复；设计提交 `f7b6812`；本轮要求据此制定 TODO。
    - 处理动作：使用正式包在临时 staging 生成并打包 Host/Client contract。
    - 验收点：十个 endpoint、四个生成文件和类型 exports 验证通过；staging 清理，不依赖 DSH checkout。

- [ ] `remote/tests`：M05 验证源码 Gateway 边界
    - 依据文档：[Meeting Remote Migration RUNBOOK][remote-migration-runbook]，M05。
    - 关联文件：[plugin/vitest.config.ts](plugin/vitest.config.ts)、[plugin/package.json](plugin/package.json)；新 `plugin/tests/fixtures/remote-gateway.ts`；新 `plugin/tests/contract/remote-boundary.spec.ts`。
    - 确认依据：2026-09-09 本任务中用户确认九接口一次迁移、替换五秒轮询及 review 修复；设计提交 `f7b6812`；本轮要求据此制定 TODO。
    - 处理动作：接入正式 decorator transform，以正式 Gateway 验证九方法与卸载取消。
    - 验收点：D2/D4 断言全部通过；Service 卸载结束 pending next，caller signal 与 Runtime 不被销毁。

- [ ] `plugin/host-composition`：M06 装配可选 Remote 子作用域
    - 依据文档：[Meeting Remote Migration RUNBOOK][remote-migration-runbook]，M06。
    - 关联文件：[plugin/src/index.ts](plugin/src/index.ts)；[plugin/tests/unit/host-plugin-lifecycle.spec.ts](plugin/tests/unit/host-plugin-lifecycle.spec.ts)；[plugin/scripts/verify-plugin-contract.mjs](plugin/scripts/verify-plugin-contract.mjs)。
    - 确认依据：2026-09-09 本任务中用户确认九接口一次迁移、替换五秒轮询及 review 修复；设计提交 `f7b6812`；本轮要求据此制定 TODO。
    - 处理动作：在精确 loopback 且依赖齐全时装配同一 Runtime 的 Remote Service。
    - 验收点：缺 Web 不影响 tools；子域和父域清理计数正确；旧 prefix 不再注册。

- [ ] `client/meeting-client`：M07 建立九方法 Client adapter
    - 依据文档：[Meeting Remote Migration RUNBOOK][remote-migration-runbook]，M07。
    - 关联文件：新 `plugin/src/client/meeting-client.ts`；[plugin/tsconfig.client.json](plugin/tsconfig.client.json)；新 `plugin/tests/client/meeting-client.client.spec.ts`。
    - 确认依据：2026-09-09 本任务中用户确认九接口一次迁移、替换五秒轮询及 review 修复；设计提交 `f7b6812`；本轮要求据此制定 TODO。
    - 处理动作：显式导入 generated augmentation，封装九方法及结果和错误校验。
    - 验收点：本步独立 Client 类型检查通过；九方法参数、signal、成功与错误行为符合契约。

- [ ] `client/remote-tests`：M08 验证生成客户端与测试类型
    - 依据文档：[Meeting Remote Migration RUNBOOK][remote-migration-runbook]，M08。
    - 关联文件：新 `plugin/tests/fixtures/remote-client.ts`；新 `plugin/tests/fixtures/remote-stream.ts`；`plugin/tests/client/meeting-client.client.spec.ts`；新 `plugin/tests/client/meeting-remote-types.ts`；新 `plugin/tsconfig.remote-test.json`；[plugin/package.json](plugin/package.json)。
    - 确认依据：2026-09-09 本任务中用户确认九接口一次迁移、替换五秒轮询及 review 修复；设计提交 `f7b6812`；本轮要求据此制定 TODO。
    - 处理动作：验证真实 generated contribution 装卸和 unary 调用，并提供真实 RemoteStream fixture。
    - 验收点：mount/unmount、合法与非法参数测试通过；类型反例和 fixture 通过 typecheck:remote-test。

- [ ] `client/meeting-panel`：M09 切换面板九个调用
    - 依据文档：[Meeting Remote Migration RUNBOOK][remote-migration-runbook]，M09。
    - 关联文件：[plugin/src/client/index.tsx](plugin/src/client/index.tsx)、[plugin/src/client/meeting-panel.tsx](plugin/src/client/meeting-panel.tsx)；[plugin/tests/client/meeting-panel.client.spec.ts](plugin/tests/client/meeting-panel.client.spec.ts)。
    - 确认依据：2026-09-09 本任务中用户确认九接口一次迁移、替换五秒轮询及 review 修复；设计提交 `f7b6812`；本轮要求据此制定 TODO。
    - 处理动作：通过 slots 注入 MeetingClient，替换原 HTTP 调用和 fetch 测试。
    - 验收点：原 UI 业务断言全部通过；类型检查和构建通过，模块工厂保持原装配方式。

- [ ] `client/refresh-scheduling`：M10 串行化刷新与写后补读
    - 依据文档：[Meeting Remote Migration RUNBOOK][remote-migration-runbook]，M10。
    - 关联文件：[plugin/src/client/meeting-panel.tsx](plugin/src/client/meeting-panel.tsx)；[plugin/tests/client/meeting-panel.client.spec.ts](plugin/tests/client/meeting-panel.client.spec.ts)。
    - 确认依据：2026-09-09 本任务中用户确认九接口一次迁移、替换五秒轮询及 review 修复；设计提交 `f7b6812`；本轮要求据此制定 TODO。
    - 处理动作：统一刷新入口，加入 dirty 合并、读取失效及写后解锁补读。
    - 验收点：R1/R2/R3/R6 与原 UI 测试通过；无写后死锁，旧响应不能覆盖新状态。

- [ ] `client/refresh-stream`：M11 以 stream 替换五秒轮询
    - 依据文档：[Meeting Remote Migration RUNBOOK][remote-migration-runbook]，M11。
    - 关联文件：[plugin/src/client/meeting-panel.tsx](plugin/src/client/meeting-panel.tsx)；[plugin/tests/client/meeting-panel.client.spec.ts](plugin/tests/client/meeting-panel.client.spec.ts)。
    - 确认依据：2026-09-09 本任务中用户确认九接口一次迁移、替换五秒轮询及 review 修复；设计提交 `f7b6812`；本轮要求据此制定 TODO。
    - 处理动作：接入订阅、focus 重建和 generation 失效，删除周期读取。
    - 验收点：R1—R10 全通过；断线禁写、首帧前旧读失效、补读后恢复；无 setInterval 残留。

- [ ] `plugin/http-removal`：M12 移除旧 HTTP 实现
    - 依据文档：[Meeting Remote Migration RUNBOOK][remote-migration-runbook]，M12。
    - 关联文件：删除 [plugin/src/http/index.ts](plugin/src/http/index.ts)、删除 [plugin/tests/contract/http-boundary.spec.ts](plugin/tests/contract/http-boundary.spec.ts)；`plugin/tests/contract/remote-boundary.spec.ts`；[plugin/tests/contract/meeting-runtime.spec.ts](plugin/tests/contract/meeting-runtime.spec.ts)；[plugin/eslint.config.js](plugin/eslint.config.js)、[plugin/tests/unit/module-boundaries.spec.ts](plugin/tests/unit/module-boundaries.spec.ts)、[plugin/tests/contract/production-import-graph.spec.ts](plugin/tests/contract/production-import-graph.spec.ts)。
    - 确认依据：2026-09-09 本任务中用户确认九接口一次迁移、替换五秒轮询及 review 修复；设计提交 `f7b6812`；本轮要求据此制定 TODO。
    - 处理动作：删除旧 transport，并将 Runtime 边界用例和模块约束迁移到 Remote。
    - 验收点：原领域、幂等及恢复断言保留；边界测试和 lint 通过，Client 不导入 Host 实现。

- [ ] `smoke-profile/unary`：M13 迁移真实 profile unary 探针
    - 依据文档：[Meeting Remote Migration RUNBOOK][remote-migration-runbook]，M13。
    - 关联文件：[plugin/scripts/smoke-profile/probe/support.js](plugin/scripts/smoke-profile/probe/support.js)、[plugin/scripts/smoke-profile/probe/index.js](plugin/scripts/smoke-profile/probe/index.js)、[plugin/scripts/smoke-profile/probe/scenarios/baseline.js](plugin/scripts/smoke-profile/probe/scenarios/baseline.js)、[plugin/scripts/smoke-profile/probe/scenarios/scribe-minutes.js](plugin/scripts/smoke-profile/probe/scenarios/scribe-minutes.js)、[plugin/scripts/smoke-profile/result.mjs](plugin/scripts/smoke-profile/result.mjs)；[plugin/tests/unit/scripts/smoke-profile.spec.ts](plugin/tests/unit/scripts/smoke-profile.spec.ts)、[plugin/tests/unit/scripts/smoke-profile-contract.spec.ts](plugin/tests/unit/scripts/smoke-profile-contract.spec.ts)、[plugin/tests/unit/scripts/scribe-minutes-probe.spec.ts](plugin/tests/unit/scripts/scribe-minutes-probe.spec.ts)；新 `plugin/tests/unit/scripts/remote-probe.spec.ts`。
    - 确认依据：2026-09-09 本任务中用户确认九接口一次迁移、替换五秒轮询及 review 修复；设计提交 `f7b6812`；本轮要求据此制定 TODO。
    - 处理动作：将 baseline 和 scribe-minutes 探针改为带正式认证的 DSH RPC。
    - 验收点：探针测试通过；旧路径与 callHttp 零匹配；原 transcript/minutes 业务断言保留。

- [ ] `smoke-profile/websocket`：M13a 补齐真实 WebSocket 门禁
    - 依据文档：[Meeting Remote Migration RUNBOOK][remote-migration-runbook]，M13a。
    - 关联文件：[plugin/scripts/smoke-profile/index.mjs::writeProbePackage](plugin/scripts/smoke-profile/index.mjs)、[plugin/scripts/smoke-profile/probe/support.js::createRemoteProbe](plugin/scripts/smoke-profile/probe/support.js)、[plugin/scripts/smoke-profile/probe/index.js](plugin/scripts/smoke-profile/probe/index.js)、[plugin/scripts/smoke-profile/probe/scenarios/baseline.js](plugin/scripts/smoke-profile/probe/scenarios/baseline.js)、[plugin/scripts/smoke-profile/result.mjs](plugin/scripts/smoke-profile/result.mjs)；`plugin/tests/unit/scripts/remote-probe.spec.ts`、[plugin/tests/unit/scripts/smoke-profile.spec.ts](plugin/tests/unit/scripts/smoke-profile.spec.ts)、[plugin/tests/unit/scripts/smoke-profile-contract.spec.ts](plugin/tests/unit/scripts/smoke-profile-contract.spec.ts)；新 `plugin/scripts/smoke-profile/probe/remote-stream.js`；[plugin/package.json](plugin/package.json)、[plugin/pnpm-lock.yaml](plugin/pnpm-lock.yaml)。
    - 确认依据：2026-09-09 本任务中用户确认九接口一次迁移、替换五秒轮询及 review 修复；设计提交 `f7b6812`；本轮要求据此制定 TODO。
    - 处理动作：复用 baseline pause/resume 验证订阅、断开、重开与完整补读。
    - 验收点：baseline-remote-pause-resume、baseline-remote-stream-reconnect、restore=PASS 均出现，socket 全部关闭。

- [ ] `plugin/dependencies`：M14 拔除废弃依赖与入口残留
    - 依据文档：[Meeting Remote Migration RUNBOOK][remote-migration-runbook]，M14。
    - 关联文件：[plugin/tests/contract/meeting-runtime.spec.ts](plugin/tests/contract/meeting-runtime.spec.ts)、[plugin/src/client/meeting-panel.tsx](plugin/src/client/meeting-panel.tsx) 的废弃导入/适配代码；[plugin/package.json](plugin/package.json)、[plugin/pnpm-lock.yaml](plugin/pnpm-lock.yaml)；[plugin/eslint.config.js](plugin/eslint.config.js)、[plugin/tests/unit/module-boundaries.spec.ts](plugin/tests/unit/module-boundaries.spec.ts) 的旧 http 模块映射。
    - 确认依据：2026-09-09 本任务中用户确认九接口一次迁移、替换五秒轮询及 review 修复；设计提交 `f7b6812`；本轮要求据此制定 TODO。
    - 处理动作：按 D5 清理旧 fixture、导入和映射，并同步直接依赖及锁文件。
    - 验收点：三组残留检索零匹配；新增仅五个 DSH 包与测试 ws；lint/typecheck/build/package 全通过。

- [ ] `readiness/remote-migration`：M15 验证迁移并记录证据
    - 依据文档：[Meeting Remote Migration RUNBOOK][remote-migration-runbook]，M15。
    - 关联文件：M01—M14（含 M13a）清单中已经修改的文件仅格式化；[docs/40-readiness/MEETING-REMOTE-FEASIBILITY-EVIDENCE.md](docs/40-readiness/MEETING-REMOTE-FEASIBILITY-EVIDENCE.md)、[docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md](docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)。
    - 确认依据：2026-09-09 本任务中用户确认九接口一次迁移、替换五秒轮询及 review 修复；设计提交 `f7b6812`；本轮要求据此制定 TODO。
    - 处理动作：运行固定回归门禁，将实际结果与未覆盖边界写入 readiness。
    - 验收点：verify、baseline、scribe-minutes、文档检查全部通过；真实 marker 与 restore=PASS 可追溯。

- [ ] `docs/remote-migration`：M16 收口迁移文档与任务
    - 依据文档：[Meeting Remote Migration RUNBOOK][remote-migration-runbook]，M16。
    - 关联文件：删除 [docs/30-designs/RUNBOOK-MEETING-REMOTE-MIGRATION.md](docs/30-designs/RUNBOOK-MEETING-REMOTE-MIGRATION.md)；根 [TODO.md](TODO.md) 中本批迁移任务及其专用链接定义；[docs/30-designs/MEETING-REMOTE-DESIGN.md](docs/30-designs/MEETING-REMOTE-DESIGN.md)、[docs/20-interfaces/MEETING-REMOTE-INTERFACE.md](docs/20-interfaces/MEETING-REMOTE-INTERFACE.md)、[docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md](docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md)、[docs/00-governance/ARCHITECTURE.md](docs/00-governance/ARCHITECTURE.md)。
    - 确认依据：2026-09-09 本任务中用户确认九接口一次迁移、替换五秒轮询及 review 修复；设计提交 `f7b6812`；本轮要求据此制定 TODO。
    - 处理动作：同步已实现状态，按收口规则清除本批 TODO 引用并删除临时 RUNBOOK。
    - 验收点：前序任务全部完成；删除前后链接/diff 检查通过；正式证据和真实浏览器自动重连未覆盖边界保留。

[remote-migration-runbook]: docs/30-designs/RUNBOOK-MEETING-REMOTE-MIGRATION.md

## 待审阅任务项

## 待讨论项
