# RUNBOOK：DSH Client Browser 加载与 Reassign 证据闭环

## 1. 状态与执行边界

- 状态：`Executable`
- 建立日期：2026-09-04
- 执行分支：`codex/dsh-client-browser-loading`
- 产品基线提交：`4e77bf4c4f0a1a8dd553c1282f05e45a24c86308`
- 工作目录：仓库根目录 `/Volumes/storage/workspace/convivium-two`
- 唯一交付链：真实 package → DSH rc.2 Host Loader → Web boot graph → Convivium client bundle → `conversation.view` → Reassign Browser 操作 → readiness

本文只授权机械执行下列步骤，不授权 commit、push、PR、merge、rebase 或修改 sibling repository。获得单独提交授权后，每个步骤及其直接验证可以形成一个 commit；不得合并两个步骤。

## 2. 执行者契约

1. 严格按 T0→T5 执行。当前步骤全部 PASS 前不得开始下一步。
2. 每步只修改“允许修改”列出的文件和 symbol；已有用户改动或额外文件变化均触发 STOP。
3. 不改变 Meeting domain、HTTP DTO、Client component 行为、DSH profile、slot 名称或权限模型。
4. 不以 jsdom、HTTP response 或历史截图代替 T4 的真实 Browser 交互。
5. 命令退出码为 `0` 且 PASS 中每个断言成立才算 PASS。任何断言缺失、命令失败或需扩大范围均 STOP。
6. STOP 时保留现场，报告最后完成步骤、触发条件、文件/symbol、最小复现命令、完整首个错误和继续所需决定；不得放宽断言或自行换入口。
7. Browser wrapper 只启动一个。无论 T4 PASS 或 STOP，都必须发送一次 SIGINT，等待 `CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok`，并以 stdout 中的精确 temp root 证明目录不存在。

## 3. 目标与当前断点

### 3.1 起点

- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md#fr-11可观察性与用户控制) FR-11.2、FR-11.3、FR-11.7 要求本地 Meeting 列表、Reassign 控制和刷新后一致性。
- [Agent Meeting Protocol Interface](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md) 已定义既有 loopback HTTP 和公开 status/control contract；本任务不修改它们。
- [Meeting Orchestration Design](./MEETING-ORCHESTRATION-DESIGN.md) §17.4 固定 Plugin Frontend 使用完整 projection，并由 `plugin/src/client/index.tsx::apply` 将 `ConviviumMeetingPanel` 注册到 `conversation.view`；FR-11 的 Meeting list、selected status、Reassign 控制和 refetch 均沿用该链路。
- `plugin/package.json` 已声明 `exports["./client"]` 与 `dsh.client.platform="web"`。
- `plugin/src/client/index.tsx::apply` 已把 `ConviviumMeetingPanel` 注册到 `conversation.view`，entry id 为 `convivium-meetings`，label 为 `Meetings`。
- `plugin/scripts/smoke-profile/probe/scenarios/reassign.js::runReassignScenario` 已建立 browser-ready Meeting，并把 Captain Session attach 到 smoke workspace。
- 当前 browser-ready result 不含 Captain Session ID；`plugin/scripts/smoke-profile/index.mjs` 也没有断言真实 Web boot graph 包含 `@convivium/dsh-plugin` 或其 client bundle route 可读取。
- 2026-09-04 的实际 Browser 观察只看到 Harness workspace/session shell 与“新会话”，没有定位到 `Meetings` view；该观察不满足五项 Reassign Browser PASS。

### 3.2 终点

1. browser-ready smoke 在启动 Browser 前证明当前 Web 页的 `window.__DSH_BOOT__` graph 含 Convivium row，且 row 指向的 client bundle route 返回当前 artifact。
2. browser-ready result 明确给出固定 Captain Session ID `convivium-smoke-captain`，Browser 操作者按唯一入口打开该 Session 后选择 `Meetings` view。
3. 真实 Browser 在当前 HEAD 完成五项 Reassign 断言；wrapper 和 temp root 完整清理。
4. 当前 readiness 只记录本次实际证据；若 T4 失败则 RUNBOOK 保留且 readiness 不改。

