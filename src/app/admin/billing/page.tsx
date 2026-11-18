'use client'

import { statusLabel } from '@/components/ui/status-tag'
import { useState, useEffect, useCallback } from 'react'
import { Banknote, ClipboardList, CreditCard, Download, Loader2, ReceiptText, RefreshCw } from "lucide-react"
import { toast } from 'sonner'

interface BillingSummary {
  mrr: string
  activeSubscriptions: number
  totalTenants: number
  escrowHeld: string
  grossVolume: string
  pendingCount: number
  overdueCount: number
}

interface InvoiceTransaction {
  id: string
  tenant: string
  description: string
  plan: string
  amount: string
  rawAmount: number
  date: string
  status: string
}

function exportBillingToCSV(invoices: InvoiceTransaction[]) {
  const headers = ['Transaction ID', 'Tenant', 'Description', 'Type', 'Amount', 'Date', 'Status']
  const rows = invoices.map((inv) => [
    inv.id,
    inv.tenant,
    inv.description,
    inv.plan,
    inv.amount,
    inv.date,
    inv.status,
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`))

  const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `billing-ledger-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function AdminBillingPage() {
  const [summary, setSummary] = useState<BillingSummary | null>(null)
  const [invoices, setInvoices] = useState<InvoiceTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchBilling = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)
    try {
      const res = await fetch('/api/admin/billing')
      const json = await res.json()
      if (json.success) {
        setSummary(json.summary)
        setInvoices(json.invoices)
        if (isManual) toast.success('Billing data refreshed')
      } else {
        toast.error(json.error || 'Failed to fetch billing data')
      }
    } catch {
      toast.error('Network error loading billing data')
    } finally {
      setLoading(false)
      if (isManual) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchBilling()
  }, [fetchBilling])

  const metricCards = [
    {
      label: 'Gross platform volume',
      value: summary?.grossVolume || 'RM 0.00',
      unit: '',
      icon: Banknote,
      color: 'text-primary',
      bg: 'bg-primary/20',
      sub: 'All-time race registration volume',
    },
    {
      label: 'Monthly recurring revenue',
      value: summary?.mrr || 'RM 0',
      unit: '',
      icon: CreditCard,
      color: 'text-primary',
      bg: 'bg-primary/20',
      sub: `${summary?.activeSubscriptions ?? 0} active subscriptions`,
    },
    {
      label: 'Pending payments',
      value: String(summary?.pendingCount ?? 0),
      unit: 'Orders',
      icon: ClipboardList,
      color: 'text-destructive',
      bg: 'bg-destructive/10 dark:bg-destructive/20',
      sub: `${summary?.overdueCount ?? 0} inactive organizer accounts`,
    },
  ]

  return (
    <div className="flex flex-col gap-8 font-inter text-foreground">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[28px] leading-9 font-medium text-foreground">Billing</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">Organizer subscriptions and runner payments</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchBilling(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-foreground text-[13px] font-medium hover:bg-accent hover:text-primary transition-[color,background-color,border-color,opacity] border border-border/30"
          >
            <RefreshCw className={`size-[16px] ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => {
              exportBillingToCSV(invoices)
              toast.success('Billing ledger exported')
            }}
            disabled={invoices.length === 0}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-[13px] font-medium hover:opacity-90 transition-[color,background-color,border-color,opacity] "
          >
            <Download className="size-[18px]" />
            <span>Export ledger</span>
          </button>
        </div>
      </div>

      {/* ── Metric Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
        {metricCards.map((m, i) => (
          <div key={i} className="rounded-xl bg-card border border-border p-5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted-foreground">{m.label}</span>
            </div>
            <span className="text-[28px] font-medium leading-none text-foreground tabular-nums">{m.value}</span>
            <p className="text-[13px] text-muted-foreground">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Transaction Ledger Table ─────────────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border/30 overflow-hidden">
        <div className="p-5 border-b border-border/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ReceiptText className="text-primary size-[20px]" />
            <h2 className="font-jakarta font-medium text-[18px] text-foreground">Revenue & settlement ledger</h2>
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">
            {invoices.length} transactions recorded
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/30">
                {['Account', 'Description', 'Type', 'Amount', 'Date', 'Status'].map((h) => (
                  <th key={h} className="py-3 px-5 text-[11px] font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-accent/30 text-[13px]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-muted-foreground">
                    <Loader2 className="h-7 w-7 animate-spin mx-auto text-primary mb-2" />
                    <span>Aggregating financial ledger...</span>
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-muted-foreground">
                    No settlement records found
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-card/50 transition-colors">
                    {/* Tenant */}
                    <td className="py-3.5 px-5 font-medium text-foreground font-jakarta">
                      {inv.tenant}
                    </td>

                    {/* Description */}
                    <td className="py-3.5 px-5 text-muted-foreground">
                      {inv.description}
                    </td>

                    {/* Plan — audit #9: chip wrapped mid-phrase ("Organizer" /
                    "Subscription") to 2 cramped lines. inline-block + scale-
                    bounded truncate keeps one clean line with an ellipsis
                    affordance (max-w-40 = 10rem, no arbitrary px). */}
                    <td className="py-3.5 px-5">
                      <span className="inline-block max-w-40 truncate px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 text-primary border border-primary/20">
                        {inv.plan}
                      </span>
                    </td>

                    {/* Amount */}
                    <td className="py-3.5 px-5 font-mono font-medium text-foreground">
                      {inv.amount}
                    </td>

                    {/* Date */}
                    <td className="py-3.5 px-5 font-mono text-[12px] text-muted-foreground">
                      {inv.date}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-5">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                        inv.status === 'paid'
                          ? 'text-success bg-success/10 border-success/20'
                          : inv.status === 'overdue'
                            ? 'text-destructive bg-destructive/10 border-destructive/30 dark:border-destructive/20'
                            : 'text-warning bg-warning/10 border-warning/20'
                      }`}>
                        {statusLabel(inv.status)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
