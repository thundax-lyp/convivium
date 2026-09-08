# DSH Skill Provider 与调用策略

本 reference 针对 `dsh-v0.1.2-rc.1` 内部的 `ctx.skills`，与本仓库 Codex Skill 的 agents/openai.yaml 策略不是同一个系统。不要混用两者的配置字段。

## 条件补读

- 改 Prompt/event 的记录方式读[Session](session-durable-context.md)

## Discovery 与作用域

Provider 注册同步完成；远程初始化与发现放进 awaited list。Provider 名称在每个 scope layer 唯一；有效列表合并 global 与 viewing scope chain，更近 layer 的同名 Skill 直接胜出，同层再按 rank、Provider 顺序、local 顺序决胜。传入 calling Agent 对应的 view scope，不能只按 cwd 缓存所有 Session 的目录。

SkillCatalogSnapshot 的 complete 区分权威空目录和临时失败。某个 list 失败或发现期间 revision 持续变化时，保留可读候选但 snapshot 不完整、不缓存；Consumer 保留 last-good view 并重试，不能把一次失败解释为卸载全部 Skill。

本地 rank 从高优先级到低优先级是 project-dsh、project-agents、custom、user-dsh、user-agents、bundled。Project root 为最近 .git ancestor，没有则用 cwd；可用 ctx.fs 时沿该执行环境检查。支持直接 directory/SKILL.md 与 flat name.md，不递归发现任意深度的嵌套 Skill。

## 调用资格与加载

DSH 的 invocation 包含独立 modelInvocable/userInvocable。列表保留四种组合；两者均 false 仍可由可信 get 调用方访问。本地 frontmatter 使用 disable-model-invocation 与 user-invocable，缺省归一为允许。模型 Consumer 在加载 body 前后都检查 modelInvocable，不能因列表出现就执行。

Summary 不带 body；candidate locator 是 Provider 私有 opaque 状态；get 重新读取 winning definition，不缓存完整正文。返回的 name 与候选不匹配必须拒绝并失效 discovery。resourceBase 只负责后续相对资源定位，不能为了展示 Skill 自动枚举全部目录或执行脚本。

## 模型目录与更新

初次完整非空目录在 accepted pre-step 写入 durable reminder，只含排序后的 name 和规范化 description。后续依据实际工具可见性和完整目录的 rendered digest 判断是否写 full replacement；删除全部 Skill 需要显式空 replacement，临时 incomplete snapshot 则保持旧目录。

如果 compaction 隐藏了所有可识别旧目录，下个 complete snapshot 重建当前目录。Body-only edit 影响后续 get/tool result，不重写旧历史，也不必新增目录消息。工具调用取消传入 discovery/load，cache hit 仍须检查取消。

Browser 使用 userInvocable 过滤；冷 Session 通过 recorded preset 的 standing scope 查询，不为了列出 Skill 激活 Agent。模型目录与 Browser 目录可以不同，这不构成数据不一致。

## 验证

覆盖 scope shadow、rank tie、partial failure、并发 revision、四种 invocation policy、加载前后 policy 变化、body 更新、empty replacement、compaction 后重建以及 watch/dispose。Provider 能发现文件不等于模型已加载正文。