## 4. Scope 与 Non-goals

### 4.1 Scope

- 为 reassign browser-ready smoke 增加 Web boot graph 与 client bundle route 的 fail-closed preflight。
- 在 reassign browser-ready result 中增加 required `captainSessionId`。
- 把正式 Browser 导航固定为：stdout URL → smoke workspace → Captain Session `convivium-smoke-captain` → `Meetings` view → Meeting。
- 执行五项真实 Browser Reassign 断言和 cleanup，并更新 FR-11/G4 readiness。

### 4.2 Non-goals

- 不修改 `plugin/src/client/**`、`plugin/src/http/**`、`plugin/src/domain/**`、`plugin/src/runtime/**`、`plugin/src/repository/**` 或协议 Schema。
- 不新增 Client slot、sidebar entry、route、adapter、registry、feature flag、fallback、兼容层或自动 Browser driver。
- 不实现 risk/Decision Browser mutation、远程用户身份、Team 权限或 Client 重构。
- C 先集成 Developer Markdown；C 独占 `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md` 的 Developer Markdown 行。B 只修改同文件 FR-11 行和 `docs/40-readiness/DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md` 的 G4/Reassign 行，不覆盖 C 的内容。
- 不修改 C 线 Developer Markdown 的 requirements/interface/design、repository post-commit hook、serial worker、`current.md`、`archive.md`、fixture 或 readiness 结论。
- 不把 DSH rc.2 cache 路径写入生产代码或文档；cache 源码只用于作者核对。

## 5. Canonical 接口与调用链

### 5.1 DSH rc.2 Loader 契约

锁定版本来自 `plugin/package.json` 与 `plugin/pnpm-lock.yaml`：所有 DSH Client package 为 `0.1.1-rc.2`。已安装 rc.2 `@deepseek-ai/dsh-client-modules::ClientModuleRegistry` 的行为是：

1. 扫描当前 enabled Host Loader entries。
2. 解析 entry package 的 `dsh.client`；仅接受 `platform="web"`。
3. 从 `exports["./client"].default` 解析 bundle。
4. 在 `window.__DSH_BOOT__.entries[]` 生成 `{ id, url, rev, inject?, external?, immediately? }`。
5. 通过 `url=/plugins/<id>/client.js?rev=<rev>` 提供 bundle。

本任务只消费该现有契约，不依赖或修改 DSH 内部包。

### 5.2 browser-ready result 契约

`plugin/scripts/smoke-profile/probe/scenarios/reassign.js::runReassignScenario` 是 producer；`plugin/scripts/smoke-profile/result.mjs::validateScenarioResult` 和顶层 wrapper 是 consumer。结果必须精确为：

```ts
interface ReassignBrowserReadyResult {
  ok: true;
  scenario: "reassign";
  browserReady: true;
  assertions: ["browser-reassign-ready"];
  meetingId: string; // non-empty, create result
  captainSessionId: "convivium-smoke-captain";
  observed: {
    oldAttemptId: string; // non-empty
    currentSpeakerId: "participant-a";
    currentAttemptId: string; // equals oldAttemptId
    meetingVersion: number; // integer >= 0
  };
}
```

不新增 protocol version、request ID、event、receipt、outbox 或 persistence 字段：这是 test-only smoke result，不是产品 DTO。

### 5.3 Web preflight

唯一可 mock seam 是 repository-private 模块 `plugin/scripts/smoke-profile/browser-client-preflight.mjs::assertBrowserClientPreflight(origin, fetchImpl = globalThis.fetch): Promise<void>`。该模块不进入 `plugin/package.json` exports，不构成产品或公共 API。owner、调用链和测试固定为：

