# 兼容性与版本记录

DSH 是 developer preview。兼容性判断必须区分“当前项目最低支持版本”“当前锁定开发版本”和“尚未验证版本”。

## 真相来源

- 官方产品页：[DeepSeek Harness developer preview](https://deepseek.com/harness/en/)
- 官方仓库 README：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
- 官方架构：[DeepSeek Harness Architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)

官方来源确认 DSH 当前处于 developer preview；具体 API 兼容范围仍以本项目锁定依赖的 package metadata、types 和源码为准。

## 记录格式

当 API、配置或验证行为存在差异时，记录：

```text
DSH package/version:
Source path or official URL:
Observed contract:
Verified command:
Supported range:
Unverified assumptions:
```

## 处理差异

- 优先适配项目声明的最低支持版本，而不是本机最新版本。
- 只有当差异能从当前依赖类型/源码确认时，才增加兼容分支。
- 兼容分支必须有明确的检测、测试和删除条件；不要用宽泛 `any` 或静默 fallback 隐藏错误。
- 社区插件中的旧键、旧事件名或旧安装命令必须标注版本，不得直接复制。
- 依赖升级改变 API 时，同步更新 references、验证脚本、package 约束和 readiness 证据。
