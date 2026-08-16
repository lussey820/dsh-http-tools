import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.ts'
import { runHttpRequest } from '../src/core/fetch.ts'
import type { HttpRequestSpec } from '../src/core/types.ts'

let server: ReturnType<typeof createServer>
let baseUrl: string

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/json') {
      res.setHeader('content-type', 'application/json')
      res.setHeader('x-custom', 'yes')
      res.end(JSON.stringify({ hello: 'world', items: [1, 2, 3] }))
      return
    }
    if (req.url === '/echo') {
      const chunks: Buffer[] = []
      req.on('data', (c) => chunks.push(c as Buffer))
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        res.setHeader('content-type', req.headers['content-type'] ?? 'text/plain')
        res.end(`method=${req.method};auth=${req.headers.authorization ?? ''};hdr=${req.headers['x-dsh-request'] ?? ''};body=${body}`)
      })
      return
    }
    if (req.url === '/large') {
      res.end('x'.repeat(10_000))
      return
    }
    if (req.url === '/slow') {
      setTimeout(() => res.end('done'), 500)
      return
    }
    if (req.url === '/redirect') {
      res.statusCode = 302
      res.setHeader('location', `${baseUrl}/json`)
      res.end()
      return
    }
    if (req.url === '/status') {
      res.statusCode = 404
      res.end('not found')
      return
    }
    res.statusCode = 404
    res.end('nope')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

function spec(overrides: Partial<HttpRequestSpec>): HttpRequestSpec {
  return { method: 'GET', url: baseUrl, ...overrides }
}

describe('runHttpRequest', () => {
  const config = resolveConfig({})

  it('returns a structured response for a JSON GET', async () => {
    const value = await runHttpRequest(spec({ url: `${baseUrl}/json` }), config)
    expect(value.ok).toBe(true)
    expect(value.status).toBe(200)
    expect(value.statusText).toBe('OK')
    expect(value.bodyKind).toBe('json')
    expect(value.headers['content-type']).toContain('application/json')
    expect(value.headers['x-custom']).toBe('yes')
    expect(JSON.parse(value.body)).toEqual({ hello: 'world', items: [1, 2, 3] })
    expect(value.curl).toContain('curl')
    expect(value.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('sends method, headers, auth, and body', async () => {
    const value = await runHttpRequest(spec({
      method: 'POST',
      url: `${baseUrl}/echo`,
      headers: { 'content-type': 'application/json' },
      auth: { type: 'bearer', token: 'tok-123' },
      body: { type: 'json', content: '{"a":1}' },
    }), config)
    expect(value.body).toContain('method=POST')
    expect(value.body).toContain('auth=Bearer tok-123')
    expect(value.body).toContain('body={"a":1}')
  })

  it('adds the audit header when enabled', async () => {
    const value = await runHttpRequest(spec({ url: `${baseUrl}/echo` }), resolveConfig({ auditHeader: true }))
    expect(value.body).toContain('hdr=dsh-http-tools/')
  })

  it('omits the audit header when disabled', async () => {
    const value = await runHttpRequest(spec({ url: `${baseUrl}/echo` }), resolveConfig({ auditHeader: false }))
    expect(value.body).toContain('hdr=;')
  })

  it('reports a non-2xx status as a result, not an error', async () => {
    const value = await runHttpRequest(spec({ url: `${baseUrl}/status` }), config)
    expect(value.ok).toBe(false)
    expect(value.status).toBe(404)
    expect(value.body).toBe('not found')
  })

  it('follows redirects by default', async () => {
    const value = await runHttpRequest(spec({ url: `${baseUrl}/redirect` }), config)
    expect(value.status).toBe(200)
    expect(value.body).toContain('hello')
  })

  it('truncates oversized bodies and flags it', async () => {
    const small = resolveConfig({ maxBodyChars: 100 })
    const value = await runHttpRequest(spec({ url: `${baseUrl}/large` }), small)
    expect(value.truncated).toBe(true)
    expect(value.body.length).toBeLessThanOrEqual(100)
  })

  it('enforces blockedHosts before any network I/O', async () => {
    const blocked = resolveConfig({ blockedHosts: ['api.example.com'] })
    await expect(
      runHttpRequest(spec({ url: 'https://api.example.com/x' }), blocked),
    ).rejects.toThrow('blocked by config')
  })

  it('rejects non-private hosts in localOnly mode', async () => {
    const local = resolveConfig({ localOnly: true })
    await expect(
      runHttpRequest(spec({ url: 'https://example.com/x' }), local),
    ).rejects.toThrow('localOnly')
  })

  it('allows loopback hosts in localOnly mode', async () => {
    const local = resolveConfig({ localOnly: true })
    const value = await runHttpRequest(spec({ url: `${baseUrl}/json` }), local)
    expect(value.status).toBe(200)
  })

  it('times out slow requests', async () => {
    const fast = resolveConfig({ timeoutMs: 100 })
    await expect(
      runHttpRequest(spec({ url: `${baseUrl}/slow` }), fast),
    ).rejects.toThrow('timed out after 100ms')
  })

  it('rejects non-http(s) protocols', async () => {
    await expect(
      runHttpRequest(spec({ url: 'ftp://example.com/x' }), config),
    ).rejects.toThrow('unsupported protocol')
  })

  it('rejects invalid URLs', async () => {
    await expect(runHttpRequest(spec({ url: 'not a url' }), config)).rejects.toThrow('invalid URL')
  })

  it('surfaces the underlying network error code', async () => {
    // 取一个刚释放的空闲端口（未监听），连接会立即 ECONNREFUSED；
    // 错误信息应透出底层码，而不是笼统的 "fetch failed"。
    const probe = createNetServer()
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
    const free = (probe.address() as AddressInfo).port
    await new Promise<void>((resolve) => probe.close(() => resolve()))
    await expect(
      runHttpRequest(spec({ url: `http://127.0.0.1:${free}/x` }), config),
    ).rejects.toThrow(/request failed.*(ECONNREFUSED|EADDRNOTAVAIL|ENETUNREACH|ECONNRESET)/)
  })
})
