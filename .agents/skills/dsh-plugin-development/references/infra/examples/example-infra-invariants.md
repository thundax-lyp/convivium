# 组合 Session 不变式 companion

以下是目标版本已发布的 registry 与 `dsh-session/invariant` 的完整组合 patch；将其放入自有 bundle 的 `cordis.patch.yml` 并通过该 bundle 装载。它演示装载，不声称检查任意第三方包。

## 文件

`cordis.patch.yml`：

```yaml
- name: '@deepseek-ai/dsh-invariants'
  config:
    enabled: true
    package_allowlist:
      - '^@deepseek-ai/dsh-session$'
- name: '@deepseek-ai/dsh-session/invariant'
```

## 验证

在目标版本的隔离 Profile 中确认 Session service 与上述两行都已装载，再创建一次会话并写入正常事件；观察没有 `INVARIANT`。在目标包的行为测试中注入状态关系违约，检查错误码与 `packageName`。卸载 companion 后确认该包名可重新注册；仅静态解析 YAML 不代表这条行为路径已验证。
