/**
 * Typed client for the Aframp Pay backend (Rust/Axum, see Aframp-backend).
 *
 * Every call goes through this app's own `/backend/*` rewrite (see
 * next.config.mjs), which forwards it server-side to the real backend origin
 * (`NEXT_API_URL`) — the browser never learns that origin directly.
 *
 * Errors always come back as `{ "error": "message" }`.
 *
 * This barrel module preserves backwards compatibility for all existing imports.
 */

import { adminApi } from './api/admin'
import { authApi } from './api/auth'
import { paymentsApi } from './api/payments'
import { remittanceApi } from './api/remittance'

export * from './api/shared'
export * from './api/auth'
export * from './api/payments'
export * from './api/admin'
export * from './api/remittance'

export const api = {
  ...authApi,
  ...paymentsApi,
  ...remittanceApi,
  ...adminApi,
}

export type PaginationParams = {
  /** Maximum number of records to return. */
  limit?: number
  /** Opaque cursor returned by a previous page (`next_cursor`). */
  cursor?: string | null
  /** Offset-based pagination alternative to `cursor`. */
  offset?: number
}

export type PaginatedResult<T> = {
  items: T[]
  /** Cursor to pass as `cursor` to fetch the next page, or `null` when exhausted. */
  next_cursor: string | null
  /** Whether more records are available beyond this page. */
  has_more: boolean
}

function buildPaginationQuery(params?: PaginationParams): string {
  if (!params) return ''
  const search = new URLSearchParams()
  if (params.limit != null) search.set('limit', String(params.limit))
  if (params.cursor != null && params.cursor !== '') search.set('cursor', params.cursor)
  if (params.offset != null) search.set('offset', String(params.offset))
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

/**
 * Paginated transactions list. Accepts cursor/offset pagination so callers can
 * page past the default cap and reach older payments.
 */
export async function listTransactions(
  token: string,
  limitOrParams?: number | PaginationParams,
  signal?: AbortSignal,
): Promise<PaginatedResult<unknown>> {
  const params: PaginationParams =
    typeof limitOrParams === 'number' ? { limit: limitOrParams } : limitOrParams ?? {}
  const res = await fetch(`/backend/transactions${buildPaginationQuery(params)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body?.error ?? 'Failed to load transactions')
  }
  return res.json()
}

/**
 * Paginated withdrawals list. Accepts cursor/offset pagination so callers can
 * page past the default cap and reach older withdrawals.
 */
export async function listWithdrawals(
  token: string,
  limitOrParams?: number | PaginationParams,
  signal?: AbortSignal,
): Promise<PaginatedResult<unknown>> {
  const params: PaginationParams =
    typeof limitOrParams === 'number' ? { limit: limitOrParams } : limitOrParams ?? {}
  const res = await fetch(`/backend/withdrawals${buildPaginationQuery(params)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body?.error ?? 'Failed to load withdrawals')
  }
  return res.json()
}
