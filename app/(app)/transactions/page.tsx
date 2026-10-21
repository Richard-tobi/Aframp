'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { ErrorState } from '@/components/ui/error-state'
import { EmptyStateIllustration } from '@/components/ui/empty-state-illustration'
import { api, ApiError, type Payment, type PaymentStatus, type Refund } from '@/lib/api'
import { formatStroops, parseAmountToStroops } from '@/lib/money'
import {
  filterPaymentsByDateRange,
  filterPaymentsByStatus,
  searchPayments,
} from '@/lib/transaction-filters'
import { useAuthenticatedSession } from '@/components/session-provider'
import { formatDateTime } from '@/lib/format-date'
import { downloadCsv, toCsv } from '@/lib/csv'

const EXPLORER_BASE = `https://stellar.expert/explorer/${
  process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'PUBLIC' ? 'public' : 'testnet'
}/tx`

const PAGE_SIZE = 50

const STATUS_LABEL: Record<PaymentStatus, string> = {
  detected: 'Incoming',
  verified: 'Confirming',
  confirmed: 'Paid',
  failed: 'Failed',
}

const FILTERABLE_STATUSES: PaymentStatus[] = ['detected', 'verified', 'confirmed', 'failed']

function DebouncedSearchInput({ onSearch }: { onSearch: (query: string) => void }) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    const timeout = window.setTimeout(() => onSearch(query), 250)
    return () => window.clearTimeout(timeout)
  }, [onSearch, query])

  return (
    <Input
      id="transaction-search"
      type="search"
      placeholder="Hash, wallet address, or asset"
      value={query}
      onChange={(event) => setQuery(event.target.value)}
    />
  )
}

function statusVariant(status: PaymentStatus) {
  if (status === 'confirmed') return 'default' as const
  if (status === 'failed') return 'destructive' as const
  return 'secondary' as const
}

