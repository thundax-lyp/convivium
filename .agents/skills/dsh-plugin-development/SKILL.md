---
name: dsh-plugin-development
description: 开发或修改 DeepSeek Harness Cordis 包与插件，包括模型工具、Provider、持久状态和 UI 集成。实现 DSH 扩展时使用；不要用于纯文档编辑或普通 DSH 使用。
---

# DSH 插件开发

使用本 skill 把功能放到正确的 DSH 扩展点，保持生命周期与持久上下文不变量，并验证组合后的行为。它是自包含的，唯一目标基线为 release candidate `dsh-v0.1.1-rc.2`；references 保存该版本的离线开发资料。

## 编辑前

先确认目标代码确实基于 `dsh-v0.1.1-rc.2`，再阅读目标仓库根目录和目标路径下的贡献说明，并检查所属包与最接近的现有实现。目标版本不匹配时，不套用代码骨架；先告知用户该 skill 的基线限制。

先根据用户要求的可观察结果选择主路径，再叠加持久化、配置、凭证、并发资源和交付物等横切路径。读取 `references/plugin-development-routing.md`，只加载命中行涉及的 reference，并用表中链接定位相关章节；选中的 reference 要完整读取。维护本 skill 或核对依据时，读取 `references/source-map.md` 和 testing reference 的“Skill 发布维护”章节。

## 实现规则

- 通过已记录的 plugin、service 或 event 扩展点实现；存在扩展点时，不修改 agent loop。
- 遵循仓库的插件导出约定。本 skill 记录的 DSH 约定是：Service 包默认导出 Service class；函数插件具名导出 `name`、`inject`、可选 `Config` 与 `apply`。
- 每项贡献都必须有生命周期所有者。事件监听直接调用 `ctx.on()`。当注册 API 明确会创建 Cordis effect 时直接调用；rc.2 的 tool、system-prompt section 和 LLM adapter 注册属于这种情况。其他只返回未托管 disposer 的 registry 必须由插件的 `ctx.effect()` 接管。
- 模型可见输入必须能从 Session log 重建。先确认所属路径是否已通过 request header、message 或 tool result 记录完整证据；只有插件引入新的持久事实时，才声明并追加由该插件拥有的 Session event。
- 当 Service Definition、Provider、Consumer 会独立演进时，将可替换能力拆成这三个角色。Consumer 依赖 Definition，不依赖具体 Provider。
- 部署差异放入经过验证的插件配置、profile 或 patch；不要藏在运行时默认值里。
- 模型工具只定义一个规范 JSON 结果，并仅从参数和该结果进行纯渲染。实现前先确定 render intent 与模型可见文本。

## 完成条件

实现完成后读取 testing reference 的“按变更面选择证据”和“验证命令矩阵”，再选择聚焦检查。产品可见插件需要真实 Loader/应用组合测试；非平凡的模型、协议或用户可见变更需要对应的组合快照。同步更新公共 API 文档与所属包 README。非平凡设计决策按目标仓库惯例记录。只报告实际观察到输出的命令。

不要直接编辑生成的 catalog；没有明确要求时，不把示例或实验代码提升为默认组件；没有授权时，不执行外部调用、凭证修改、push 或 release。
