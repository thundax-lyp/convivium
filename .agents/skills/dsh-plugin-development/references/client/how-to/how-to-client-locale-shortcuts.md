# 为 Web 插件添加词典和快捷键

## 给 slot 组件提供可切换文案与命令

目标版本 `@deepseek-ai/dsh-agent@0.2.0-rc.2`；Web Profile 已装载 locale、shortcuts、renderer 以及本包。先读[Client 共享服务](../api/api-client-services.md)与[slot 契约](../api/api-client-slots.md)。

### 实现步骤

1. 在 `LocaleNamespaceMap` 合并本包 namespace 及 key 联合，提供同 key 集的 `zh`、`en` 字典。Client `apply` 用 `ctx.effect(() => ctx.locale.register(ns,{zh,en}), label)` 持有词典；slot 注册的 `locale: ns` 使组件得到 `t`。组件的文案、ARIA 名称、tooltip、placeholder 都从 `t(key)` 得到，内部 ID 保持原文。
2. 定义稳定 `ShortcutCommand.id`，`label()` 用 `ctx.locale.bind(ns)` 在调用时翻译，按实际输入所有权填写 `regions`、`modals`、默认绑定与别名；`resolve(context)` 只在目标可用时返回捕获动作的 handled，否则明确 blocked 或 pass。
3. 在 Client `apply` 注册命令并让 disposer 随 fiber 释放。若创建固定输入，不走可编辑目录的 `register`，用 `registerFixed` 和 `observeFixedInput`，尊重组合输入和已消费事件。不要在组件中直接安装全局键盘监听器。
4. 在 Web 页面切换语言，确认组件和命令目录的 label 同步变化；分别在 page、editable、modal 和无目标状态触发命令，确认只在拥有区域执行；卸载包后命令与词典消失。

### 验证与完成边界

运行 Client 类型与 locale/shortcut 行为测试，再在 Web Profile 检查真实键盘和菜单调用。命令 ID 冲突、缺少字典键和错误区域应在构建或注册时暴露；只显示一段翻译文字不足以证明快捷键遵守输入所有权。
