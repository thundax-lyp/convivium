# Host 目录选择对象

适用 `@deepseek-ai/dsh-host-directory-picker@0.2.0-rc.2`。该包是工作区 GUI 的 Host Service Definition，默认 Profile 是否装载具体 backend 必须单独核查。面向模型的工具不消费它；与浏览器页面联动还要组合对应 Client 流程。见 [接入目录选择后端](../how-to/how-to-host-directory-picker.md)。

## DirectoryPicker

抽象 `Service` 经 `super(ctx, 'directoryPicker')` 提供 `ctx.directoryPicker`，只定义 `capability()`。具体 backend 返回稳定的 `DirectoryPickerCapability`，让消费方按 `kind` 选择交互；同一作用域装载第二个 provider 会触发重复服务错误。原生和浏览 backend 是可替换实现，不能将二者同时当作默认已启用。

## DirectoryPickerCapability

`DirectoryPickerCapability` 是从能力映射派生的判别联合。`native` 分支给 `pick(signal)`，打开 OS 选择器并返回绝对路径或取消的 `null`；`browse` 分支给 `list(path?)` 和 `createDirectory(path, name)`，由应用内界面浏览单棵目录树。

## DirectoryPickerCapabilities

**公开导出**：`DirectoryPickerCapabilities` 来自 `@deepseek-ai/dsh-host-directory-picker`。
能力映射可声明合并扩展。新 backend 扩展映射时，条目 `kind` 字面量必须与映射 key 一致；UI 消费方须处理未知分支。

## DirectoryEntry

`DirectoryEntry` 带 backend 确认的绝对 `path` 和 `hidden`；Client 不应自行拼接路径或推断 hidden 标记。

## DirectoryListing

`DirectoryListing` 带当前目录 `path`、主目录 `home`、直接子目录 `entries`、从根到当前目录的 `crumbs`，以及是否截断 `truncated`。浏览能力每次只暴露一棵目录树，不提供多根目录选择；截断时不能把 `entries` 当作完整结果。

## DirectoryPickerError

浏览失败用 `DirectoryPickerError` 携带封闭的 `DirectoryPickerErrorCode`：`directory-unreadable`、`directory-exists`、`directory-create-failed`，并包含出错路径。消费方按 code 分支，不解析错误文本。取消的原生 `pick` 返回 `null`，不应被当作这三类错误。

以下成员是该对象的公开契约：

- `path: string`：发生错误的目录路径；诊断时可显示，避免误作成功选择结果。