1. `browser-client-preflight.mjs` 独占 HTML/boot graph/bundle 的读取与校验。
2. `plugin/scripts/smoke-profile/index.mjs::main` 在取得 browser-ready `probeResult` 后，以 ``const origin = `http://127.0.0.1:${port}` `` 构造同源地址，并在打印 Browser URL 前唯一一次执行 `await assertBrowserClientPreflight(origin)`。
3. `plugin/tests/unit/scripts/browser-client-preflight.spec.ts` 直接 import 该 seam，并以注入的 `fetchImpl` 分别执行 root HTML fetch non-2xx 与 bundle fetch non-2xx 分支。

seam 按以下固定顺序执行：

1. `GET http://127.0.0.1:<port>/`，要求 HTTP 2xx，response text 同时包含 `window.__DSH_BOOT__` 和 `@convivium/dsh-plugin`。
2. 从 HTML 中只提取 `window.__DSH_BOOT__` 赋值的 JSON object；若无法以现有 HTML literal 唯一解析则 STOP，不新增 HTML parser dependency。
3. 在 `entries` 中查找唯一 `id === "@convivium/dsh-plugin"` 的 row；0 或多于 1 均失败。
4. row 的 `url` 必须匹配 `/plugins/@convivium/dsh-plugin/client.js?rev=<12 lowercase hex>`。
5. 对同 origin 的 row URL 发起 GET，要求 HTTP 2xx；body 必须包含 `window.__ModuleLoader__.load`、`id: "@convivium/dsh-plugin"`、`convivium-meetings` 和 `conversation.view`。
6. 任一失败抛出以 `browser client preflight:` 开头的 Error；root non-2xx 固定为 `browser client preflight: root returned HTTP <status>.`，bundle non-2xx 固定为 `browser client preflight: bundle returned HTTP <status>.`；不得仍打印 Browser URL 或 `browserReady=true` 顶层成功结果。

数组顺序、Meeting version 和 idempotency 均 Not Applicable：preflight 是只读 HTTP 检查，不写 domain/repository/event/receipt/outbox/checkpoint/archive。

## 6. 不变量

1. `conversation.view`、`convivium-meetings`、`Meetings` 和 `ConviviumMeetingPanel` 不改。
2. Reassign command 的 caller、version、request ID、receipt、event、projection 和 terminal behavior 不改。
3. preflight 只读当前 wrapper 已启动的同 origin Host，不访问外部网络，不缓存 graph，不增加重试或新 lifecycle owner。
4. `captainSessionId` 只能来自 `captain.agent.session.id`，并断言精确等于 `convivium-smoke-captain`；不得从 DOM 文案推断。
5. Browser 操作只使用当前 wrapper stdout 的 URL、meetingId、Captain Session ID 和 temp root。
6. readiness 不得把 unit、package、HTTP 或旧 commit 证据描述为本次 Browser PASS。

## 7. 机械执行步骤

### T3：固定 Browser 导航操作

