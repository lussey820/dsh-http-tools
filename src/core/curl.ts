/** A best-effort curl command-line parser for the `curl_parse` tool. */

import type { HttpAuth, HttpMethod, HttpRequestBody, HttpRequestSpec, HttpResponseValue } from './types.ts'

export type ParseResult =
  | { ok: true; value: HttpRequestSpec }
  | { ok: false; error: string }

/** Header-like value parts: lowercased name and raw value. */
interface HeaderEntry {
  name: string
  value: string
}

/** Split a shell-like command line into tokens, honoring quotes and escapes. */
export function tokenizeCurl(input: string): string[] {
  const tokens: string[] = []
  let i = 0
  const n = input.length
  while (i < n) {
    while (i < n && /\s/.test(input[i]!)) i++
    if (i >= n) break
    let token = ''
    let quote: '"' | "'" | null = null
    while (i < n) {
      const c = input[i]!
      if (quote !== null) {
        if (c === quote) {
          quote = null
          i++
        } else if (c === '\\' && quote === '"') {
          token += input[i + 1] ?? '\\'
          i += 2
        } else {
          token += c
          i++
        }
      } else if (c === '"' || c === "'") {
        quote = c
        i++
      } else if (/\s/.test(c)) {
        break
      } else if (c === '\\') {
        token += input[i + 1] ?? '\\'
        i += 2
      } else {
        token += c
        i++
      }
    }
    tokens.push(token)
  }
  return tokens
}

/** Split one header token `Name: value` on the first colon. */
function parseHeader(token: string): HeaderEntry | null {
  const colon = token.indexOf(':')
  if (colon < 0) return null
  const name = token.slice(0, colon).trim().toLowerCase()
  const value = token.slice(colon + 1).trim()
  if (!name) return null
  return { name, value }
}

