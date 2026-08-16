# dsh-http-tools

> 为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）打造的 HTTP / API 调试工具集。

`dsh-http-tools` 让你的 DSH agent 拥有一个完整的 REST 客户端：可以发送任意请求（完整控制 method、headers、body 与认证），粘贴一段 `curl` 命令让 agent 直接解析或改造后重发，还可以在会话内回顾、对比历史请求——全程都在对话里完成。

## 工具

| 工具 | 说明 |
| --- | --- |
| `http_request` | 发送 HTTP 请求（GET/POST/PUT/PATCH/DELETE/HEAD），支持自定义 headers、body 与认证。返回状态码、耗时、大小、响应头、截断后的响应体，以及等价的 `curl` 命令。 |
| `curl_parse` | 把 `curl` 命令解析为结构化请求（method、URL、headers、body、auth），可加 `execute: true` 一步解析并发送。 |
| `request_history` | 查询当前会话内的历史请求，查看某次请求的详情，或并排对比两次响应。 |

## 安装

```sh
dsh plugin --profile web add dsh-http-tools
```

零配置开箱即用。需要 Node.js >= 22（使用原生 `fetch`）。

## 试试

直接对你的 agent 说：

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

## 配置

所有配置项都可选。在 profile 的 `cordis.patch.yml` 中设置：

```yaml
- id: http-tools
  name: dsh-http-tools
  config:
    maxBodyChars: 524288   # 返回给模型的响应体字符上限
    timeoutMs: 10000       # 单请求超时（毫秒）
    blockedHosts: []       # 禁止访问的主机名（例如 ['169.254.169.254']）
    localOnly: false       # true = 只允许访问回环 / 私网地址
    historyLimit: 50       # 会话内请求历史保留条数
    auditHeader: true      # 为每个请求附加 X-DSH-Request 审计头
```

### 安全模型

- 默认允许访问任意 URL；每个请求都会带上 `X-DSH-Request` 审计头，便于服务端识别 agent 流量。
- `blockedHosts` 会在任何网络 I/O 之前拒绝精确主机名及其子域（例如拦截云元数据端点 `169.254.169.254`）。
- `localOnly: true` 将请求限制在回环与私网范围——一键"本地调试模式"。
- 响应体默认截断在 `maxBodyChars`（512 KB），请求默认超时 `timeoutMs`（10 秒），失控调用不会淹没模型上下文。
- 凭据（Bearer token、Basic 认证串）只作为请求头发送；生成的 `curl` 命令会把 `authorization`、`cookie`、`proxy-authorization`、`x-api-key` 的值脱敏为 `***`，避免密钥泄漏进会话日志与请求历史。

## 开发

```sh
pnpm install
pnpm test      # vitest 单元测试
pnpm run typecheck
pnpm run build # tsdown -> lib/
```

针对本地 DeepSeek Harness 检出做冒烟测试，用引用构建产物的 patch 覆盖层挂载插件：

```sh
pnpm run build

# http-tools.patch.yml —— 用绝对路径引用构建后的入口
- insert:
  - id: http-tools
    name: /绝对路径/dsh-http-tools/lib/index.js

# 在 deepseek-harness 仓库根目录执行：
pnpm dsh web --patch /绝对路径/http-tools.patch.yml
```

## 许可证

MIT
