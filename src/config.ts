/**
 * Plugin configuration for dsh-http-tools. Values are resolved from the
 * cordis.yml `config` block for the `http-tools` plugin row; every field has a
 * default so the plugin works with zero configuration.
 */

/** Default cap on the response body characters handed to the model. */
export const DEFAULT_MAX_BODY_CHARS = 512 * 1024

/** Default per-request timeout in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 10_000

/** Default in-session request history retention. */
export const DEFAULT_HISTORY_LIMIT = 50

/** Default audit-header behavior: tag every request with X-DSH-Request. */
export const DEFAULT_AUDIT_HEADER = true

export interface PluginConfig {
  /** Cap on response body characters returned to the model. Defaults to 524288. */
  maxBodyChars?: number
  /** Per-request timeout in milliseconds. Defaults to 10000. */
  timeoutMs?: number
  /** Hostnames the plugin refuses to send requests to. Defaults to []. */
  blockedHosts?: string[]
  /** Restrict every request to loopback and private network targets. Defaults to false. */
  localOnly?: boolean
  /** In-session request history retention. Defaults to 50. */
  historyLimit?: number
  /** Tag every outgoing request with an `X-DSH-Request` audit header. Defaults to true. */
  auditHeader?: boolean
}

export interface ResolvedConfig {
  maxBodyChars: number
  timeoutMs: number
  blockedHosts: readonly string[]
  localOnly: boolean
  historyLimit: number
  auditHeader: boolean
}

/** Fill defaults for a partial config; positive-integer fields are sanity-checked. */
export function resolveConfig(config?: PluginConfig): ResolvedConfig {
  const maxBodyChars = config?.maxBodyChars ?? DEFAULT_MAX_BODY_CHARS
  const timeoutMs = config?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const historyLimit = config?.historyLimit ?? DEFAULT_HISTORY_LIMIT
  if (!Number.isInteger(maxBodyChars) || maxBodyChars < 1) {
    throw new Error('dsh-http-tools: maxBodyChars must be a positive integer')
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error('dsh-http-tools: timeoutMs must be a positive integer')
  }
  if (!Number.isInteger(historyLimit) || historyLimit < 1) {
    throw new Error('dsh-http-tools: historyLimit must be a positive integer')
  }
  return {
    maxBodyChars,
    timeoutMs,
    blockedHosts: config?.blockedHosts ?? [],
    localOnly: config?.localOnly ?? false,
    historyLimit,
    auditHeader: config?.auditHeader ?? DEFAULT_AUDIT_HEADER,
  }
}
