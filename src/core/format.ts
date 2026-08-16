/** Shared formatting helpers: curl command generation and byte rendering. */

import type { HttpRequestSpec } from './types.ts'

/** Render bytes as a compact human string (e.g. `3.2KB`). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
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
