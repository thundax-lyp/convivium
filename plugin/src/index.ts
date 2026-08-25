import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

export const name = 'convivium'

export interface Config {}

export const Config: z<Config> = z.object({})

export function apply(_ctx: Context, _config: Config): void {
  // Meeting runtime registration will be added with its implementation.
}
