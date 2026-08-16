/** The `curl_parse` tool: parse a curl command into a structured request, optionally executing it. */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import type { ResolvedConfig } from './config.ts'
import { parseCurl } from './core/curl.ts'
import { runHttpRequest } from './core/fetch.ts'
import { formatBytes } from './core/format.ts'
import type { RequestHistory } from './core/history.ts'
import type { HttpRequestSpec } from './core/types.ts'
import type { HttpResponseValue } from './core/types.ts'

/** Model-facing content for a parsed (and possibly executed) curl command. */
export function renderCurlParse(args: CurlParseArgs, value: CurlParseValue): string {
  if (!value.ok) return `⚠️ Failed to parse curl command: ${value.error}`
  const lines: string[] = [
    `Parsed: ${value.method} ${value.url}`,
  ]
  if (value.headers && Object.keys(value.headers).length > 0) {
    lines.push(`Headers: ${Object.entries(value.headers).map(([k, v]) => `${k}: ${v}`).join(', ')}`)
  }
  if (value.body) lines.push(`Body (${value.body.type}): ${value.body.content}`)
  if (value.auth) lines.push(`Auth: ${value.auth.type} <redacted>`)
  if (!args.execute) {
    lines.push('Re-run with `execute: true` to send this request.')
  } else if (value.response) {
    const res = value.response
    lines.push('')
    lines.push(`✅ Sent → ${res.status} ${res.statusText} · ${res.durationMs}ms · ${formatBytes(res.sizeBytes)}${res.truncated ? ' (truncated)' : ''}`)
    const body = res.body.trim()
    if (body.length > 0) {
      const fence = res.bodyKind === 'json' ? 'json' : res.bodyKind === 'html' ? 'html' : 'text'
      lines.push('Body:')
      lines.push('```' + fence)
      lines.push(body.slice(0, 6000))
      lines.push('```')
    }
  }
  return lines.join('\n')
}

interface CurlParseArgs {
  curl: string
  execute?: boolean
}

interface CurlParseValue {
  ok: boolean
  error?: string
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: { type: 'json' | 'text' | 'form'; content: string }
  auth?: { type: 'bearer' | 'basic'; token: string }
  redirect?: 'follow' | 'manual'
  executed?: boolean
  response?: HttpResponseValue
}

/**
 * 从解析结果构建工具返回值。只写入有值的字段：
 * 框架要求工具返回 lossless JSON，undefined 属性会导致
 * "value is not lossless JSON" 校验失败。
 */
export function buildCurlParseValue(parsed: HttpRequestSpec): CurlParseValue {
  const value: CurlParseValue = { ok: true }
  if (parsed.method) value.method = parsed.method
  if (parsed.url) value.url = parsed.url
  if (parsed.headers && Object.keys(parsed.headers).length > 0) value.headers = parsed.headers
  if (parsed.body) value.body = parsed.body
  if (parsed.auth) value.auth = parsed.auth
  if (parsed.redirect) value.redirect = parsed.redirect
  return value
}

/** Register the `curl_parse` tool on a context. */
export function applyCurlParseTool(
  ctx: Context,
  config: ResolvedConfig,
  history: RequestHistory,
): void {
  ctx.tools.register(defineTool({
    name: 'curl_parse',
    description: 'Parse a curl command into its structured parts (method, URL, headers, body, auth) so you can inspect or tweak a request copied from documentation, logs, or other tools. With `execute: true`, sends the parsed request and returns the response exactly like http_request.',
    parameters: {
      curl: {
        type: 'string',
        required: true,
        description: 'The curl command to parse, e.g. curl -X POST https://api.example.com/v1 -H "Content-Type: application/json" -d \'{"a":1}\'.',
      },
      execute: {
        type: 'boolean',
        description: 'Whether to send the parsed request immediately. Defaults to false.',
      },
    },
    output: {
      schema: { type: 'json' },
      render: (args, value) => [{
        type: 'text',
        text: renderCurlParse(args, value as unknown as CurlParseValue),
      }],
      presentationMeta: (args, value) => value,
    },
    presentCall: (args) => ({
      card: 'generic',
      title: args.execute ? `curl_parse + execute` : 'curl_parse',
      rawInput: args.curl,
    }),
    presentResult: (args, result) => {
      const value = result.meta as unknown as CurlParseValue
      const title = !value.ok
        ? 'curl_parse failed'
        : value.executed && value.response
          ? `${value.response.status} ${value.method} ${value.url}`
          : `${value.method} ${value.url}`
      return {
        card: 'generic',
        title,
        content: [{ type: 'text', text: renderCurlParse(args, value) }],
      }
    },
    async execute(args, exec) {
      if (args.curl.trim().length === 0) {
        return { ok: false, error: 'curl must be a non-empty string' } as unknown as JsonValue
      }
      const parsed = parseCurl(args.curl)
      if (!parsed.ok) {
        return { ok: false, error: parsed.error } as unknown as JsonValue
      }
      const value = buildCurlParseValue(parsed.value)
      if (args.execute) {
        const response = await runHttpRequest(parsed.value, config, exec.signal)
        value.executed = true
        value.response = response
        history.add({
          timestamp: new Date().toISOString(),
          method: parsed.value.method,
          url: parsed.value.url,
          status: response.status,
          ok: response.ok,
          durationMs: response.durationMs,
          sizeBytes: response.sizeBytes,
          truncated: response.truncated,
          bodyKind: response.bodyKind,
          curl: response.curl,
          body: response.body,
        })
      }
      return value as unknown as JsonValue
    },
  }))
}
