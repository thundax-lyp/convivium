# Skill 维护与基线升级

仅在维护本 Skill、升级基线或审计参考依据时读取。先按下文选择维护范围，再按专题查阅 [source-map](source-map.md)，核对精确 tag 的类型、实现、测试与文档。

单专题维护只查该专题及实际依赖；完整基线升级须遍历全部证据和 DOCS，不能用普通开发的按需阅读规则跳过升级审计。普通插件设计与开发不需要加载本目录。

## Skill 发布维护

本 skill 只针对 `dsh-v0.1.2-rc.1`。改变基线前，更新 [真相源映射](source-map.md)，在新 tag 检查每个映射文件，并用已发布 manifest、可执行 gate 与源码重新对齐所有示例。不得静默读取 moving branch。较新分支才有的 API 在 pinned tag 缺失时，应明确写“不可用”，不要复制。

发布 skill 必须离线：skill 目录内不得出现 HTTP(S) URL。每个 reference 对其路由主题自包含，每项事实只有一个归属；router 可以使用本地相对链接。仓库依据只记录在本地 `source-map.md`，正常插件开发不读取该映射。

每次维护在独立 worktree 精确检出目标 tag，不切换或借用 moving branch 的声明。先从旧 source-map 逐路径比对类型、实现、gate 与测试；再比较两版 DOCS，把新增/变化指导回查目标源码；合并去重后刷新 references、router、入口和 source-map。文档滞后或相互冲突时记录裁决依据，不复制未实现设计。临时差异、checker 修改和构建日志放在维护工作目录，不进入 Skill。

发布验证分为 DSH checkout 与 Skill 维护仓库两个上下文，不能混用工作目录。先从实际维护仓库的 package.json 确认 `verify:skill`、`verify:examples` 与 `test:validation` 存在并定位其实现；复制到项目中的 Skill 目录不包含这些工具，DSH checkout 也不提供它们。维护仓库不可定位或脚本缺失时，继续可执行的本地结构与固定 tag 源码核对，明确列出未执行的检查器回归测试和示例编译；不得宣称发布验证完整，也不要在消费项目中临时重建维护工具。

1. 在精确 DSH tag checkout 安装 pinned lockfile 依赖，运行 `pnpm run build:lib:host` 和 `pnpm run typecheck:contracts-ready`，准备 Host/Client 与 generated Remote 声明。
2. 在本 Skill **维护仓库根目录**运行 `pnpm verify:skill --dsh <DSH-checkout>`：验证所有本地 Markdown 文件/标题锚点、JSON 代码块、离线边界、格式空白以及 source-map 路径；HEAD 和 tag 都必须解析到 source-map 中的固定 commit。不带 `--dsh` 时只做结构验证，并明确输出源码路径验证未运行。
3. 在同一维护仓库运行 `pnpm verify:examples --dsh <DSH-checkout>`。命令拒绝错误基线或有 tracked 修改的 DSH checkout，使用唯一临时目录及 checker 副本调用上游 Host 检查，再按 Client compiler face 单独编译 Client 片段。上游文件不被改写，成功或失败均清理自身临时资源；编译失败以非零退出，不以“已运行 checker”冒充通过。
4. 当前 `ts ignore-check` 的 Client 片段由维护命令显式归类并检查；新增未归类 TypeScript fence 会失败，必须完善分类后再发布。Host/Client Context 不在同一个 program 混编，Remote 类型从实际所属 manifest 导出解析，不手工伪造声明。
5. 运行 Skill quick validator、仓库格式检查和 `git diff --check`，核对元数据、基线及任务差异；报告 Host/Client 实际检查数量，以及上游 ignored/type-equiv/derivative 等不属于本次编译的片段。

这些维护命令由 Skill 仓库的 scripts/package.json 提供，不是 DSH CLI 命令，也不是复制 Skill 目录到其他项目后自带的工具。检查器回归测试使用 `pnpm test:validation`，与真实 DSH runtime 测试分开。

Code-fence compilation 是发布必需证据。缺少依赖、构建声明或不兼容上游 checker 时，命令失败；记录失败位置与未验证部分，不禁用诊断或删示例来通过。CI 覆盖以实际维护仓库的 workflow 为准；只有执行了对应检查才能计入证据，不从 job 名称推断示例编译或源码路径核对已经完成。

## 完整性审计

版本升级不能只从旧 source-map 出发：另列两版 package/exports/bin、Service/Remote、默认 bundle/preset、配置/数据格式、仓库 gate 和 DOCS 的完整变化。每项标记“补充”“已有覆盖”或“不纳入及理由”，附代码 owner 与目标 reference；实验包、示例和翻译可按明确类别处置，不能直接从清单删除。文件/符号差异清单是索引，不是语义审计已完成的证明。

完整 DOCS 对照还要检查目标版本未发生 diff 的章节：旧 reference 可能一直没有覆盖该契约。逐项记录保留、补充、删除/替换或不纳入的依据。发现文档与目标代码/gate 冲突时保留代码裁决，不能以“同步 docs”为由重新引入旧 API、空 invariant 或旧格式限制。
