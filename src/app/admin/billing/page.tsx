'use client'

import { useState, useEffect, useCallback } from 'react'
import { Banknote, ClipboardList, CreditCard, Download, Loader2, PiggyBank, ReceiptText, RefreshCw, Wallet } from "lucide-react"
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
      label: 'Gross Platform Volume',
      value: summary?.grossVolume || 'RM 0.00',
      unit: '',
      icon: Banknote,
      color: 'text-primary',
      bg: 'bg-primary/20',
      sub: 'All-time race registration volume',
    },
    {
      label: 'Monthly Recurring (MRR)',
      value: summary?.mrr || 'RM 0',
      unit: '',
      icon: CreditCard,
      color: 'text-primary',
      bg: 'bg-primary/20',
      sub: `${summary?.activeSubscriptions ?? 0} active tenant accounts`,
    },
    {
      label: 'Escrow Reserve Held',
      value: summary?.escrowHeld || 'RM 0.00',
      unit: '',
      icon: PiggyBank,
      color: 'text-success',
      bg: 'bg-success/20',
      sub: 'Pending race payout releases',
    },
    {
      label: 'Pending Invoiced',
      value: String(summary?.pendingCount ?? 0),
      unit: 'Orders',
      icon: ClipboardList,
      color: 'text-red-500 dark:text-red-300',
      bg: 'bg-red-500/10 dark:bg-red-300/20',
      sub: `${summary?.overdueCount ?? 0} tenant accounts inactive`,
    },
  ]

  return (
    <div className="flex flex-col gap-8 font-inter text-foreground">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Wallet className="size-[16px] text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Finance & Escrow</span>
          </div>
          <h1 className="font-jakarta font-bold text-[28px] text-foreground tracking-tight">Billing & Platform Revenue</h1>
          <p className="text-[13px] text-muted-foreground">Organizer subscriptions, escrow balances, and participant checkout transaction reconciliation</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchBilling(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-foreground text-[13px] font-medium hover:bg-accent hover:text-primary transition-all border border-border/30"
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
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary transition-all "
          >
            <Download className="size-[18px]" />
            <span>Export Ledger</span>
          </button>
        </div>
      </div>

      {/* ── Metric Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-5">
        {metricCards.map((m, i) => (
          <div key={i} className="rounded-xl bg-card border border-border/30 p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{m.label}</span>
              <div className={`p-1.5 rounded-lg ${m.bg} ${m.color}`}>
                <m.icon className="size-[18px]" />
              </div>
            </div>
            <span className="text-[32px] font-bold leading-none text-foreground font-tabular">{m.value}</span>
            <p className="text-[11px] text-muted-foreground">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Transaction Ledger Table ─────────────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border/30 overflow-hidden shadow-lg">
        <div className="p-5 border-b border-border/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ReceiptText className="text-primary size-[20px]" />
            <h2 className="font-jakarta font-semibold text-[18px] text-foreground">Revenue & Settlement Ledger</h2>
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">
            {invoices.length} transactions recorded
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/30">
                {['Tenant / Account', 'Description', 'Type', 'Settlement Amount', 'Date', 'Status'].map((h) => (
                  <th key={h} className="py-3 px-5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{h}</th>
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
                    <td className="py-3.5 px-5 font-semibold text-foreground font-jakarta">
                      {inv.tenant}
                    </td>

                    {/* Description */}
                    <td className="py-3.5 px-5 text-muted-foreground">
                      {inv.description}
                    </td>

                    {/* Plan */}
                    <td className="py-3.5 px-5">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
                        {inv.plan}
                      </span>
                    </td>

                    {/* Amount */}
                    <td className="py-3.5 px-5 font-mono font-bold text-foreground">
                      {inv.amount}
                    </td>

                    {/* Date */}
                    <td className="py-3.5 px-5 font-mono text-[12px] text-muted-foreground">
                      {inv.date}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-5">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                        inv.status === 'paid'
                          ? 'text-success bg-success/10 border-success/20'
                          : inv.status === 'overdue'
                            ? 'text-red-500 dark:text-red-300 bg-red-500/10 dark:bg-red-300/10 border-red-500/30 dark:border-red-300/20'
                            : 'text-amber-500 bg-amber-500/10 border-amber-500/20'
                      }`}>
                        {inv.status.toUpperCase()}
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
