# LSP provider 插件

## 为文件扩展名注册 LSP provider

目标是让 `ctx.lsp.query` 针对指定扩展名找到插件提供的语义查询后端。Profile 先装载 `@deepseek-ai/dsh-lsp`；模型使用还需 `@deepseek-ai/dsh-tool-lsp`。公开入口和输入输出见 [LSP provider API](../api/api-infra-provider-lsp.md#lsp)。

### 实现步骤

1. 创建 Host 插件，声明 `inject = ['lsp']`。最小注册示例及包文件见 [example-infra-provider-lsp](../examples/example-infra-provider-lsp.md)。
2. 选择稳定 `LspProviderId`，登记非空的扩展名到 language id 映射；该扩展名不得与同 Profile 的其他 provider 冲突。实现 `query` 时按 `operation` 返回封闭结果联合，传递取消信号，并使用零基 UTF-16 坐标。
3. 把注册绑定到插件 fiber；卸载后 id 和扩展名同时释放。真实 language server 实现要拥有连接、工作区索引、取消与关闭；目标版本的 `@deepseek-ai/dsh-lsp-stdio` 提供现成 stdio 适配器，需另行配置同执行世界的 `ctx.fs`、`ctx.subprocess`。
4. 安装包并装载到 Profile，直接查询一个匹配文件与一个未知扩展名；需要模型可见能力时检查 LSP 工具调用。

### 验证与完成边界

声明编译与装载分别核查。重复扩展名要原子失败且抛 `LSP_CONFLICT`；未知扩展名抛 `LSP_UNAVAILABLE`；取消后 provider 不得继续占用资源；卸载后路由应消失。示例只给固定结果以验证注册路径，不证明真实语言语义；真实后端需运行语言服务器与文件查询测试。
