/** Shared formatting helpers: curl command generation and byte rendering. */

import type { CurlParseValue } from './curl.ts'
import type { HttpRequestSpec, HttpResponseValue } from './types.ts'

/** 写入展示层（render / presentationMeta）的响应体最大字符数。 */
export const PREVIEW_BODY_CHARS = 6000

/** Render bytes as a compact human string (e.g. `3.2KB`). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

/** 挑选要展示给模型的响应头：类型/长度 + 分页所需的 Link。 */
export function selectDisplayHeaders(headers: Record<string, string>): string[] {
  return Object.entries(headers)
    .filter(([name]) => name === 'content-type' || name === 'content-length' || name === 'link')
    .map(([name, v]) => `${name}: ${v}`)
}

/**
 * presentationMeta 瘦身：只保留 render 需要的响应体前缀。
 * 完整 body 会随会话持久化，不截断会让 session 文件随请求数无限膨胀。
 */
export function httpResultPresentationMeta(value: HttpResponseValue): HttpResponseValue {
  return { ...value, body: value.body.slice(0, PREVIEW_BODY_CHARS) }
}

/** curl_parse 版 presentationMeta 瘦身（含执行后的响应体）。 */
export function curlParsePresentationMeta(value: CurlParseValue): CurlParseValue {
  if (!value.ok || !value.response) return value
  return {
    ...value,
    response: { ...value.response, body: value.response.body.slice(0, PREVIEW_BODY_CHARS) },
  }
}

/** Quote a shell argument with single quotes, escaping embedded quotes. */
function shellQuote(value: string): string {
  if (!/[\s'"\\$`]/.test(value)) return value
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** Header names whose values are redacted in generated curl commands. */
const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'proxy-authorization', 'x-api-key'])

/** Build a readable, re-runnable curl command for a request spec. */
export function buildCurlCommand(spec: HttpRequestSpec): string {
  const parts: string[] = ['curl']
  if (spec.method !== 'GET') parts.push('-X', spec.method)
  parts.push(shellQuote(spec.url))
  const headers: Record<string, string> = { ...(spec.headers ?? {}) }
  if (spec.auth) {
    if (spec.auth.type === 'bearer') headers.authorization = `Bearer ${spec.auth.token}`
    else headers.authorization = `Basic ${Buffer.from(spec.auth.token, 'utf8').toString('base64')}`
  }
  for (const [name, value] of Object.entries(headers)) {
    const redacted = SENSITIVE_HEADERS.has(name.toLowerCase()) ? '***' : value
    parts.push('-H', shellQuote(`${name}: ${redacted}`))
  }
  if (spec.body) parts.push('-d', shellQuote(spec.body.content))
  return parts.join(' ')
}
