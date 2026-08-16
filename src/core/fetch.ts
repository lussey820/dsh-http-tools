/** Request execution with the plugin's security boundaries. */

import type { ResolvedConfig } from '../config.ts'
import { buildCurlCommand } from './format.ts'
import type { BodyKind, HttpRequestSpec, HttpResponseValue } from './types.ts'

/** Normalize headers to lowercase names, joining duplicates with ", ". */
function normalizeHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, name) => {
    const key = name.toLowerCase()
    out[key] = out[key] ? `${out[key]}, ${value}` : value
  })
  return out
}

/** Classify a body by content-type and content text. */
function detectBodyKind(contentType: string, body: string): BodyKind {
  if (body.length === 0) return 'empty'
  const type = contentType.toLowerCase()
  if (type.includes('json') || /^\s*[\[{]/.test(body)) return 'json'
  if (type.includes('html')) return 'html'
  if (type.startsWith('text/')) return 'text'
  return 'binary'
}

/** True when the target is a loopback or RFC1918/ULA private address. */
function isPrivateHost(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (normalized === 'localhost' || normalized === '::1') return true
  if (/^127\./.test(normalized) || normalized.startsWith('10.') || normalized.startsWith('192.168.')) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(normalized)) return true
  if (/^169\.254\./.test(normalized)) return true
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true
  return false
}

/** Enforce the localOnly restriction; throws when the target is not private. */
function assertLocalOnly(hostname: string): void {
  if (!isPrivateHost(hostname)) {
    throw new Error(`http_request: localOnly mode rejects non-private host ${hostname}`)
  }
}

/**
 * Send one request and return its canonical value. Applies blockedHosts,
 * localOnly, audit-header, body/character caps, and the configured timeout.
 * `exec.signal` (when given) cancels in-flight work as well.
 */
export async function runHttpRequest(
  spec: HttpRequestSpec,
  config: ResolvedConfig,
  signal?: AbortSignal,
): Promise<HttpResponseValue> {
  let parsed: URL
  try {
    parsed = new URL(spec.url)
  } catch {
    throw new Error(`http_request: invalid URL "${spec.url}"`)
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`http_request: unsupported protocol ${parsed.protocol}`)
  }

  const hostname = parsed.hostname
  const blocked = config.blockedHosts.some((rule) => {
    const candidate = rule.toLowerCase()
    return hostname === candidate || hostname.endsWith(`.${candidate}`)
  })
  if (blocked) throw new Error(`http_request: host ${hostname} is blocked by config`)
  if (config.localOnly) assertLocalOnly(hostname)

  const timeoutMs = spec.timeoutMs ?? config.timeoutMs
  const controller = new AbortController()
  const onOuterAbort = (): void => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onOuterAbort, { once: true })
  }
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  const headers: Record<string, string> = { ...(spec.headers ?? {}) }
  if (spec.auth) {
    if (spec.auth.type === 'bearer') headers.authorization = `Bearer ${spec.auth.token}`
    else headers.authorization = `Basic ${Buffer.from(spec.auth.token, 'utf8').toString('base64')}`
  }
  if (spec.body) {
    if (spec.body.type === 'json') {
      headers['content-type'] ??= 'application/json'
    } else if (spec.body.type === 'form') {
      headers['content-type'] ??= 'application/x-www-form-urlencoded'
    } else {
      headers['content-type'] ??= 'text/plain; charset=utf-8'
    }
  }
  if (config.auditHeader) headers['x-dsh-request'] = `dsh-http-tools/${Date.now().toString(36)}`

  const startedAt = performance.now()
  let response: Response
  try {
    response = await fetch(parsed, {
      method: spec.method,
      headers,
      body: spec.method === 'GET' || spec.method === 'HEAD' ? undefined : (spec.body?.content ?? undefined),
      redirect: spec.redirect ?? 'follow',
      signal: controller.signal,
    })
  } catch (error) {
    if (signal) signal.removeEventListener('abort', onOuterAbort)
    clearTimeout(timeoutId)
    if (controller.signal.aborted && !(signal?.aborted)) {
      throw new Error(`http_request: request timed out after ${timeoutMs}ms`)
    }
    throw error
  }
  clearTimeout(timeoutId)
  if (signal) signal.removeEventListener('abort', onOuterAbort)

  const headersMap = normalizeHeaders(response.headers)
  let body = ''
  let total = 0
  let truncated = false
  if (response.body) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const chunks: string[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        total += value.byteLength
        if (total <= config.maxBodyChars) {
          chunks.push(decoder.decode(value, { stream: true }))
        }
      }
    }
    if (total > config.maxBodyChars) truncated = true
    chunks.push(decoder.decode())
    body = chunks.join('').slice(0, config.maxBodyChars)
  }

  const durationMs = Math.round(performance.now() - startedAt)
  const curl = buildCurlCommand(spec)
  const bodyKind = detectBodyKind(headersMap['content-type'] ?? '', body)

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    durationMs,
    sizeBytes: total,
    truncated,
    headers: headersMap,
    body,
    bodyKind,
    curl,
  }
}
