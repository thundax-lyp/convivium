# 向指定 Session 上传浏览器文件：任务指南

## 向指定 Session 上传浏览器文件

目标版本 `@deepseek-ai/dsh-agent@0.2.0-rc.2`；Web Profile 已加载 file-upload 服务与目标 Session。先读[Client 共享服务](../api/api-client-services.md)中的 `FileUploadService`。

### 步骤

1. 从当前任务的 Session 来源取得明确 `sessionId`，不要从全局“当前 Session”推测回执归属。给本次上传创建 `AbortController`，在组件关闭、Session 切换或插件卸载时中止。
2. 通过 `ctx.fileUpload.upload(sessionId, data, name, signal, onProgress)` 传 `Blob`、`Uint8Array` 或一次性字节 stream。`onProgress` 只说明已消费字节，`total` 可能缺省；UI 应分别展示进度未知与进度可计量状态。
3. 按 `RemoteResult.ok` 分支处理回执或失败。成功值是暂存回执及文件引用，后续是否加入消息/任务由业务流程决定；业务失败用稳定 code 呈现，取消不得提交旧回执。
4. 在目标 Profile 验证小文件、大文件、流中止、Session 切换、上传失败与卸载，确认没有悬挂上传或错误 Session 归属。

### 完成判据

同一 Session 中可以消费成功回执；失败、取消与断连可见且不会误当成功。静态类型检查不代表上传载体与 Host 接收链已验证。