/** Guess the request body kind from the content-type header and content text. */
function inferBodyType(contentType: string, content: string): HttpRequestBody['type'] {
  if (contentType.includes('application/json') || contentType.includes('+json')) return 'json'
  if (contentType.includes('x-www-form-urlencoded')) return 'form'
  if (/^\s*[\[{]/.test(content)) return 'json'
  return 'text'
}

/**
 * Parse a curl command into a structured request. Supports the subset of curl
 * options that matter for API work: -X/--request, -H/--header, -d/--data,
 * --data-raw, --json, -u/--user, -A/--user-agent, -b/--cookie, -L/--location,
 * -k/--insecure, --compressed, and URL. Unknown options abort with a message.
 */
export function parseCurl(input: string): ParseResult {
  const tokens = tokenizeCurl(input)
  if (tokens.length === 0) return { ok: false, error: 'curl_parse: empty command' }

  // Skip a leading executable name (usually `curl`, possibly with a path).
  let start = 0
  if (tokens[0]?.toLowerCase() === 'curl' || tokens[0]?.toLowerCase().endsWith('/curl')) {
    start = 1
  }

  let method: HttpMethod | null = null
  let url: string | null = null
  let redirect: 'follow' | 'manual' | undefined
  const bodyParts: string[] = []
  const headers: Record<string, string> = {}
  let auth: HttpAuth | undefined

  // Detect the trailing URL: curl's operand is positional. We walk the option
  // list and treat the first token that is not an option (and not an option's
  // argument) as the URL.
  let i = start
  const n = tokens.length
  while (i < n) {
    const token = tokens[i]!
    // The URL operand (a non-option token). Options that take an argument
    // consume the following token, so we only reach here for bare operands.
    if (!token.startsWith('-')) {
      if (url === null) {
        url = token
        i++
        continue
      }
      // A second bare operand is unexpected; keep the first and continue.
      i++
      continue
    }

    // Split `--flag=value` long options; short options may be glued (`-XPOST`).
    let flag = token
    let inline: string | null = null
    if (token.startsWith('--') && token.includes('=')) {
      const eq = token.indexOf('=')
      flag = token.slice(0, eq)
      inline = token.slice(eq + 1)
    } else if (!token.startsWith('--') && token.length > 2) {
      const two = token.slice(0, 2)
      if (['-X', '-H', '-d', '-u', '-A', '-b', '-o'].includes(two)) {
        flag = two
        inline = token.slice(2)
      }
    }

    const readArg = (name: string): string | null => {
      if (inline !== null) {
        const value = inline
        inline = null
        return value
      }
      if (i + 1 >= n) return null
      const value = tokens[i + 1]
      if (value === undefined || value.startsWith('-')) return null
      i++
      return value
    }

    switch (flag) {
      case '-X':
      case '--request': {
        const value = inline ?? readArg(flag)
        if (value === null) return { ok: false, error: `curl_parse: ${flag} requires an argument` }
        const upper = value.toUpperCase()
        if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(upper)) {
          return { ok: false, error: `curl_parse: unsupported method ${value}` }
        }
        method = upper as HttpMethod
        break
      }
      case '-H':
      case '--header': {
        const value = inline ?? readArg(flag)
        if (value === null) return { ok: false, error: `curl_parse: ${flag} requires an argument` }
        const entry = parseHeader(value)
        if (entry === null) return { ok: false, error: `curl_parse: malformed header "${value}"` }
        headers[entry.name] = entry.value
        break
      }
      case '-d':
      case '--data':
      case '--data-raw':
      case '--data-urlencode': {
        const value = inline ?? readArg(flag)
        if (value === null) return { ok: false, error: `curl_parse: ${flag} requires an argument` }
        if (method === null) method = 'POST'
        bodyParts.push(value)
        break
      }
      case '--json': {
        const value = inline ?? readArg(flag)
        if (value === null) return { ok: false, error: 'curl_parse: --json requires an argument' }
        if (method === null) method = 'POST'
        headers['content-type'] ??= 'application/json'
        bodyParts.push(value)
        break
      }
      case '-u':
      case '--user': {
        const value = inline ?? readArg(flag)
        if (value === null) return { ok: false, error: `curl_parse: ${flag} requires an argument` }
        auth = { type: 'basic', token: value }
        break
      }
      case '-A':
      case '--user-agent': {
        const value = inline ?? readArg(flag)
        if (value === null) return { ok: false, error: `curl_parse: ${flag} requires an argument` }
        headers['user-agent'] = value
        break
      }
      case '-b':
      case '--cookie': {
        const value = inline ?? readArg(flag)
        if (value === null) return { ok: false, error: `curl_parse: ${flag} requires an argument` }
        headers['cookie'] = value
        break
      }
      case '-L':
      case '--location':
        redirect = 'follow'
        break
      case '--no-location':
        redirect = 'manual'
        break
      case '-k':
      case '--insecure':
        // Accepted for compatibility; TLS verification is always on (Node fetch).
        break
      case '--compressed':
      case '-s':
      case '--silent':
      case '-o':
      case '--output':
        // Accept common noise flags. -o takes an argument.
        if (flag === '-o' || flag === '--output') {
          if (readArg(flag) === null) return { ok: false, error: `curl_parse: ${flag} requires an argument` }
        }
        break
      default:
        return { ok: false, error: `curl_parse: unsupported option ${token}` }
    }
    i++
  }

  if (url === null) {
    return { ok: false, error: 'curl_parse: no URL found in command' }
  }

  let body: HttpRequestBody | undefined
  if (bodyParts.length > 0) {
    const contentType = headers['content-type'] ?? ''
    const content = bodyParts.length === 1 ? bodyParts[0]! : bodyParts.join('&')
    const type = contentType.includes('x-www-form-urlencoded') || bodyParts.length > 1
      ? 'form'
      : inferBodyType(contentType, content)
    body = { type, content }
  }

  const spec: HttpRequestSpec = {
    method: method ?? 'GET',
    url,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body,
    auth,
    redirect,
  }
  return { ok: true, value: spec }
}

/** Structured value a `curl_parse` tool returns to the model/UI. */
export interface CurlParseValue {
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
