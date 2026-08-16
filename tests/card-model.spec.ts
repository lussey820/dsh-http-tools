import { describe, expect, it } from 'vitest'
import { httpCardModel } from '../ui/src/client/card-model.ts'
import type { RunningToolCall, ToolResultNode } from '@deepseek-ai/dsh-client-runtime/client'

function runningCall(overrides: Partial<RunningToolCall> = {}): RunningToolCall {
  return {
    callId: 'c1', name: 'http_request', argsRaw: '{"method":"GET","url":"https://a.com/x"}',
    turn: 1, step: 1, time: 0, callView: null, subCalls: [],
    ...overrides,
  }
}

function resultNode(overrides: Partial<ToolResultNode> = {}): ToolResultNode {
  return {
    kind: 'tool-result', seq: 1, time: 0, callId: 'c1',
    call: { name: 'http_request', argsRaw: '{"method":"GET","url":"https://a.com/x"}' },
    callTime: 0, content: [], isError: false, callView: null, resultView: null,
    ...overrides,
  }
}

describe('httpCardModel', () => {
  it('renders a running call from args', () => {
    const card = httpCardModel(runningCall())
    expect(card.state).toBe('running')
    expect(card.method).toBe('GET')
    expect(card.url).toBe('https://a.com/x')
  })

  it('extracts structured fields from result meta', () => {
    const block = resultNode({
      meta: {
        ok: true, status: 200, statusText: 'OK', durationMs: 530, sizeBytes: 6765,
        truncated: false, bodyKind: 'json', body: '{"a":1}', curl: 'curl https://a.com/x',
        headers: { 'content-type': 'application/json' },
      },
    })
    const card = httpCardModel(block)
    expect(card.state).toBe('result')
    expect(card.method).toBe('GET')
    expect(card.url).toBe('https://a.com/x')
    expect(card.status).toBe(200)
    expect(card.ok).toBe(true)
    expect(card.durationMs).toBe(530)
    expect(card.sizeBytes).toBe(6765)
    expect(card.body).toBe('{"a":1}')
    expect(card.headers?.['content-type']).toBe('application/json')
  })

  it('falls back to defaults when meta is absent', () => {
    const card = httpCardModel(resultNode({ meta: undefined }))
    expect(card.state).toBe('result')
    expect(card.method).toBe('GET')
    expect(card.status).toBeUndefined()
  })

  it('reports errors with the first text block', () => {
    const card = httpCardModel(resultNode({
      isError: true,
      content: [{ type: 'text', text: 'Error: fetch failed' }],
    }))
    expect(card.state).toBe('error')
    expect(card.errorSummary).toBe('Error: fetch failed')
  })
})
