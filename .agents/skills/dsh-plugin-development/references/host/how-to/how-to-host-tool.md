# Host 模型工具任务

## 让 Agent 调用一个可取消的模型工具

目标是在 DSH `0.2.0-rc.2` 的 Host Profile 中挂载工具插件，模型能看到工具 schema，调用后收到从规范结果渲染的内容。先确认 Profile 已加载 `@deepseek-ai/dsh-tools`；插件需声明 `inject = ['tools']`。对象契约见 [defineTool、ToolRuntime 与 ToolRunContext](../api/api-host-tools.md)。

### 实现步骤

1. 建立 Host 插件入口，导出 `name`、`inject` 和 `apply(ctx)`。本地源码 checkout 的完整文件及 patch 见 [example-host-tool](../examples/example-host-tool.md)；独立安装包须另外核查目标版本的 bundle manifest、编译产物和 peer 依赖。
2. 用 `defineTool` 声明参数、规范输出 schema、`render` 和异步 `execute`。`execute` 仅返回 schema 对应的值；`render` 从这个值产生模型文本。不能把文本当成结构化结果保存。
3. 在 `apply` 中调用 `ctx.tools.register`。注册归当前 fiber；若插件额外建立外部连接或计时器，使用 `ctx.effect` 返回 disposer。执行中的 I/O 传入 `exec.signal` 或建立等价的协作取消。
4. 用 Loader patch 或已安装 bundle 使插件进入目标 Profile。仅导出模块不会装载。模型实际可见性还受 ToolRuntime 的作用域、限制与 `mode` 影响；`ptc` 模式通过 `run_code` SDK 调用。
5. 工具失败抛错或返回无效规范值时应得到失败结果。卸载插件后，工具注册应消失；不要让后台资源继续写入已经卸载的上下文。

### 验证与完成边界

在精确 checkout 运行相应 Host 声明编译和工具测试；使用 `pnpm dsh web --patch <绝对或当前工作目录下的 patch 路径>` 启动，输入触发该工具的提示词，观察工具调用与结果内容。再测试无效输入、取消和插件卸载后不可见。Web 中的专用卡片另需 Client slot 注册；本任务只保证模型工具及通用回退呈现。
