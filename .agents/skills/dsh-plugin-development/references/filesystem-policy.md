# 文件系统与观察策略

本 reference 针对 `dsh-v0.1.2-rc.1` 的 FileSystem Provider 和模型文件工具。图片与执行环境映射另见 [运行时资源](runtime-resources.md)。

## 条件补读

- 图片和进程路径映射读[运行时资源](runtime-resources.md)；修改 shell confinement 再读[权限与 Sandbox](human-interaction.md#plan权限预设与-sandbox)

## Provider、策略与 Consumer

`ctx.fs` 拥有 backend primitive；fs-local 等 Provider 拥有介质操作；fs-observation-policy 通过事件决定 freshness guard；tool-fs 负责工具执行和呈现。Observation policy 不提供 Service，Consumer 不能调用其内部方法。

没有 observation policy 时，省略 guard 的 write 是 create-or-overwrite，edit 是无条件 literal replacement。Read-before-write 是组合中的 policy 行为，不是所有 FileSystem 实现自动承诺。插件绕过工具直接调用 Provider 时，应明确是否需要同样的 guard。

## 目标与读取

resolve 返回 opaque FsTarget；targetKey 和 version token 不能被解析成路径或时间。显示使用 displayPath，跨执行环境使用 Provider 的 processPath/fileUrl/contains。resolve 跟随 symlink；需要 no-follow 信任检查时先使用 lstat(path)。

stat 只读 metadata，缺失返回 undefined。文本大文件使用 streamText 并在 Consumer 保留上限内读取；readBytes 的完整内容 maxBytes cap 超过时以 FS_TOO_LARGE 失败，不能静默返回半张图片或半份二进制。listDir 只列直接子项且不读内容，不能用它代替正文读取。

## 原子写入与 freshness

writeText 的可选 expected 有两种 guarded intent：createIfAbsent 在发布时也必须 no-replace；replaceIfVersion 只替换准确版本。先 stat 再普通覆盖不足以实现 createIfAbsent，竞争中新出现的文件必须保留。

editText 在同一 mutation critical section 内先验证版本，再 literal matching、处理换行并原子替换。不能由 Consumer 拼接 read+write 实现受保护 edit；否则版本或匹配检查与提交之间会有竞态。过期版本应先报 FS_STALE_VERSION，不能误报在新内容中没有匹配。

## Observation event 的语义

`fs/write-intent`、`fs/edit-intent` 是单个决定槽的 waterfall；默认 thunk 给出 undefined，即裸 Provider。Owner listener 完整决定，不调用 next；first-wins 是注册顺序规则，不能假设多项策略会自动合并。

`fs/observed` 用同步 emit 记录 present(version) 或 absent。Listener 必须同步、不抛异常；否则可能在磁盘写入已成功后让工具显示失败，或覆盖原始读取错误。这个事件不是事务提交参与者。

默认 policy 按 owner 和 targetKey 保存 unseen/absent/present。Unseen/absent write 请求 createIfAbsent；present write/edit 使用已观察版本。Unseen edit 拒绝，confirmed-absent edit 报 not-found。任何窗口读取都能观察当前版本；没有“只看部分所以禁止后续 edit”的独立状态。记录在 policy 内存中，reload 不等于保留之前全部观察。

## 错误、取消与验证

区分 policy 的 FS_SANDBOX_DENIED、kernel 的 FS_PERMISSION_DENIED、FS_NOT_OBSERVED、FS_NOT_FOUND 与 FS_STALE_VERSION。Read/write/edit 没有 timeoutMs：本地 fsync/rename 不能被 deadline 强制撤销；只在 syscall 边界尽力响应 cancellation。Process-backed glob/grep 的超时是另一个契约。

测试 absent→concurrent create、stale-before-match、原子失败不破坏内容、symlink/目录边界、windowed observation 和不抛异常的 recorder。别把“一个文件测试通过”当并发一致性已验证。
