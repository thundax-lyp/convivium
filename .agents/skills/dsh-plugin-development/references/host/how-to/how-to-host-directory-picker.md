# Host 工作区目录选择任务

## 接入可替换的目录选择后端

目标是让工作区 GUI 知道应打开宿主 OS 选择器，还是在页面中浏览目录。Profile 需要 `dsh-host-directory-picker` 的一个具体 provider，浏览器还需要相应 Client 流程注册。对象契约见 [DirectoryPicker 与能力联合](../api/api-host-directory-picker.md)。

### 实现步骤

1. 先决定用户是否能接触 Host 屏幕。可接触时选原生 backend；远程页面或需要浏览/创建目录时选浏览 backend。若运行环境在启动时变化，使用目标版本提供的 auto 组合。只挂载一个实际 provider。现成 browse 组合见 [Web 浏览目录示例](../examples/example-host-directory-picker.md)。
2. 新 backend 继承 `DirectoryPicker`，在构造器注册服务，并让 `capability()` 返回生命周期内稳定的判别对象。原生 `pick` 要响应 signal、取消返回 `null`；浏览 `list` / `createDirectory` 返回 backend 确定的绝对路径与错误码。
3. 配套 Client 在工作区的 directory-flow slot 中注册匹配 `kind` 的交互。Host capability 只说明能做什么，本身不使页面出现按钮或完成 Remote 传输。
4. 卸载 backend 时停止异步选择操作并释放服务；切换 backend 后 Client 重新选择对应流程，不能继续使用旧 capability 闭包。

### 验证与完成边界

分别验证 `native` 的成功/取消、`browse` 的列举/创建/三类错误，以及未知 `kind` 时 UI 隐藏入口。真实 Web 页面需观察目录选择后工作区记录被正确创建；Host Service 单元测试不能证明页面流程完成。
