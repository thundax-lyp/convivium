# Example：语音 provider 注册烟测

此例固定返回文本，只用于验证 `register`、`resolve`、`transcribe` 和卸载路径，不能用于真实录音识别。契约见 [Speech API](../api/api-infra-provider-speech.md#speechprovider)。

## 文件清单

```text
example-speech-provider/
├── package.json
├── index.mjs
└── cordis.patch.yml
```

`package.json`：

```json
{
  "name": "example-speech-provider",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./index.mjs" },
  "files": ["index.mjs", "cordis.patch.yml"],
  "peerDependencies": { "@deepseek-ai/dsh-experimental-speech-to-text": "0.2.0-rc.2" },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`index.mjs`：

```js
export const name = 'example-speech-provider'
export const inject = ['speechToText']

export function apply(ctx) {
  ctx.effect(() => ctx.speechToText.register({
    info: {
      id: 'example-speech',
      name: 'Example routing provider',
      location: 'host-local',
      languages: ['auto'],
    },
    async transcribe(input, signal) {
      signal.throwIfAborted()
      if (input.audio.byteLength === 0) throw new Error('录音为空')
      return { text: 'Example transcript.', audioSeconds: 0, inferenceSeconds: 0 }
    },
  }))
}
```

`cordis.patch.yml`：

```yaml
- insert:
    - id: example-speech-provider
      name: example-speech-provider
      inject: [speechToText]
```

Profile 先装载语音注册表，配置 `defaultProvider` 为 `example-speech`、`language` 为 `auto`，并提供其 Volatile/Settings 所需装载条件；在包目录执行 `npm pack`，以 `dsh plugin --profile <profile> add <tarball>` 安装。`listProviders()` 应包含该 id；以非空测试字节 `resolve` 后 `transcribe` 应返回固定文本，空字节应拒绝。卸载时 provider 消失且在途调用结算。此例的零时长与固定文本特意表明它只是路由烟测。
