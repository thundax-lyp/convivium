# Web 证据内容格式

只在已获接纳的 Convivium Web Contribution 中使用。先完成实际读取、主张与来源核验，再在自身 cwd 写入固定 `web-evidence.txt`；此文件是私有准备材料，写入不等于提交。使用 Host 已授权的文件写入工具，或 bash 的带引号 heredoc，避免正文里的 `$()`、反引号或引号被 Shell 执行。不要手写或拼接 MeetingCommand JSON。

## 文本语法

UTF-8 文本，禁止包围全文的代码围栏。节标题和字段标记必须独占一行且从行首开始；顺序不限。`## ` 为节标题、`@` 为字段标记的保留前缀；正文需要引用相同前缀时缩进，避免与标记混淆。节/字段值可为多行纯文本，引号、反斜杠、URL 与换行由脚本序列化为 JSON，不由 AI 转义。

四个唯一正文节均必需且非空：`## summary`、`## observation`、`## interpretation`、`## method`。summary 独立表达观点、关键依据与限制；不得将全文复制为摘要。

以下分组每类至少一个；同类 ID 唯一：

| 节标题              | 必需字段（每个标记后换行填写内容）                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `## falsifier F1`   | `@value`、`@reason`                                                                                                                                                                   |
| `## uncertainty U1` | `@value`、`@reason`                                                                                                                                                                   |
| `## limitation L1`  | `@value`、`@reason`                                                                                                                                                                   |
| `## claim C1`       | `@statement`、`@materialIds`、`@qualification`                                                                                                                                        |
| `## material M1`    | `@kind`、`@originator`、`@originalSource`、`@sourcePublishedAt`、`@acquiredAt`、`@version`、`@locator`、`@location`、`@verificationConditions`、`@limitations`、`@sharedDependencies` |

ID 后续使用 F2/U2/L2/C2/M2 等正整数。material 仅可追加可选 `@reason`；其余字段闭集，缺项、重复和未知字段均拒绝。

`@materialIds` 每行一个本文件已存在的 material ID，不加列表符号，不允许空列表、重复或未知引用。`@sharedDependencies` 每行一个共同依赖名称，无共同依赖时仍保留该标记但不填内容。所有其它字段必须非空；不知道日期、版本等事实时作者明确写 `unknown` 并解释限制，程序不会代填。

kind 仅限 document / dataset / experiment / observation / tool_output / unknown / not_applicable。verificationConditions 属于每份 material，uncertainties 属于证据内容，不能放到命令或其它层级。不要输出 kind=submit_evidence、protocolVersion、meetingId、版本、caller、PASS 或其它协议字段。

局部示例（不是完整证据，不可直接提交）：

```text
## claim C1
@statement
写出有来源支持的主张。
@materialIds
M1
@qualification
限定该主张成立的条件。
## uncertainty U1
@value
尚未完成的核验。
@reason
说明它影响哪项结论。
```

## 校验与提交

先运行同包脚本（源码环境先 build）：

```sh
node /absolute/path/to/web/scripts/parse.mjs web-evidence.txt > web-evidence.validated.json
```

脚本只将完整内容转为 evidence JSON；错误退出码为 2 并输出诊断。不得手工修补 JSON，必须回到原内容修正，再完整校验；缺失证据不能靠修改字段伪装已取得。该脚本没有会议权限。

校验通过后调用 `convivium_submit_web_evidence`，参数只含当前 `meetingId`、本人已获接纳的 `contributionId` 和唯一 `requestId`。Host 会重新读取原文本并执行同一解析器，取得当前会议版本，组装和校验原 submit_evidence 命令后提交。不要向工具传 JSON 正文、文件路径、版本或自报校验状态，不调用原 convivium_submit_evidence。

只有 accepted 回执代表登记成功；结构错误可在原 Contribution 期限内修正内容后再次提交。VERSION_CONFLICT 需重读会议、确认仍可提交后再决定；异常或未知结果不能盲目重投，先核对是否已经登记。成功后本轮不可再改证据，审核意见须待下一轮回应。
