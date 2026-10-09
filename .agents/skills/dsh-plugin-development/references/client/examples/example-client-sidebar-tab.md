# Example：右侧栏 Notes 页面

本例展示目标 workspace 插件 Client 半侧的两阶段注册；包 manifest、Host 空入口、构建与 Web Profile 组合沿用[Web 包示例](example-client-slot-contribution.md)，把依赖改为 `@deepseek-ai/dsh-client-ui-sidebar-right`、`@deepseek-ai/dsh-client-ui-renderer` 与 `@deepseek-ai/dsh-client-ui-slots`。装载后须在浏览器中核查 Tab 的显示、切换和卸载。

## `src/client/index.tsx`

```tsx
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'

function NotesPane() {
  return <section aria-label="笔记">当前 Session 的笔记</section>
}

const id = 'example-notes-tab'
export const inject = ['sidebarRightTabs', 'slots']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id,
    kind: 'example-notes',
    title: () => '笔记',
  }), 'example-notes: tab type')
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: id,
  }, NotesPane))
}
```

实际业务入口在右侧栏服务可用时调用 `ctx.sidebarRight.openTab('example-notes')`。构建时将 owner 与 slot 的 TypeScript project references 加入包配置；在真实 Web Profile 中打开、关闭、切换 Session 和卸载插件核查生命周期。页面目前只显示静态文案；业务订阅需要另行绑定 Tab 生命周期。
