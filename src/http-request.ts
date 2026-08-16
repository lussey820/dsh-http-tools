/** The `http_request` tool: send one HTTP request and return a structured response. */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import type { ResolvedConfig } from './config.ts'
import { runHttpRequest } from './core/fetch.ts'
import { formatBytes } from './core/format.ts'
import type { RequestHistory } from './core/history.ts'
import type { BodyKind, HttpRequestBody, HttpRequestSpec, HttpResponseValue } from './core/types.ts'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as const
const BODY_TYPES = ['json', 'text', 'form'] as const
const REDIRECT_MODES = ['follow', 'manual'] as const

interface HttpRequestArgs {
  method?: (typeof METHODS)[number]
  url: string
  headers?: Record<string, unknown>
  body?: { type: (typeof BODY_TYPES)[number]; content: string }
  auth?: { type: 'bearer' | 'basic'; token: string }
  timeoutMs?: number
  redirect?: (typeof REDIRECT_MODES)[number]
}

/** Cross-field checks the schema DSL cannot express. */
function assertValidArgs(args: HttpRequestArgs): void {
  if (args.url.trim().length === 0) throw new Error('http_request: url must be a non-empty string')
  if (args.timeoutMs !== undefined && (!Number.isInteger(args.timeoutMs) || args.timeoutMs < 1)) {
    throw new Error('http_request: timeoutMs must be a positive integer')
  }
  if (args.headers !== undefined) {
    for (const [key, value] of Object.entries(args.headers)) {
      if (typeof value !== 'string') {
        throw new Error(`http_request: header "${key}" must be a string`)
      }
    }
  }
}

/** Build the request spec from validated tool arguments. */
export function requestSpecFromArgs(args: HttpRequestArgs): HttpRequestSpec {
  const body: HttpRequestBody | undefined = args.body
    ? { type: args.body.type, content: args.body.content }
    : undefined
  return {
    method: args.method ?? 'GET',
    url: args.url,
    headers: args.headers as Record<string, string> | undefined,
    body,
    auth: args.auth,
    timeoutMs: args.timeoutMs,
    redirect: args.redirect,
  }
}

/** Model-facing summary of one completed request. */
export function renderHttpResult(args: HttpRequestArgs, value: HttpResponseValue): string {
  const statusIcon = value.ok ? '✅' : '❌'
  const truncated = value.truncated ? ' · ⚠️ truncated' : ''
  const lines: string[] = [
    `${statusIcon} ${value.status} ${value.statusText} · ${value.durationMs}ms · ${formatBytes(value.sizeBytes)}${truncated}`,
    `Request: ${args.method ?? 'GET'} ${args.url}`,
  ]
  const contentHeader = Object.entries(value.headers)
    .filter(([name]) => name === 'content-type' || name === 'content-length')
    .map(([name, v]) => `${name}: ${v}`)
    .join(' · ')
  if (contentHeader) lines.push(`Headers: ${contentHeader}`)
  const body = value.body.trim()
  if (body.length > 0) {
    const fence = value.bodyKind === 'json' ? 'json' : value.bodyKind === 'html' ? 'html' : 'text'
    lines.push('Body:')
    lines.push('```' + fence)
    lines.push(body.slice(0, 6000))
    lines.push('```')
  } else {
    lines.push('Body: (empty)')
  }
  lines.push(`curl: ${value.curl}`)
  return lines.join('\n')
}

function bodyKindLabel(kind: BodyKind): string {
  if (kind === 'empty') return 'empty body'
  return `${kind} body`
}

/** Register the `http_request` tool on a context. */
export function applyHttpRequestTool(
  ctx: Context,
  config: ResolvedConfig,
  history: RequestHistory,
): void {
  ctx.tools.register(defineTool({
    name: 'http_request',
    description: 'Send an HTTP request to any URL with a chosen method, headers, body, and authentication, and return the structured response: status code, status text, duration, size, response headers, and the (possibly truncated) response body. Use it to debug or test APIs, probe endpoints, verify webhooks, check service health, or fetch data from REST endpoints. The returned value also includes an equivalent curl command.',
    parameters: {
      method: {
        type: 'string',
        enum: [...METHODS],
        description: 'HTTP method to use. Defaults to GET.',
      },
      url: {
        type: 'string',
        required: true,
        description: 'Full URL including the scheme, e.g. https://api.example.com/v1/users.',
      },
      headers: {
        type: 'object',
        additionalProperties: true,
        description: 'Optional request headers as key-value pairs, e.g. {"X-Api-Key": "abc"}.',
      },
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: {
            type: 'string',
            enum: [...BODY_TYPES],
            required: true,
            description: 'How to interpret `content`. json sends it as application/json; text as text/plain; form as application/x-www-form-urlencoded.',
          },
          content: {
            type: 'string',
            required: true,
            description: 'The raw request body text. For json, provide a valid JSON string.',
          },
        },
        description: 'Optional request body. GET and HEAD requests ignore it.',
      },
      auth: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: {
            type: 'string',
            enum: ['bearer', 'basic'],
            required: true,
            description: 'bearer sends `Authorization: Bearer <token>`; basic sends `Authorization: Basic <base64 of token>` where token is `username:password`.',
          },
          token: {
            type: 'string',
            required: true,
            description: 'The bearer token, or `username:password` for basic auth.',
          },
        },
        description: 'Optional authentication shorthand. Prefer this over hand-building the Authorization header.',
      },
      timeoutMs: {
        type: 'integer',
        description: 'Per-request timeout in milliseconds. Defaults to the plugin timeout (10000).',
      },
      redirect: {
        type: 'string',
        enum: [...REDIRECT_MODES],
        description: 'Redirect behavior. Defaults to follow.',
      },
    },
    output: {
      schema: { type: 'json' },
      render: (args, value) => [{
        type: 'text',
        text: renderHttpResult(args, value as unknown as HttpResponseValue),
      }],
      presentationMeta: (args, value) => value,
    },
    presentCall: (args) => ({
      card: 'generic',
      title: `${args.method ?? 'GET'} ${args.url}`,
      kind: 'fetch',
      rawInput: args.body?.content,
    }),
    presentResult: (args, result) => {
      const value = result.meta as unknown as HttpResponseValue | undefined
      // 历史会话恢复时 meta 可能缺失，退回基础标题而非崩溃。
      if (!value || typeof value.status !== 'number') {
        return { card: 'generic', title: `${args.method ?? 'GET'} ${args.url}` }
      }
      return {
        card: 'generic',
        title: `${value.status} ${args.method ?? 'GET'} ${args.url}`,
        content: [{ type: 'text', text: renderHttpResult(args, value) }],
      }
    },
    async execute(args, exec) {
      assertValidArgs(args)
      const spec = requestSpecFromArgs(args)
      const value = await runHttpRequest(spec, config, exec.signal)
      history.add({
        timestamp: new Date().toISOString(),
        method: spec.method,
        url: spec.url,
        status: value.status,
        ok: value.ok,
        durationMs: value.durationMs,
        sizeBytes: value.sizeBytes,
        truncated: value.truncated,
        bodyKind: value.bodyKind,
        curl: value.curl,
        body: value.body,
      })
      return value as unknown as JsonValue
    },
  }))
}

export { bodyKindLabel }
