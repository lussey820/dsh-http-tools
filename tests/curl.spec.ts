import { describe, expect, it } from 'vitest'
import { buildCurlParseValue, parseCurl, tokenizeCurl } from '../src/core/curl.ts'

describe('tokenizeCurl', () => {
  it('splits simple arguments', () => {
    expect(tokenizeCurl('curl https://a.com')).toEqual(['curl', 'https://a.com'])
  })

  it('honors single quotes', () => {
    expect(tokenizeCurl(`-H 'Content-Type: application/json'`)).toEqual(['-H', 'Content-Type: application/json'])
  })

  it('honors double quotes with escapes', () => {
    expect(tokenizeCurl(`-d "{\\"a\\": 1}"`)).toEqual(['-d', '{"a": 1}'])
  })

  it('merges adjacent quoted segments', () => {
    expect(tokenizeCurl(`-H "X-A: "foo`)).toEqual(['-H', 'X-A: foo'])
  })
})

describe('parseCurl', () => {
  it('parses a plain GET', () => {
    const result = parseCurl('curl https://api.example.com/users')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.method).toBe('GET')
      expect(result.value.url).toBe('https://api.example.com/users')
    }
  })

  it('parses method, headers, and JSON body', () => {
    const result = parseCurl(`curl -X POST https://api.example.com/v1/users -H "Content-Type: application/json" -H 'X-Api-Key: secret' -d '{"name":"ada"}'`)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.method).toBe('POST')
      expect(result.value.headers).toEqual({ 'content-type': 'application/json', 'x-api-key': 'secret' })
      expect(result.value.body).toEqual({ type: 'json', content: '{"name":"ada"}' })
    }
  })

  it('parses --json shorthand', () => {
    const result = parseCurl(`curl --json '{"a":1}' https://api.example.com`)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.method).toBe('POST')
      expect(result.value.headers?.['content-type']).toBe('application/json')
      expect(result.value.body).toEqual({ type: 'json', content: '{"a":1}' })
    }
  })

  it('joins multiple -d parts into form encoding', () => {
    const result = parseCurl(`curl -d 'a=1' -d 'b=2' https://api.example.com/form`)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.method).toBe('POST')
      expect(result.value.body).toEqual({ type: 'form', content: 'a=1&b=2' })
    }
  })

  it('parses basic auth', () => {
    const result = parseCurl(`curl -u 'user:pass' https://api.example.com`)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.auth).toEqual({ type: 'basic', token: 'user:pass' })
    }
  })

  it('parses glued short options', () => {
    const result = parseCurl(`curl -XPOST -HAccept: application/json https://api.example.com`)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.method).toBe('POST')
      // Real curl semantics: a glued -H consumes only its glued text as the
      // header; the following bare token is treated as a positional URL.
      expect(result.value.headers?.['accept']).toBe('')
      expect(result.value.url).toBe('application/json')
    }
  })

  it('parses a glued method with a separate header', () => {
    const result = parseCurl(`curl -XPOST -H "Accept: application/json" https://api.example.com`)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.method).toBe('POST')
      expect(result.value.headers?.['accept']).toBe('application/json')
      expect(result.value.url).toBe('https://api.example.com')
    }
  })

  it('parses -L as follow redirect', () => {
    const result = parseCurl(`curl -L https://api.example.com`)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.redirect).toBe('follow')
  })

  it('detects missing URL', () => {
    const result = parseCurl('curl -X GET')
    expect(result.ok).toBe(false)
  })

  it('rejects unsupported methods', () => {
    const result = parseCurl(`curl -X TRACE https://api.example.com`)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('unsupported method')
  })

  it('rejects unknown options', () => {
    const result = parseCurl(`curl --bogus https://api.example.com`)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('unsupported option')
  })

  it('uses default GET when only -d style data with explicit GET is absent', () => {
    const result = parseCurl(`curl --data-raw 'x' https://api.example.com`)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.method).toBe('POST')
      expect(result.value.body).toEqual({ type: 'text', content: 'x' })
    }
  })
})

describe('buildCurlParseValue (lossless JSON)', () => {
  it('never emits undefined properties for a curl without auth/redirect', () => {
    // 复现线上 bug：无 -u/-L 的 curl 此前会输出 auth/redirect: undefined，
    // 导致框架报 "value is not lossless JSON"。
    const result = parseCurl(`curl -X POST https://api.example.com/posts -H "Content-Type: application/json" -d '{"a":1}'`)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const value = buildCurlParseValue(result.value)
    for (const [key, v] of Object.entries(value)) {
      expect(v, `property "${key}" must not be undefined`).not.toBeUndefined()
    }
    // 往返序列化应保真
    expect(JSON.parse(JSON.stringify(value))).toEqual(value)
  })

  it('includes auth when the curl has one', () => {
    const result = parseCurl(`curl -u 'user:pass' https://api.example.com`)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const value = buildCurlParseValue(result.value)
    expect(value.auth).toEqual({ type: 'basic', token: 'user:pass' })
    expect(value.headers).toBeUndefined()
  })

  it('includes redirect only when the curl asks for it', () => {
    const result = parseCurl(`curl -L https://api.example.com`)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const value = buildCurlParseValue(result.value)
    expect(value.redirect).toBe('follow')
    expect(value.headers).toBeUndefined()
    expect(value.body).toBeUndefined()
    expect(value.auth).toBeUndefined()
  })
})
