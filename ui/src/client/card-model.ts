/**
 * Data model for the http_request / curl_parse tool cards.
 * Reads the structured fields the tool plugin projects into the tool/result
 * `meta` (see dsh-http-tools httpResultPresentationMeta) and the call args.
 */
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'

/** Card material for one http tool call. */
export interface HttpCardModel {
  state: 'running' | 'result' | 'error'
  method: string
  url: string
  status?: number
  statusText?: string
  ok?: boolean
  durationMs?: number
  sizeBytes?: number
  truncated?: boolean
  headers?: Record<string, string>
  body?: string
  bodyKind?: string
  curl?: string
  errorSummary?: string
}

/** Minimal structural view of a text block; avoids pulling dsh-llm types. */
type AnyBlock = { type?: unknown; text?: unknown }

function safeParseArgs(raw: string | null | undefined): { method?: string; url?: string } | undefined {
  if (!raw) return undefined
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value === 'object' && value !== null) {
      const record = value as Record<string, unknown>
      return {
        method: typeof record.method === 'string' ? record.method : undefined,
        url: typeof record.url === 'string' ? record.url : undefined,
      }
    }
  } catch {
    // argsRaw is not always JSON; fall through to undefined.
  }
  return undefined
}

function firstTextOf(content: readonly AnyBlock[] | null | undefined): string {
  for (const block of content ?? []) {
    if (typeof block.text === 'string' && block.text.length > 0) return block.text
  }
  return ''
}

const asNumber = (value: unknown): number | undefined => typeof value === 'number' ? value : undefined
const asString = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined
const asBoolean = (value: unknown): boolean | undefined => typeof value === 'boolean' ? value : undefined

function asHeaders(value: unknown): Record<string, string> | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const [name, v] of Object.entries(record)) {
    if (typeof v === 'string') out[name] = v
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** Derive the card material from a running or settled tool block. */
export function httpCardModel(block: ToolCallBlock): HttpCardModel {
  // RunningToolCall carries a top-level `name`; ToolResultNode does not.
  if ('name' in block) {
    const args = safeParseArgs(block.argsRaw)
    return { state: 'running', method: args?.method ?? 'GET', url: args?.url ?? '' }
  }
  const args = safeParseArgs(block.call?.argsRaw)
  if (block.isError) {
    return {
      state: 'error',
      method: args?.method ?? 'GET',
      url: args?.url ?? '',
      errorSummary: firstTextOf(block.content),
    }
  }
  const meta = block.meta as Record<string, unknown> | undefined
  return {
    state: 'result',
    method: args?.method ?? 'GET',
    url: args?.url ?? '',
    status: asNumber(meta?.status),
    statusText: asString(meta?.statusText),
    ok: asBoolean(meta?.ok),
    durationMs: asNumber(meta?.durationMs),
    sizeBytes: asNumber(meta?.sizeBytes),
    truncated: asBoolean(meta?.truncated),
    headers: asHeaders(meta?.headers),
    body: asString(meta?.body),
    bodyKind: asString(meta?.bodyKind),
    curl: asString(meta?.curl),
  }
}
