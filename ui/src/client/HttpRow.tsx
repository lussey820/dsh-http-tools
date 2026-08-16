/**
 * Keyed toolview row for `http_request` / `curl_parse`: DeepSeek-branded
 * method badge, official StateDot (running chase animation included), an
 * expandable response preview (JSON via JsonTree, anything else as text),
 * and copy affordances for the response body and the curl command.
 * Data comes from the tool/result meta projected by the host (card-model.ts).
 *
 * All colors resolve through --dsw-* tokens so the row follows the host
 * light/dark theme.
 */
import { useState, type CSSProperties, type MouseEvent } from 'react'
import {
  FishLogo, IconCheckOutline16, IconCopyOutline16, IconInspectOutline12, JsonTree, StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { httpCardModel } from './card-model.ts'

/** Headers worth surfacing inline above the response body. */
const DISPLAY_HEADERS = new Set(['content-type', 'content-length', 'link'])

/** Chinese labels for the JsonTree copy affordances (no locale seat here). */
const JSON_TREE_LABELS = {
  copyValue: '复制值',
  copyJson: '复制 JSON',
  copyPath: '复制属性路径',
  copyPrettyJson: '复制美化 JSON',
  copyCompactJson: '复制紧凑 JSON',
  copied: '已复制',
  copyFailed: '复制失败',
  collapseNode: '折叠节点',
  expandNode: '展开节点',
  copyButtonTitle: (action: string) => `${action}；右键查看更多复制选项`,
}

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

/** Parse the body as JSON only when it clearly is one (object/array). */
function parseJsonBody(body: string): object | unknown[] | undefined {
  const text = body.trim()
  if (!text.startsWith('{') && !text.startsWith('[')) return undefined
  try {
    const value: unknown = JSON.parse(text)
    if (typeof value === 'object' && value !== null) return value
    return undefined
  } catch {
    return undefined
  }
}

/** Copy text to the clipboard with a legacy fallback; resolves to success. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(el)
      return ok
    } catch {
      return false
    }
  }
}

const headStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
  cursor: 'pointer', userSelect: 'none', fontFamily: 'inherit',
  borderRadius: 6, transition: 'background 120ms ease',
}
const bodyWrapStyle: CSSProperties = {
  borderTop: '1px solid var(--dsw-alias-border-l2)',
  padding: '8px 12px 12px',
  display: 'flex', flexDirection: 'column', gap: 8,
}
const codeSurfaceStyle: CSSProperties = {
  margin: 0, padding: 8,
  background: 'var(--dsw-alias-markdown-code-block)',
  border: '1px solid var(--dsw-alias-border-l1)',
  borderRadius: 8, overflow: 'auto', maxHeight: 320,
  fontFamily: 'var(--dsw-font-mono, ui-monospace, monospace)',
  fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  color: 'var(--dsw-alias-label-secondary)',
}
const metaStyle: CSSProperties = {
  fontSize: 12, color: 'var(--dsw-alias-label-secondary)',
  fontFamily: 'var(--dsw-font-mono, ui-monospace, monospace)',
}
const copyButtonStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
  padding: '2px 8px', border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 6, background: 'var(--dsw-alias-bg-base)',
  color: 'var(--dsw-alias-label-secondary)', fontFamily: 'inherit', fontSize: 11,
  cursor: 'pointer', lineHeight: '16px',
}

/** Row head for one http tool card. */
export function HttpRow({ toolName, block, inspect }: ToolCallViewProps) {
  const card = httpCardModel(block)
  const [expanded, setExpanded] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [copied, setCopied] = useState<'body' | 'curl' | null>(null)

  const expandable = card.state === 'result' && (card.body !== undefined || card.curl !== undefined)
  const dotState = card.state === 'running'
    ? 'ongoing'
    : card.state === 'error'
      ? 'error'
      : card.ok === true
        ? 'done'
        : 'warning'
  const jsonBody = card.state === 'result' && card.body !== undefined
    ? parseJsonBody(card.body)
    : undefined

  const summary = card.state === 'result'
    ? `${card.status} ${card.statusText ?? ''} · ${card.durationMs}ms · ${formatBytes(card.sizeBytes)}${card.truncated ? ' · truncated' : ''}`
    : card.state === 'error'
      ? (card.errorSummary ?? 'error')
      : 'running…'

  const displayHeaders = card.headers === undefined
    ? []
    : Object.entries(card.headers).filter(([name]) => DISPLAY_HEADERS.has(name))

  const onHeadClick = (event: MouseEvent<HTMLDivElement>): void => {
    event.preventDefault()
    if (expandable) setExpanded(value => !value)
  }

  const handleCopy = async (kind: 'body' | 'curl'): Promise<void> => {
    const text = kind === 'body' ? card.body : card.curl
    if (text === undefined) return
    if (await copyText(text)) {
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 1600)
    }
  }

  return (
    <div data-tool={toolName} data-state={card.state} style={{ fontFamily: 'var(--dsw-font, inherit)', color: 'var(--dsw-alias-label-primary)' }}>
      <div
        style={{ ...headStyle, background: hovered ? 'var(--dsw-alias-interactive-bg-hover-solid)' : 'transparent' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={onHeadClick}
        role={expandable ? 'button' : undefined}
        aria-expanded={expandable ? expanded : undefined}
      >
        <span aria-hidden style={{ display: 'inline-flex', color: 'var(--dsw-alias-state-business-primary)', flexShrink: 0 }}>
          <FishLogo size={16} />
        </span>
        <StateDot state={dotState} />
        <span style={{ background: 'var(--dsw-alias-state-business-primary)', color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 600, flexShrink: 0, fontFamily: 'var(--dsw-font-mono, ui-monospace, monospace)' }}>
          {card.method}
        </span>
        <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{card.url}</span>
        <span style={metaStyle}>{summary}</span>
        {expandable && <span aria-hidden style={{ flexShrink: 0, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>{expanded ? '▾' : '▸'}</span>}
      </div>
      {expanded && card.state === 'result' && (
        <div style={bodyWrapStyle}>
          {displayHeaders.length > 0 && (
            <div style={metaStyle}>{displayHeaders.map(([name, value]) => `${name}: ${value}`).join(' · ')}</div>
          )}
          {card.body !== undefined && card.body.length > 0 && (
            <div style={{ position: 'relative' }}>
              {jsonBody !== undefined
                ? (
                  <div style={{ ...codeSurfaceStyle, padding: '4px 8px' }}>
                    <JsonTree data={jsonBody} copyable expandTopLevel label="响应体" labels={JSON_TREE_LABELS} />
                  </div>
                )
                : <pre style={codeSurfaceStyle}>{card.body}</pre>}
              <button
                type="button"
                style={{ ...copyButtonStyle, position: 'absolute', top: 6, right: 6 }}
                onClick={() => void handleCopy('body')}
              >
                {copied === 'body' ? <IconCheckOutline16 size={12} /> : <IconCopyOutline16 size={12} />}
                {copied === 'body' ? '已复制' : '复制'}
              </button>
            </div>
          )}
          {card.curl !== undefined && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...metaStyle, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>curl {card.curl}</span>
              <button
                type="button"
                style={copyButtonStyle}
                onClick={() => void handleCopy('curl')}
              >
                {copied === 'curl' ? <IconCheckOutline16 size={12} /> : <IconCopyOutline16 size={12} />}
                {copied === 'curl' ? '已复制' : '复制 curl'}
              </button>
            </div>
          )}
        </div>
      )}
      {inspect !== undefined && (
        <div style={{ padding: '0 12px 8px' }}>
          <button
            type="button"
            onClick={inspect}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer', fontSize: 12, padding: 0 }}
          >
            <IconInspectOutline12 /> Inspect
          </button>
        </div>
      )}
    </div>
  )
}
