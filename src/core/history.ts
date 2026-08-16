/** In-session request history for `request_history`. */

import type { HistoryEntry } from './types.ts'

/** Bounded, append-only in-memory store of completed requests. */
export class RequestHistory {
  private entries: HistoryEntry[] = []
  private nextIndex = 1

  constructor(private readonly limit: number) {}

  /** Append a completed request; evicts the oldest entry beyond the limit. */
  add(entry: Omit<HistoryEntry, 'index'>): HistoryEntry {
    const stored: HistoryEntry = { index: this.nextIndex++, ...entry }
    this.entries.push(stored)
    if (this.entries.length > this.limit) this.entries.shift()
    return stored
  }

  /** All retained entries in request order. */
  all(): HistoryEntry[] {
    return this.entries
  }

  /** The most recent entries, newest first. */
  recent(count: number): HistoryEntry[] {
    return this.entries.slice(-count).reverse()
  }

  /** Look up one entry by its 1-based request index. */
  get(index: number): HistoryEntry | undefined {
    return this.entries.find((entry) => entry.index === index)
  }

  get size(): number {
    return this.entries.length
  }
}
