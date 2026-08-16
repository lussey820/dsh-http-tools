import { describe, expect, it } from 'vitest'
import {
  curlParsePresentationMeta,
  httpResultPresentationMeta,
  PREVIEW_BODY_CHARS,
  selectDisplayHeaders,
} from '../src/core/format.ts'
import type { HttpResponseValue } from '../src/core/types.ts'

function response(body: string): HttpResponseValue {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    durationMs: 10,
    sizeBytes: body.length,
    truncated: false,
    headers: {},
    body,
    bodyKind: 'json',
    curl: 'curl https://example.com',
  }
}

describe('selectDisplayHeaders', () => {
  it('keeps content-type, content-length, and link headers', () => {
    const lines = selectDisplayHeaders({
      'content-type': 'application/json',
      'content-length': '42',
      link: '<https://api.github.com/next>; rel="next"',
      'x-request-id': 'abc',
    })
    expect(lines.join(' · ')).toContain('content-type: application/json')
    expect(lines.join(' · ')).toContain('content-length: 42')
    expect(lines.join(' · ')).toContain('link: <https://api.github.com/next>; rel="next"')
    expect(lines.join(' · ')).not.toContain('x-request-id')
  })

  it('returns an empty array when no display headers exist', () => {
    expect(selectDisplayHeaders({ 'x-request-id': 'abc' })).toEqual([])
  })
})

describe('httpResultPresentationMeta', () => {
  it('truncates the persisted body to the preview length', () => {
    const meta = httpResultPresentationMeta(response('x'.repeat(PREVIEW_BODY_CHARS + 500)))
    expect(meta.body.length).toBe(PREVIEW_BODY_CHARS)
    // 其他字段原样保留
    expect(meta.status).toBe(200)
    expect(meta.curl).toBe('curl https://example.com')
  })

  it('keeps small bodies untouched', () => {
    const value = response('hello')
    expect(httpResultPresentationMeta(value).body).toBe('hello')
  })
})

describe('curlParsePresentationMeta', () => {
  it('truncates the executed response body', () => {
    const value = curlParsePresentationMeta({
      ok: true,
      method: 'POST',
      url: 'https://example.com',
      executed: true,
      response: response('y'.repeat(PREVIEW_BODY_CHARS + 500)),
    })
    expect(value.ok).toBe(true)
    expect(value.response?.body.length).toBe(PREVIEW_BODY_CHARS)
    expect(value.method).toBe('POST')
  })

  it('returns non-ok values as-is', () => {
    const value = curlParsePresentationMeta({ ok: false, error: 'boom' })
    expect(value).toEqual({ ok: false, error: 'boom' })
  })

  it('returns parsed-only values as-is (no response)', () => {
    const value = curlParsePresentationMeta({ ok: true, method: 'GET', url: 'https://example.com' })
    expect(value.response).toBeUndefined()
  })
})
