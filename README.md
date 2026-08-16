# dsh-http-tools

> HTTP / API debugging tools for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH).

`dsh-http-tools` gives your DeepSeek Harness agent a complete REST client: send any request with full control over method, headers, body, and auth, paste a `curl` command and let the agent run or tweak it, and review or compare past requests — all inside the chat.

## Tools

| Tool | Description |
| --- | --- |
| `http_request` | Send an HTTP request (GET/POST/PUT/PATCH/DELETE/HEAD) with custom headers, body, and auth. Returns status, duration, size, response headers, truncated body, and an equivalent `curl` command. |
| `curl_parse` | Parse a `curl` command into its structured parts (method, URL, headers, body, auth). Optionally execute it in one step with `execute: true`. |
| `request_history` | Query requests made in the current session, inspect one in detail, or compare two responses side by side. |

## Install

```sh
dsh plugin --profile web add dsh-http-tools
```

Works out of the box with zero configuration. Node.js >= 22 is required (uses the native `fetch`).

## Try it

Tell your agent things like:

```
用 http_request 调 https://api.github.com/repos/deepseek-ai/deepseek-harness 看看 star 数
```

```
POST https://httpbin.org/post，body 传 {"hello":"world"}，看看返回什么
```

```
粘贴这个 curl 命令解析一下，然后改个 header 再重发：
curl -X POST https://api.example.com/v1/users -H "Content-Type: application/json" -d '{"name":"ada"}'
```

```
用 request_history 对比 #1 和 #3 两次请求的响应差异
```

## Configuration

All options are optional. Set them in your profile's `cordis.patch.yml`:

```yaml
- id: http-tools
  name: dsh-http-tools
  config:
    maxBodyChars: 524288   # cap on response body characters returned to the model
    timeoutMs: 10000       # per-request timeout in milliseconds
    blockedHosts: []       # hostnames the plugin refuses to contact (e.g. ['169.254.169.254'])
    localOnly: false       # true = only loopback / private-network targets
    historyLimit: 50       # in-session request history retention
    auditHeader: true      # tag every request with an X-DSH-Request audit header
```

### Security model

- By default every URL is allowed; the request is tagged with an `X-DSH-Request` audit header so the server can identify agent traffic.
- `blockedHosts` rejects exact hostnames and their subdomains before any network I/O (e.g. block cloud metadata endpoints like `169.254.169.254`).
- `localOnly: true` restricts requests to loopback and private networks — a one-switch "local debugging mode".
- Response bodies are capped at `maxBodyChars` (default 512 KB) and timeouts at `timeoutMs` (default 10 s) so a runaway call can never flood the model context.
- Credentials (Bearer tokens, basic-auth pairs) are sent only as request headers. Generated `curl` commands redact `authorization`, `cookie`, `proxy-authorization`, and `x-api-key` values as `***`, so secrets do not leak into session logs or request history.

## Development

```sh
pnpm install
pnpm test      # vitest unit tests
pnpm run typecheck
pnpm run build # tsdown -> lib/
```

To smoke-test against a local DeepSeek Harness checkout, mount the built plugin with a patch overlay that references the built file:

```sh
pnpm run build

# http-tools.patch.yml — reference the built entry
# (on Windows, absolute paths must be file:// URLs, percent-encoded)
- insert:
  - id: http-tools
    name: /absolute/path/to/dsh-http-tools/lib/index.js   # POSIX
    # name: file:///C:/Users/.../dsh-http-tools/lib/index.js   # Windows

# from the deepseek-harness repo root:
pnpm dsh web --patch /absolute/path/to/http-tools.patch.yml
```

## License

MIT
