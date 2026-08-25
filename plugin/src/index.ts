import type { Context } from '@deepseek-ai/cordis'
import { Config, type Config as ConfigType } from './config.js'

export { Config }
export type { Config as ConfigType } from './config.js'

export const name = 'convivium'

export const inject = [
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-subagent',
  '@deepseek-ai/dsh-system-prompt',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-workspace',
  '@deepseek-ai/dsh-host-webserver',
] as const

export function apply(_ctx: Context, _config: ConfigType): void {
  // Meeting runtime registration will be added with its implementation.
}
