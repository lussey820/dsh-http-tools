/**
 * Browser half of dsh-http-tools-ui: registers the http tool cards into the
 * keyed `tool.call.toolview` slot by wire tool name.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import { HttpRow } from './HttpRow.tsx'

/** Services this registrant reads (informational for the loader graph). */
export const inject = ['slots']

/** Register the http rows under both http tool names. */
export function apply(ctx: Context): void {
  ctx.slots.inject('tool.call.toolview', function* () {
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'http_request' }, HttpRow)
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'curl_parse' }, HttpRow)
  })
}