前置状态：前一完成 commit（T2 实现及其 focused validation PASS）已包含 `captainSessionId` producer、validator exact-key contract 和全部 T2 测试；[DSH Smoke 操作说明](../50-operations/HOW-TO-DSH-SMOKE.md#reassign-browser-ready-模式) 仍只有 URL 后五项业务断言，没有 Captain Session 导航。

允许修改：`docs/50-operations/HOW-TO-DSH-SMOKE.md` 的 Reassign browser-ready 小节。

禁止修改：requirements、interfaces、designs、readiness、产品代码、其他 operations 小节。

执行：

1. ready 判据增加 `probe.captainSessionId === "convivium-smoke-captain"`。
2. 五项断言前增加唯一导航：打开 stdout URL；在 smoke workspace 的 session tree 选择 session ID `convivium-smoke-captain`；等待 conversation view；选择 label 精确为 `Meetings` 的 view。
3. 写明 Harness 首页只显示“新会话”且未打开该 Session 不构成 Client 加载失败；若 session 不存在、`Meetings` view 不存在、Browser console 有 Convivium bundle evaluate/activate error，则 STOP 并记录对应证据。
4. 保留原五项断言和 cleanup 原文语义，不增加 API key 配置或人工猜测步骤。

验证：

```bash
pnpm --dir plugin exec prettier --check ../docs/50-operations/HOW-TO-DSH-SMOKE.md
ruby -e 'files=Dir["docs/**/*.md"]; bad=[]; files.each{|p| File.read(p).scan(/\[[^\]]+\]\(([^)]+)\)/).flatten.each{|x| next if x =~ /^(https?:|#)/; f=x.split("#",2)[0]; bad << "#{p}: #{x}" unless File.exist?(File.expand_path(f,File.dirname(p)))}}; abort("missing links:\n#{bad.join("\n")}") unless bad.empty?'
git diff --check
```

PASS：命令全为 `0`；小节同时包含固定 Session ID、`Meetings` label、三个 STOP 分类、原五项断言和 cleanup。

STOP：正式 DSH UI 无法通过 session tree 选择 fixed Session，或 `conversation.view` owner 的实际 label/导航与 rc.2 不一致；报告 Browser DOM 和 rc.2 slot owner 证据，不改 Client slot。

### T4：取得当前 HEAD 的真实 Browser 证据

前置状态：T1–T3 PASS；C 的 Developer Markdown 实现及 `CURRENT-IMPLEMENTATION-COVERAGE.md` Developer Markdown 行已先集成到 `origin/main`，协调者已把该 `origin/main` 同步到当前分支；`dev.env` 存在且仅含 non-empty `DEEPSEEK_API_KEY`；无旧 smoke Host 进程占用本次端口。执行者先运行以下固定 gate，不满足即 STOP，不自行 merge/rebase：

```bash
git fetch origin
test "$(git status --short | wc -l | tr -d ' ')" = "0"
git merge-base --is-ancestor origin/main HEAD
test "$(rg -c '^\| .*Developer Markdown' docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)" = "1"
test "$(rg -c '^\| FR-11 ' docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)" = "1"
```

同步后必须由 RUNBOOK 作者重新读取共享 readiness 当前内容，并按 Audit 模式确认 T4 的文件、行 owner、命令、PASS/STOP 仍精确；Audit 结论不是 `Executable` 时 STOP。该复核只允许校准本 T4，不得把 C 的 Developer Markdown 行纳入 B scope。

允许修改：

- `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`：仅 FR-11 行及其明确指向 Reassign Browser 的验证摘要/Not Covered 项；Developer Markdown 行由 C 独占。
- `docs/40-readiness/DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md`：当前 target G4/Reassign Browser evidence。

禁止修改：全部代码、测试、operations、C 的 Developer Markdown readiness 内容。

执行：

1. 在仓库根目录打开一个持续存在的交互式 shell；执行以下固定 launcher。日志只写入 mode `700` 的临时 control root，日志文件 mode 为 `600`，密钥不得写入命令参数或日志：

   ```bash
   pnpm --dir plugin build
   CONTROL_ROOT="$(mktemp -d "${TMPDIR%/}/convivium-browser-control.XXXXXX")"
   chmod 700 "$CONTROL_ROOT"
   WRAPPER_LOG="$CONTROL_ROOT/wrapper.log"
   WRAPPER_PID_FILE="$CONTROL_ROOT/wrapper.pid"
   CONTROL_ARTIFACT="$CONTROL_ROOT/smoke-control.json"
   C_ROW_BEFORE="$(rg '^\| .*Developer Markdown' docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)"
   test -n "$C_ROW_BEFORE"
   : >"$WRAPPER_LOG"
   chmod 600 "$WRAPPER_LOG"
   env CONVIVIUM_SMOKE_SCENARIO=reassign CONVIVIUM_SMOKE_BROWSER_MODE=1 pnpm --dir plugin smoke:profile >"$WRAPPER_LOG" 2>&1 &
   WRAPPER_PID=$!
   printf '%s\n' "$WRAPPER_PID" >"$WRAPPER_PID_FILE"
   READY=0
   for attempt in $(seq 1 180); do
     if rg -q '^CONVIVIUM_SMOKE_BROWSER_URL=http://127\.0\.0\.1:[0-9]+$' "$WRAPPER_LOG"; then READY=1; break; fi
     kill -0 "$WRAPPER_PID" 2>/dev/null || break
     sleep 1
   done
   test "$READY" = "1"
   node - "$WRAPPER_LOG" "$CONTROL_ARTIFACT" <<'NODE'
   const fs = require("node:fs");
   const path = require("node:path");
   const [logPath, artifactPath] = process.argv.slice(2);
   const text = fs.readFileSync(logPath, "utf8");
   const starts = [];
   if (text.startsWith("{")) starts.push(0);
   for (let offset = text.indexOf("\n{"); offset !== -1; offset = text.indexOf("\n{", offset + 2)) {
     starts.push(offset + 1);
   }
   const matches = [];
   for (const start of starts) {
     let depth = 0;
     let inString = false;
     let escaped = false;
     for (let index = start; index < text.length; index += 1) {
       const character = text[index];
       if (inString) {
         if (escaped) escaped = false;
         else if (character === "\\") escaped = true;
         else if (character === '"') inString = false;
         continue;
       }
       if (character === '"') inString = true;
       else if (character === "{") depth += 1;
       else if (character === "}") {
         depth -= 1;
         if (depth === 0) {
           try {
             const value = JSON.parse(text.slice(start, index + 1));
             if (
               value?.ok === true &&
               value?.profile === "web" &&
               Number.isInteger(value?.port) &&
               value?.probe?.scenario === "reassign" &&
               value?.probe?.browserReady === true
             ) matches.push(value);
           } catch {}
           break;
         }
         if (depth < 0) break;
       }
     }
   }
   if (matches.length !== 1) throw new Error(`expected one smoke result, received ${matches.length}`);
   const smoke = matches[0];
   const browserMarkers = [...text.matchAll(/^CONVIVIUM_SMOKE_BROWSER_URL=(.+)$/gm)].map((match) => match[1]);
   const tempMarkers = [...text.matchAll(/^CONVIVIUM_SMOKE_TEMP_ROOT=(.+)$/gm)].map((match) => match[1]);
   const browserUrl = `http://127.0.0.1:${smoke.port}`;
   if (browserMarkers.length !== 1 || browserMarkers[0] !== browserUrl) throw new Error("browser URL marker mismatch");
   if (tempMarkers.length !== 1 || !path.isAbsolute(tempMarkers[0])) throw new Error("temp root marker mismatch");
   const control = {
     browserUrl,
     tempRoot: tempMarkers[0],
     meetingId: smoke.probe.meetingId,
     captainSessionId: smoke.probe.captainSessionId,
     currentAttemptId: smoke.probe.observed?.currentAttemptId
   };
   if (
     typeof control.meetingId !== "string" || control.meetingId.length === 0 ||
     control.captainSessionId !== "convivium-smoke-captain" ||
     typeof control.currentAttemptId !== "string" || control.currentAttemptId.length === 0
   ) throw new Error("smoke result fields are invalid");
   fs.writeFileSync(artifactPath, `${JSON.stringify(control)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
   NODE
   test "$(stat -f '%Lp' "$CONTROL_ARTIFACT")" = "600"
   BROWSER_URL="$(node -e 'const x=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(x.browserUrl)' "$CONTROL_ARTIFACT")"
   TEMP_ROOT="$(node -e 'const x=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(x.tempRoot)' "$CONTROL_ARTIFACT")"
   MEETING_ID="$(node -e 'const x=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(x.meetingId)' "$CONTROL_ARTIFACT")"
   CAPTAIN_SESSION_ID="$(node -e 'const x=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(x.captainSessionId)' "$CONTROL_ARTIFACT")"
   CURRENT_ATTEMPT_ID="$(node -e 'const x=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(x.currentAttemptId)' "$CONTROL_ARTIFACT")"
   test -n "$BROWSER_URL"
   test -n "$TEMP_ROOT"
   test -n "$MEETING_ID"
   test "$CAPTAIN_SESSION_ID" = "convivium-smoke-captain"
   test -n "$CURRENT_ATTEMPT_ID"
   printf 'BROWSER_URL=%s\nTEMP_ROOT=%s\nMEETING_ID=%s\nCAPTAIN_SESSION_ID=%s\nCURRENT_ATTEMPT_ID=%s\nWRAPPER_PID=%s\n' "$BROWSER_URL" "$TEMP_ROOT" "$MEETING_ID" "$CAPTAIN_SESSION_ID" "$CURRENT_ATTEMPT_ID" "$WRAPPER_PID"
   ```

2. 使用真实 Browser 打开上一步从 `CONTROL_ARTIFACT` 读取并打印的精确 `BROWSER_URL`；在 smoke workspace 的 session tree 选择同一 artifact 的 `CAPTAIN_SESSION_ID`；等待 conversation view；选择 label 精确为 `Meetings` 的 view；选择同一 artifact 的 `MEETING_ID`。不得人工复制 wrapper log 字段、启动第二个 wrapper、重新请求 Host，或使用 HTTP/jsdom 代替 Browser。
3. 在同一 Browser 页依次执行且记录以下五项：页面显示 `Runtime smoke (running)`；selected summary 为 running/current Speaker `participant-a` 且显示 `Skip current speaker` 和 `Skip reason`；空 reason 时按钮 disabled、输入精确文本 `Browser reassign evidence` 后 enabled；点击一次后等待 refetch，旧 attempt 的 control 消失且页面无 `role=alert`；刷新同一 URL 后重新进入同一 Session/`Meetings`/Meeting，旧 attempt control 仍不存在。
4. 完成 Browser 观察后回到第 1 步的同一 shell，执行唯一 shutdown/cleanup 序列：

   ```bash
   kill -INT "$WRAPPER_PID"
   wait "$WRAPPER_PID"
   WRAPPER_EXIT=$?
   test "$WRAPPER_EXIT" = "0"
   test "$(rg -c '^CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok$' "$WRAPPER_LOG")" = "1"
   test ! -e "$TEMP_ROOT"
   ```

5. 只有第 1–4 步全部 PASS，才读取 `HEAD=$(git rev-parse HEAD)`，把两份 readiness 的 target 写为该 literal SHA；`CURRENT-IMPLEMENTATION-COVERAGE.md` 只改 FR-11 行及 Reassign Browser 明确项，`DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md` 只改 G4/Reassign 行。记录五项 Browser、preflight、wrapper exit 和 cleanup；不得覆盖 C 的 Developer Markdown 行或其他历史证据。
6. 保存 C-owned 行并执行精确 owner/cleanup 检查，然后删除 control files：

   ```bash
   test "$(rg -c '^\| .*Developer Markdown' docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)" = "1"
   test "$(rg '^\| .*Developer Markdown' docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)" = "$C_ROW_BEFORE"
   test ! -e "$TEMP_ROOT"
   rm "$WRAPPER_LOG" "$WRAPPER_PID_FILE" "$CONTROL_ARTIFACT"
   rmdir "$CONTROL_ROOT"
   test ! -e "$CONTROL_ROOT"
   ```

验证：

```bash
pnpm --dir plugin exec prettier --check ../docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md ../docs/40-readiness/DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md
git diff --check
```

PASS：C-first gate、重新 Audit、build、launcher/extraction、Browser 五项、shutdown 和验证命令全部退出 `0`；完整多行 smoke JSON 的 shape match 精确为一个，URL marker 与该对象的 `port` 一致，temp-root marker 精确为一个；URL、temp root、meeting ID、Captain Session ID 和 attempt ID 只从 mode `600` 的同一 `CONTROL_ARTIFACT` 读取；SIGINT 后 wrapper 退出 `0` 且 cleanup marker 精确出现一次；精确 temp root、control artifact 和 control root 均不存在；readiness 只陈述本次实际结果，Developer Markdown 行未被 B 修改。

STOP：C-first gate、同步后 Audit、完整 JSON 配平/解析、唯一 shape、marker 相等性、control artifact mode/字段、preflight、Session 导航、`Meetings` view、五项业务断言、wrapper exit、C-owned 行相等性或 cleanup 任一失败。无论解析或 Browser 在何处失败，都使用已记录的 `WRAPPER_PID` 执行第 4 步 shutdown；仅在精确 temp root 已从成功解析的 artifact 取得时执行其不存在断言。readiness 不得修改；保留 mode `700` control root，报告失败 gate、受限日志路径和首个错误；若已取得 URL，则另报告 URL（不含 secret）、DOM/console/network 的首个不匹配、temp root 和 cleanup 结果。不得人工截取 JSON、依赖单行 JSON、启动第二个 wrapper、重新请求 Host、引入通用日志 parser 或用 HTTP/jsdom 替代。

### T5：完整验证与删除 RUNBOOK

前置状态：T4 PASS；所有 Scope 已落位；readiness 已记录执行时 literal HEAD；无 STOP/Not Covered 留在本 RUNBOOK 中。

允许修改：删除 `docs/30-designs/RUNBOOK-DSH-CLIENT-BROWSER-LOADING.md`。

禁止修改：其他文件。

执行：

1. 运行完整验证和长期文档检查。
2. 确认没有文档引用本 RUNBOOK。
3. 删除本 RUNBOOK。
4. 重跑相对链接检查和 diff check。

验证：

```bash
pnpm --dir plugin verify
pnpm --dir plugin verify:agent-definitions
pnpm --dir plugin verify:package
test "$(rg -l 'RUNBOOK-DSH-CLIENT-BROWSER-LOADING' --glob '!docs/30-designs/RUNBOOK-DSH-CLIENT-BROWSER-LOADING.md' . | wc -l | tr -d ' ')" = "0"
ruby -e 'files=Dir["docs/**/*.md"]; bad=[]; files.each{|p| File.read(p).scan(/\[[^\]]+\]\(([^)]+)\)/).flatten.each{|x| next if x =~ /^(https?:|#)/; f=x.split("#",2)[0]; bad << "#{p}: #{x}" unless File.exist?(File.expand_path(f,File.dirname(p)))}}; abort("missing links:\n#{bad.join("\n")}") unless bad.empty?'
git diff --check
```

删除后再次运行最后两条命令。

PASS：全部命令退出 `0`；RUNBOOK 不存在；无残留引用；工作树只含 T5 的 RUNBOOK 删除（若获得独立提交授权，则提交后工作树 clean）。

STOP：任一完整验证失败、存在残留引用、readiness 与当前 HEAD 不一致或 T4 证据缺失；保留 RUNBOOK，不删除测试或改写失败为 Not Covered。

## 8. 验证矩阵

| 边界                                   | 证据                                              | PASS                                            |
| -------------------------------------- | ------------------------------------------------- | ----------------------------------------------- |
| manifest/export                        | T0 Node assertion                                 | rc.2、web、`./client` 精确匹配                  |
| Host Loader discovery                  | T1 unit + T4 preflight                            | boot graph 唯一 Convivium row                   |
| built bundle route                     | T4 real Host GET                                  | 2xx，module/slot markers 完整                   |
| Session identity                       | T2 unit + T4 stdout                               | fixed Captain Session ID，exact-key fail closed |
| Client mount                           | T4 Browser                                        | fixed Session 中存在 `Meetings` view            |
| Reassign authority/version/idempotency | 既有 runtime/contract suites，由 T5 `verify` 回归 | 无协议变化且全部通过                            |
| refresh/projection                     | T4 Browser                                        | 点击后和刷新后旧 attempt control 均消失         |
| lifecycle cleanup                      | T4 wrapper                                        | cleanup marker + exact temp root absent         |
| event/receipt/outbox/archive/recovery  | Not Applicable                                    | 本任务不修改这些边界；T5 只做全量回归           |
| Developer Markdown                     | T4 C-first gate                                   | C 独占并先集成；B 同步后不修改该行              |

## 9. 失败恢复

- T1/T2/T3 的失败只有 tracked 工作树改动，无外部持久状态；保留 diff，不 reset 或清理用户改动。
- T4 的 wrapper 是唯一外部生命周期 owner。失败后仍按 T4 第 4 步发送 SIGINT、等待进程并检查 exact temp root；cleanup 失败时不得手工 glob 删除，报告 exact PID、URL、temp root 和受限日志路径。
- `dev.env` 不进入 Git，密钥不得出现在命令参数、stdout、stderr、readiness 或 commit。
- Browser console/network 证据只记录 package id、route、HTTP status 和错误文本；不得记录 credential/header。

## 10. 双向追踪与完成定义

| 正式行为                 | Interface/data contract                           | Design/实现 symbol                           | Focused                             | Full                   | Readiness         |
| ------------------------ | ------------------------------------------------- | -------------------------------------------- | ----------------------------------- | ---------------------- | ----------------- |
| FR-11.2 Meeting list     | existing local HTTP result                        | `ConviviumMeetingPanel`; `conversation.view` | client suite + T1/T2 smoke contract | T5 verify              | T4 两份 readiness |
| FR-11.3 Reassign control | existing reassign command                         | `runReassignScenario`; panel control         | smoke-profile spec                  | T4 Browser + T5 verify | T4 G4             |
| FR-11.7 reopen/refresh   | existing status projection                        | panel refetch                                | existing client suite               | T4 refresh             | T4 G4             |
| DSH Client loading       | `package.json.dsh.client` + `exports["./client"]` | rc.2 `ClientModuleRegistry`; T1 preflight    | smoke-profile spec                  | T4 real Host           | T4 G4             |
| exact Session navigation | `ReassignBrowserReadyResult.captainSessionId`     | producer + validator                         | smoke-profile spec                  | T4 Browser             | T4 G4             |

完成必须同时满足：T0–T5 PASS；五项 Browser 证据属于当前执行 HEAD；cleanup 完整；readiness 已迁移；完整 verify 通过；RUNBOOK 已删除且无引用。任何一项缺失时结论不是完成。

## 11. Author/Audit 结论

- Author：已按 DSH rc.2 `ClientModuleRegistry`、当前 package manifest、Client slot、smoke producer/result 和正式 FR-11 固定实现链。
- Audit：`Executable`。
- 决策完备性：每个步骤只有一个允许动作；真实 Loader/Browser 不匹配均有精确 STOP，不要求执行者设计替代 slot 或加载机制。
- 最小化：仅两个 smoke 接缝、一个 operations 小节和两份 readiness；不新增产品状态、抽象、依赖、adapter、registry、兼容层或自动化框架。
- 跨线边界：C 先集成并独占 Developer Markdown 实现及共享 readiness 的 Developer Markdown 行；B 同步该 baseline 后才执行 T4，且只拥有 FR-11/G4 行。双方无共享实现 symbol，只有明确的 C→B readiness 顺序依赖。
- 当前 Not Covered：RUNBOOK 编写阶段未运行 T4 真实 Browser；该事实只能在执行阶段取得。
