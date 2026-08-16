/** Shared value types for the dsh-http-tools plugin. */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD'

export type BodyType = 'json' | 'text' | 'form'

export type BodyKind = 'json' | 'text' | 'html' | 'binary' | 'empty'

export interface HttpRequestBody {
  type: BodyType
  content: string
}

export interface HttpAuth {
  type: 'bearer' | 'basic'
  /** Bearer token, or `username:password` for basic auth. */
  token: string
}

/** One request as the tools understand it. */
export interface HttpRequestSpec {
  method: HttpMethod
  url: string
  headers?: Record<string, string>
  body?: HttpRequestBody
  auth?: HttpAuth
  timeoutMs?: number
  redirect?: 'follow' | 'manual'
}

/** The canonical value `http_request` returns; also the response fragment of curl_parse. */
export interface HttpResponseValue {
  ok: boolean
  status: number
  statusText: string
  durationMs: number
  sizeBytes: number
  truncated: boolean
  headers: Record<string, string>
  body: string
  bodyKind: BodyKind
  /** Equivalent curl command, readable and re-runnable. */
  curl: string
}

/** One retained request in the in-session history. */
export interface HistoryEntry {
  /** 1-based index assigned in request order. */
  index: number
  timestamp: string
  method: HttpMethod
  url: string
  status: number
  ok: boolean
  durationMs: number
  sizeBytes: number
  truncated: boolean
  bodyKind: BodyKind
  curl: string
  /** Response body (already capped by maxBodyChars). */
  body: string
}
