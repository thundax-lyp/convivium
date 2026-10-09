# Example：在 Web 中启用浏览目录后端

本例针对 DSH `0.2.0-rc.2` 的源码 checkout，用已发布的 Host browse backend 与匹配的 Client 流程替换默认 auto 选择器。这个组合来自目标版本 `apps/web/tests/pin-browse-picker.overlay.yml` 的实际测试配置。任务步骤见 [接入目录选择后端](../how-to/how-to-host-directory-picker.md)，对象契约见 [Host 目录选择对象](../api/api-host-directory-picker.md)。

## 文件清单

```text
scratch-directory-picker/
└── cordis.yml
```

`scratch-directory-picker/cordis.yml`：

```yaml
- id: directory-picker
  disabled: true
- insert:
    - id: directory-picker-browse
      name: '@deepseek-ai/dsh-host-directory-picker-browse'
    - id: ui-directory-picker-browse
      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'
```

默认 `directory-picker` 是 auto 组合，先禁用它，确保同一作用域只装载一个 `ctx.directoryPicker` provider。Host browse backend 提供 `list` / `createDirectory`，Client 包注册对应的页面流程；单独装载 Host 包不会提供完整的 Web 交互。

## 装载与验证

在目标 checkout 根目录运行：

```sh
pnpm dsh web --patch ./scratch-directory-picker/cordis.yml
```

打开 Web 工作区目录选择入口，确认显示应用内浏览器；从主目录列举子目录，进入一个子目录并核对 breadcrumb，创建新目录后重新列举。测试取消、不可读目录、同名目录与截断列表。移除 patch 并重启后应恢复 Profile 原选择器。本例验证组合方法；新 backend 的实现仍须满足 `DirectoryPickerCapability`、取消、路径与错误码契约。