export default function TransactionsPage() {
  const { token } = useAuthenticatedSession()
  const [payments, setPayments] = useState<Payment[] | null>(null)
  const [refunds, setRefunds] = useState<Refund[]>([])
  const [refundingId, setRefundingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refundNotice, setRefundNotice] = useState<string | null>(null)
  const [refundDialogOpen, setRefundDialogOpen] = useState(false)
  const [refundTarget, setRefundTarget] = useState<Payment | null>(null)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundRecipient, setRefundRecipient] = useState('')
  const [refundReason, setRefundReason] = useState('')
  const [refundFormError, setRefundFormError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | 'all'>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setError(null)
      try {
        const [nextPayments, nextRefunds] = await Promise.all([
          api.listTransactions(token, PAGE_SIZE, signal),
          api.listRefunds(token, 20, signal),
        ])
        setPayments(nextPayments)
        setHasMore(nextPayments.length === PAGE_SIZE)
        setRefunds(nextRefunds)
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        if (cause instanceof ApiError && cause.status === 0) {
          setError('backend-down')
          return
        }
        setError(cause instanceof Error ? cause.message : 'Could not load your payments')
      }
    },
    [token]
  )

  const loadMore = useCallback(async () => {
    if (!payments || payments.length === 0) return
    setLoadingMore(true)
    setLoadMoreError(null)
    try {
      const cursor = payments[payments.length - 1].id
      const nextPayments = await api.listTransactions(token, PAGE_SIZE, undefined, cursor)
      setPayments((current) => {
        const existing = current ?? []
        const seen = new Set(existing.map((payment) => payment.id))
        const merged = [...existing]
        for (const payment of nextPayments) {
          if (!seen.has(payment.id)) {
            seen.add(payment.id)
            merged.push(payment)
          }
        }
        return merged
      })
      setHasMore(nextPayments.length === PAGE_SIZE)
    } catch (cause) {
      setLoadMoreError(
        cause instanceof Error ? cause.message : 'Could not load older payments'
      )
    } finally {
      setLoadingMore(false)
    }
  }, [payments, token])

  const openRefundDialog = useCallback((payment: Payment) => {
    setRefundTarget(payment)
    setRefundAmount('')
    setRefundRecipient(payment.wallet_address)
    setRefundReason('')
    setRefundFormError(null)
    setRefundDialogOpen(true)
  }, [])

  const handleRefund = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      if (!refundTarget) return

      const cleanedAmount = refundAmount.trim()
      const cleanedRecipient = refundRecipient.trim()
      const cleanedReason = refundReason.trim()
      const amountStroops = parseAmountToStroops(cleanedAmount)

      if (!cleanedAmount || !amountStroops) {
        setRefundFormError('Enter a valid refund amount.')
        return
      }

      if (amountStroops <= 0n) {
        setRefundFormError('Refund amount must be greater than zero.')
        return
      }

      if (amountStroops > refundTarget.amount_stroops) {
        setRefundFormError('Refund amount cannot exceed the original payment amount.')
        return
      }

      if (!cleanedRecipient) {
        setRefundFormError('Recipient address is required.')
        return
      }

      setRefundingId(refundTarget.id)
      setRefundFormError(null)
      try {
        const refund = await api.createRefund(
          token,
          refundTarget.id,
          amountStroops,
          cleanedRecipient,
          cleanedReason || undefined
        )
        setRefundNotice(
          `Refund requested successfully for ${formatStroops(refund.amount_stroops)} ${refund.asset}.`
        )
        setRefundDialogOpen(false)
        setRefundTarget(null)
        setRefundAmount('')
        setRefundRecipient('')
        setRefundReason('')
        setRefunds((current) => [refund, ...current])
        await load()
      } catch (cause) {
        setRefundFormError(
          cause instanceof Error ? cause.message : 'Could not create the refund request'
        )
      } finally {
        setRefundingId(null)
      }
    },
    [load, refundAmount, refundRecipient, refundReason, refundTarget, token]
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const filteredPayments = useMemo(() => {
    if (!payments) return []
    const searched = searchPayments(payments, searchQuery)
    const statusFiltered = filterPaymentsByStatus(searched, statusFilter)
    return filterPaymentsByDateRange(statusFiltered, fromDate, toDate)
  }, [payments, searchQuery, statusFilter, fromDate, toDate])

  const exportCsv = () => {
    const csv = toCsv(
      ['Date', 'Amount', 'Asset', 'Status', 'Transaction hash', 'From wallet'],
      filteredPayments.map((payment) => [
        payment.created_at,
        formatStroops(payment.amount_stroops).replace(/,/g, ''),
        payment.asset,
        STATUS_LABEL[payment.status] ?? payment.status,
        payment.tx_hash,
        payment.wallet_address,
      ])
    )
    downloadCsv(`aframp-payments-${new Date().toISOString().slice(0, 10)}.csv`, csv)
  }

  if (error)
    return (
      <ErrorState
        message={
          error === 'backend-down'
            ? "We can't connect to the payment server right now. Please try again in a moment."
            : error
        }
        onRetry={() => void load()}
      />
    )
  if (!payments) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div>
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
          {filteredPayments.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={exportCsv}>
              <Download className="size-4" aria-hidden />
              Export CSV
            </Button>
          )}
        </div>
        {refundNotice && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            {refundNotice}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="transaction-search">Search</Label>
            <DebouncedSearchInput onSearch={setSearchQuery} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="transaction-status">Status</Label>
            <select
              id="transaction-status"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as PaymentStatus | 'all')
              }
            >
              <option value="all">All statuses</option>
              {FILTERABLE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="transaction-from">From</Label>
              <Input
                id="transaction-from"
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transaction-to">To</Label>
              <Input
                id="transaction-to"
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
              />
            </div>
          </div>
        </div>
      </header>

      <div className="mt-6">
        {filteredPayments.length === 0 ? (
          <EmptyStateIllustration
            title="No payments found"
            description="Payments will appear here once you receive your first transfer."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Transaction</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((payment) => (
                  <tr key={payment.id} className="border-t">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDateTime(payment.created_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatStroops(payment.amount_stroops)} {payment.asset}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(payment.status)}>
                        {STATUS_LABEL[payment.status] ?? payment.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        className="text-primary underline-offset-4 hover:underline"
                        href={`${EXPLORER_BASE}/${payment.tx_hash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {payment.tx_hash.slice(0, 8)}…
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={refundingId === payment.id}
                        onClick={() => openRefundDialog(payment)}
                      >
                        Refund
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {hasMore && (
          <div className="mt-4 flex flex-col items-center gap-2">
            {loadMoreError && (
              <p className="text-sm text-destructive">{loadMoreError}</p>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
      </div>

      <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request a refund</DialogTitle>
            <DialogDescription>
              Refund a payment back to the original wallet.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleRefund}>
            <div className="space-y-1.5">
              <Label htmlFor="refund-amount">Amount</Label>
              <Input
                id="refund-amount"
                inputMode="decimal"
                value={refundAmount}
                onChange={(event) => setRefundAmount(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="refund-recipient">Recipient</Label>
              <Input
                id="refund-recipient"
                value={refundRecipient}
                onChange={(event) => setRefundRecipient(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="refund-reason">Reason (optional)</Label>
              <Textarea
                id="refund-reason"
                value={refundReason}
                onChange={(event) => setRefundReason(event.target.value)}
              />
            </div>
            {refundFormError && (
              <p className="text-sm text-destructive">{refundFormError}</p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={refundingId !== null}>
                {refundingId ? 'Submitting…' : 'Request refund'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
