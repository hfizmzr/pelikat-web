'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
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
  const headers = ['Transaction ID', 'Tenant', 'Description', 'Plan/Type', 'Amount', 'Date', 'Status']
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
      icon: 'payments',
      color: 'text-[#d0bcff]',
      bg: 'bg-[#d0bcff]/20',
      sub: 'All-time race registration volume',
    },
    {
      label: 'Monthly Recurring (MRR)',
      value: summary?.mrr || 'RM 0',
      unit: '',
      icon: 'subscriptions',
      color: 'text-[#4cd7f6]',
      bg: 'bg-[#4cd7f6]/20',
      sub: `${summary?.activeSubscriptions ?? 0} active tenant accounts`,
    },
    {
      label: 'Escrow Reserve Held',
      value: summary?.escrowHeld || 'RM 0.00',
      unit: '',
      icon: 'savings',
      color: 'text-[#4edea3]',
      bg: 'bg-[#4edea3]/20',
      sub: 'Pending race payout releases',
    },
    {
      label: 'Pending Invoiced',
      value: String(summary?.pendingCount ?? 0),
      unit: 'Orders',
      icon: 'pending_actions',
      color: 'text-[#ffb4ab]',
      bg: 'bg-[#ffb4ab]/20',
      sub: `${summary?.overdueCount ?? 0} tenant accounts inactive`,
    },
  ]

  return (
    <div className="flex flex-col gap-8 font-inter text-[#e5e1e4]">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-[#d0bcff]">account_balance_wallet</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#d0bcff]">Finance & Escrow</span>
          </div>
          <h1 className="font-jakarta font-bold text-[28px] text-[#e5e1e4] tracking-tight">Billing & Platform Revenue</h1>
          <p className="text-[13px] text-[#958ea0]">Tenant SaaS subscriptions, escrow balances, and participant checkout transaction reconciliation</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchBilling(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2a2a2c] text-[#e5e1e4] text-[13px] font-medium hover:bg-[#353437] hover:text-[#d0bcff] transition-all border border-[#494454]/30"
          >
            <span className={`material-symbols-outlined text-[16px] ${refreshing ? 'animate-spin' : ''}`}>
              refresh
            </span>
            <span>Refresh</span>
          </button>
          <button
            onClick={() => {
              exportBillingToCSV(invoices)
              toast.success('Billing ledger exported')
            }}
            disabled={invoices.length === 0}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#a078ff] text-[#340080] text-[13px] font-semibold hover:bg-[#d0bcff] transition-all shadow-[0_0_20px_rgba(160,120,255,0.35)]"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            <span>Export Ledger</span>
          </button>
        </div>
      </div>

      {/* ── Metric Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-5">
        {metricCards.map((m, i) => (
          <div key={i} className="rounded-xl bg-[#1c1b1d] border border-[#494454]/30 p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#958ea0]">{m.label}</span>
              <div className={`p-1.5 rounded-lg ${m.bg} ${m.color}`}>
                <span className="material-symbols-outlined text-[18px]">{m.icon}</span>
              </div>
            </div>
            <span className="text-[32px] font-bold leading-none text-[#e5e1e4] font-tabular">{m.value}</span>
            <p className="text-[11px] text-[#958ea0]">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Transaction Ledger Table ─────────────────────────────────────── */}
      <div className="rounded-xl bg-[#1c1b1d] border border-[#494454]/30 overflow-hidden shadow-lg">
        <div className="p-5 border-b border-[#494454]/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#4cd7f6] text-[20px]">receipt_long</span>
            <h2 className="font-jakarta font-semibold text-[18px] text-[#e5e1e4]">Revenue & Settlement Ledger</h2>
          </div>
          <span className="text-[11px] text-[#958ea0] font-mono">
            {invoices.length} transactions recorded
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#494454]/30">
                {['Tenant / Account', 'Description', 'Tier / Type', 'Settlement Amount', 'Date', 'Status'].map((h) => (
                  <th key={h} className="py-3 px-5 text-[10px] font-bold uppercase tracking-wider text-[#958ea0]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#353437]/30 text-[13px]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-[#958ea0]">
                    <Loader2 className="h-7 w-7 animate-spin mx-auto text-[#d0bcff] mb-2" />
                    <span>Aggregating financial ledger...</span>
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-[#958ea0]">
                    No settlement records found
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-[#201f22]/50 transition-colors">
                    {/* Tenant */}
                    <td className="py-3.5 px-5 font-semibold text-[#e5e1e4] font-jakarta">
                      {inv.tenant}
                    </td>

                    {/* Description */}
                    <td className="py-3.5 px-5 text-[#cbc3d7]">
                      {inv.description}
                    </td>

                    {/* Plan */}
                    <td className="py-3.5 px-5">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#d0bcff]/10 text-[#d0bcff] border border-[#d0bcff]/20">
                        {inv.plan}
                      </span>
                    </td>

                    {/* Amount */}
                    <td className="py-3.5 px-5 font-mono font-bold text-[#e5e1e4]">
                      {inv.amount}
                    </td>

                    {/* Date */}
                    <td className="py-3.5 px-5 font-mono text-[12px] text-[#958ea0]">
                      {inv.date}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-5">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                        inv.status === 'paid'
                          ? 'text-[#4edea3] bg-[#4edea3]/10 border-[#4edea3]/20'
                          : inv.status === 'overdue'
                            ? 'text-[#ffb4ab] bg-[#ffb4ab]/10 border-[#ffb4ab]/20'
                            : 'text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/20'
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
