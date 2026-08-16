/** dsh-http-tools: HTTP/API debugging tools for DeepSeek Harness. */

import type { Context } from '@deepseek-ai/cordis'
import { resolveConfig, type PluginConfig } from './config.ts'
import { RequestHistory } from './core/history.ts'
import { applyCurlParseTool } from './curl-parse.ts'
import { applyHttpRequestTool } from './http-request.ts'
import { applyRequestHistoryTool } from './request-history.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-http-tools'

/** Services required by this plugin. */
export const inject = ['tools']

/**
 * Register the http_request, curl_parse, and request_history tools.
 * Config is optional; every field has a safe default (see resolveConfig).
 */
export function apply(ctx: Context, config?: PluginConfig): void {
  const resolved = resolveConfig(config)
  const history = new RequestHistory(resolved.historyLimit)
  applyHttpRequestTool(ctx, resolved, history)
  applyCurlParseTool(ctx, resolved, history)
  applyRequestHistoryTool(ctx, history)
}
