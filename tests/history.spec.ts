import { describe, expect, it } from 'vitest'
import { RequestHistory } from '../src/core/history.ts'

function entry(partial: Partial<Parameters<RequestHistory['add']>[0]> = {}): Parameters<RequestHistory['add']>[0] {
  return {
    timestamp: '2026-01-01T00:00:00.000Z',
    method: 'GET',
    url: 'https://api.example.com',
    status: 200,
    ok: true,
    durationMs: 10,
    sizeBytes: 5,
    truncated: false,
    bodyKind: 'json',
    curl: 'curl https://api.example.com',
    body: '{}',
    ...partial,
  }
}

describe('RequestHistory', () => {
  it('assigns ascending 1-based indices', () => {
    const history = new RequestHistory(10)
    history.add(entry())
    history.add(entry({ method: 'POST' }))
    expect(history.get(1)?.method).toBe('GET')
    expect(history.get(2)?.method).toBe('POST')
  })

  it('evicts the oldest entry beyond the limit', () => {
    const history = new RequestHistory(2)
    history.add(entry())
    history.add(entry({ method: 'POST' }))
    history.add(entry({ method: 'PUT' }))
    expect(history.size).toBe(2)
    expect(history.get(1)).toBeUndefined()
    expect(history.get(3)?.method).toBe('PUT')
  })

  it('returns recent entries newest-first', () => {
    const history = new RequestHistory(10)
    history.add(entry())
    history.add(entry({ method: 'POST' }))
    history.add(entry({ method: 'PUT' }))
    const recent = history.recent(2)
    expect(recent.map((e) => e.method)).toEqual(['PUT', 'POST'])
  })

  it('lists all entries in request order', () => {
    const history = new RequestHistory(10)
    history.add(entry())
    history.add(entry({ method: 'POST' }))
    expect(history.all().map((e) => e.method)).toEqual(['GET', 'POST'])
  })

  it('returns undefined for a missing index', () => {
    const history = new RequestHistory(10)
    history.add(entry())
    expect(history.get(99)).toBeUndefined()
  })
})
