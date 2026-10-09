# Host 用户问答对象

适用 `@deepseek-ai/dsh-user-questions@0.2.0-rc.2`。`ctx.userQuestions` 将结构化问题交给当前作用域的 answerer waterfall；模型侧工具由 `dsh-tool-ask-user` 提供。见 [请求用户回答](../how-to/how-to-host-user-questions.md)。

## UserQuestionService

**公开导出**：`UserQuestionService` 来自 `@deepseek-ai/dsh-user-questions`。
`ask(request)` 等待回答；携带 Agent 时只接受 registry 中精确的 live root，子 Agent 不可直接开启人机交互。无 Agent 请求可供非作用域 local answerer 使用，无接受者则 `NO_PROVIDER`。`askTimed(request, callId, timeoutMs)` 在前台等待超时后返回 `{ pending: true, callId }`，不取消整个 Agent turn；续答通过新 user message 进入下一轮，不能为已结束的工具调用伪造结果。`attachWait` 让 UI 认领剩余等待时间，Client 断连后原始 deadline 仍生效。

## AskUserQuestionRequest

**公开导出**：`AskUserQuestionRequest` 来自 `@deepseek-ai/dsh-user-questions`。
请求含非空 `questions`、可选 Agent、signal 和服务端使用的等待信息。每题有稳定 id、问题文本、可选 detail/选项/多选；`plan-review` intent 仅改变呈现方式，其 approve 必须是本题选项标签，且题目必须带 detail。意图不会改变回答协议或自动授予权限。

## AskUserQuestionAnswer

回答按题目 id 包含每题 `selected` 标签数组及可选 `custom` 文本。单选时 custom 覆盖已选项，多选时可补充。续答一次只能入队一份，重复则 `REPLY_QUEUED`；UI 关闭面板不等于放弃问题。

以下成员是该对象的公开契约：

- `answers: AskUserQuestionAnswerItem[]`：按请求问题返回的答案列表；调用方应按问题 ID 匹配。

## TimedUserQuestionResult

**公开导出**：`TimedUserQuestionResult` 来自 `@deepseek-ai/dsh-user-questions`。
结果是即时 `AskUserQuestionAnswer` 或 `{ pending: true, callId }`。调用方必须分支；pending 是可以稍后回答的事实，不是拒绝，也不能当作当前工具已有答案。
