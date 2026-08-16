/** The `request_history` tool: query and compare requests made in the current session. */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import { formatBytes } from './core/format.ts'
import type { RequestHistory } from './core/history.ts'
import type { HistoryEntry } from './core/types.ts'

const QUERY_MODES = ['recent', 'by-index', 'all'] as const

interface RequestHistoryArgs {
  query?: (typeof QUERY_MODES)[number]
  index?: number
  compare?: number[]
}

interface HistorySummary {
  index: number
  method: string
  url: string
  status: number
  ok: boolean
  durationMs: number
  sizeBytes: number
  bodyKind: string
  truncated: boolean
  timestamp: string
}

function summarize(entry: HistoryEntry): HistorySummary {
  return {
    index: entry.index,
    method: entry.method,
    url: entry.url,
    status: entry.status,
    ok: entry.ok,
    durationMs: entry.durationMs,
    sizeBytes: entry.sizeBytes,
    bodyKind: entry.bodyKind,
    truncated: entry.truncated,
    timestamp: entry.timestamp,
  }
}

/** Render a summary line for one history entry. */
function renderSummaryLine(entry: HistorySummary): string {
  const icon = entry.ok ? '✅' : '❌'
  return `${icon} #${entry.index} ${entry.method} ${entry.url} → ${entry.status} · ${entry.durationMs}ms · ${formatBytes(entry.sizeBytes)}`
}

/** Compute a compact list of differences between two stored entries. */
function diffEntries(first: HistoryEntry, second: HistoryEntry): string[] {
  const differences: string[] = []
  if (first.status !== second.status) differences.push(`status ${first.status} → ${second.status}`)
  if (first.durationMs !== second.durationMs) differences.push(`duration ${first.durationMs}ms → ${second.durationMs}ms`)
  if (first.sizeBytes !== second.sizeBytes) differences.push(`size ${formatBytes(first.sizeBytes)} → ${formatBytes(second.sizeBytes)}`)
  if (first.bodyKind !== second.bodyKind) differences.push(`body kind ${first.bodyKind} → ${second.bodyKind}`)
  if (first.truncated !== second.truncated) differences.push(`truncated ${first.truncated} → ${second.truncated}`)
  if (first.body !== second.body) {
    const f = first.body.trim()
    const s = second.body.trim()
    if (f === s) {
      differences.push('body content identical (whitespace differs)')
    } else if (f.length === 0 || s.length === 0) {
      differences.push(`body present → ${s.length === 0 ? 'empty' : 'non-empty'}`)
    } else {
      differences.push(`body changed (${formatBytes(first.sizeBytes)} → ${formatBytes(second.sizeBytes)}), bodies differ in content`)
    }
  } else {
    differences.push('body identical')
  }
  return differences
}

/** Model-facing content for a history query result. */
export function renderHistoryResult(args: RequestHistoryArgs, value: HistoryResultValue): string {
  if (value.error) return `⚠️ ${value.error}`
  if (value.entries) {
    const lines = value.entries.map(renderSummaryLine)
    return `Request history (${value.total} in session):\n${lines.join('\n') || '(no requests yet)'}`
  }
  if (value.entry) {
    const e = value.entry
    const lines = [
      renderSummaryLine(e),
      `Timestamp: ${e.timestamp}`,
      `curl: ${e.curl}`,
    ]
    const body = e.body.trim()
    if (body.length > 0) {
      lines.push('Body:')
      lines.push('```text')
      lines.push(body.slice(0, 1000))
      lines.push('```')
    }
    return lines.join('\n')
  }
  if (value.comparison) {
    const { first, second, differences } = value.comparison
    const lines = [
      renderSummaryLine(first),
      renderSummaryLine(second),
      '',
      ...differences.map((d) => `- ${d}`),
    ]
    return lines.join('\n')
  }
  return 'No result.'
}

interface HistoryResultValue {
  query?: string
  error?: string
  total?: number
  entries?: HistorySummary[]
  entry?: HistorySummary & { curl: string; body: string }
  comparison?: { first: HistorySummary; second: HistorySummary; differences: string[] }
}

/** Register the `request_history` tool on a context. */
export function applyRequestHistoryTool(
  ctx: Context,
  history: RequestHistory,
): void {
  ctx.tools.register(defineTool({
    name: 'request_history',
    description: 'Query requests made by http_request and curl_parse in the current session. List recent or all requests, inspect one request in detail (including its response body), or compare the responses of two requests to see what changed. Useful for debugging API changes across repeated calls.',
    parameters: {
      query: {
        type: 'string',
        enum: [...QUERY_MODES],
        description: 'What to return. recent (default) lists the newest requests; all lists everything retained; by-index returns one request in full detail.',
      },
      index: {
        type: 'integer',
        description: 'The 1-based request index to inspect when query is by-index.',
      },
      compare: {
        type: 'array',
        items: { type: 'integer' },
        description: 'Two 1-based request indices to compare, e.g. [1, 2].',
      },
    },
    output: {
      schema: { type: 'json' },
      render: (args, value) => [{
        type: 'text',
        text: renderHistoryResult(args, value as unknown as HistoryResultValue),
      }],
      presentationMeta: (args, value) => value,
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'request_history',
      rawInput: args.compare ? `compare ${args.compare.join(' vs ')}` : (args.query ?? 'recent'),
    }),
    presentResult: (args, result) => {
      const value = result.meta as unknown as HistoryResultValue
      return {
        card: 'generic',
        title: value.entry
          ? `#${value.entry.index} ${value.entry.method} ${value.entry.url}`
          : value.comparison
            ? `compare #${value.comparison.first.index} vs #${value.comparison.second.index}`
            : 'request_history',
        content: [{ type: 'text', text: renderHistoryResult(args, value) }],
      }
    },
    async execute(args) {
      if (args.compare !== undefined) {
        if (args.compare.length !== 2) {
          return { query: 'compare', error: 'compare must contain exactly two request indices' } as unknown as JsonValue
        }
        const [a, b] = args.compare
        if (a === undefined || b === undefined) {
          return { query: 'compare', error: 'compare must contain exactly two request indices' } as unknown as JsonValue
        }
        const first = history.get(a)
        const second = history.get(b)
        if (!first || !second) {
          return { query: 'compare', error: `request index not found: ${!first ? a : b}` } as unknown as JsonValue
        }
        return {
          query: 'compare',
          comparison: {
            first: summarize(first),
            second: summarize(second),
            differences: diffEntries(first, second),
          },
        } as unknown as JsonValue
      }
      if (args.query === 'by-index') {
        const index = args.index
        if (index === undefined) {
          return { query: 'by-index', error: 'index is required when query is by-index' } as unknown as JsonValue
        }
        const entry = history.get(index)
        if (!entry) return { query: 'by-index', error: `no request with index ${index}` } as unknown as JsonValue
        return { query: 'by-index', entry: { ...summarize(entry), curl: entry.curl, body: entry.body } } as unknown as JsonValue
      }
      const entries = args.query === 'all' ? history.all() : history.recent(10)
      return { query: args.query ?? 'recent', total: history.size, entries: entries.map(summarize) } as unknown as JsonValue
    },
  }))
}
