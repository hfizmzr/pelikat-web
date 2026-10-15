'use client'

import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Banknote, Clock, Download, Loader2, Pencil, ReceiptText, RefreshCw, Search, SearchX, Tag, UserPlus, Users, X } from "lucide-react"
import { toast } from 'sonner'

interface Registration {
  id: string
  bib_number: string
  payment_status: 'paid' | 'pending' | 'refunded'
  checked_in: boolean
  checked_in_at: string | null
  created_at: string
  events: { id: string; name: string } | null
  race_categories: { id: string; name: string; price: number } | null
  runner_profiles: { id: string; full_name: string; phone: string; gender: string; t_shirt_size: string } | null
  organizers: { id: string; name: string; slug: string } | null
}

interface EventItem {
  id: string
  name: string
}

interface Metrics {
  total: number
  paid: number
  checkedIn: number
  pending: number
}

// ─── CSV Export Helper ────────────────────────────────────────────────────────
function exportRegistrationsToCSV(regs: Registration[]) {
  const headers = ['BIB Number', 'Runner Name', 'Event', 'Category', 'Price (RM)', 'Payment Status', 'Checked In', 'Check-In Date', 'Registration Date']
  const rows = regs.map((r) => [
    r.bib_number || '',
    r.runner_profiles?.full_name || 'Anonymous',
    r.events?.name || '',
    r.race_categories?.name || '',
    r.race_categories?.price ?? 0,
    r.payment_status,
    r.checked_in ? 'YES' : 'NO',
    r.checked_in_at ? new Date(r.checked_in_at).toISOString() : '',
    new Date(r.created_at).toISOString(),
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`))

  const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `registrations-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function AdminRegistrationsPage() {
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  // Edit BIB Modal state
  const [editBibOpen, setEditBibOpen] = useState(false)
  const [selectedReg, setSelectedReg] = useState<Registration | null>(null)
  const [newBib, setNewBib] = useState('')
  const [savingBib, setSavingBib] = useState(false)

  // Filters & Pagination
  const [search, setSearch] = useState('')
  const [selectedEvent, setSelectedEvent] = useState('all')
  const [selectedPayment, setSelectedPayment] = useState('all')
  const [selectedCheckIn, setSelectedCheckIn] = useState('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [metrics, setMetrics] = useState<Metrics>({ total: 0, paid: 0, checkedIn: 0, pending: 0 })

  const fetchRegistrations = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      if (selectedEvent !== 'all') params.set('event_id', selectedEvent)
      if (selectedPayment !== 'all') params.set('payment_status', selectedPayment)
      if (selectedCheckIn !== 'all') params.set('checked_in', selectedCheckIn)
      params.set('page', String(page))
      params.set('limit', '20')

      const res = await fetch(`/api/admin/registrations?${params.toString()}`)
      const json = await res.json()
      if (json.success) {
        setRegistrations(json.data)
        setTotalPages(json.pagination.totalPages || 1)
        setTotalCount(json.pagination.totalCount || 0)
        setMetrics(json.metrics)
        if (json.events) setEvents(json.events)
      } else {
        toast.error(json.error || 'Failed to fetch registrations')
      }
    } catch {
      toast.error('Network error loading registrations')
    } finally {
      setLoading(false)
    }
  }, [search, selectedEvent, selectedPayment, selectedCheckIn, page])

  useEffect(() => {
    fetchRegistrations()
  }, [fetchRegistrations])

  // Quick Check-in toggle mutation
  const handleToggleCheckIn = async (reg: Registration) => {
    setUpdatingId(reg.id)
    try {
      const newStatus = !reg.checked_in
      const res = await fetch('/api/admin/registrations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: reg.id,
          checked_in: newStatus,
        }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success(newStatus ? `BIB #${reg.bib_number} checked in` : `BIB #${reg.bib_number} check-in reverted`)
        setRegistrations((prev) =>
          prev.map((r) => (r.id === reg.id ? { ...r, checked_in: newStatus, checked_in_at: newStatus ? new Date().toISOString() : null } : r))
        )
        setMetrics((prev) => ({
          ...prev,
          checkedIn: newStatus ? prev.checkedIn + 1 : prev.checkedIn - 1,
        }))
      } else {
        toast.error(json.error || 'Failed to update check-in status')
      }
    } catch {
      toast.error('Network error during check-in')
    } finally {
      setUpdatingId(null)
    }
  }

  // Edit BIB Number mutation
  const handleSaveBib = async () => {
    if (!selectedReg || !newBib.trim()) return
    setSavingBib(true)
    try {
      const res = await fetch('/api/admin/registrations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedReg.id,
          bib_number: newBib.trim(),
        }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success(`BIB updated to #${newBib.trim()}`)
        setRegistrations((prev) =>
          prev.map((r) => (r.id === selectedReg.id ? { ...r, bib_number: newBib.trim() } : r))
        )
        setEditBibOpen(false)
      } else {
        toast.error(json.error || 'Failed to update BIB number')
      }
    } catch {
      toast.error('Network error updating BIB')
    } finally {
      setSavingBib(false)
    }
  }

  const handleExportCSV = async () => {
    setExporting(true)
    try {
      exportRegistrationsToCSV(registrations)
      toast.success('Registration ledger exported')
    } finally {
      setExporting(false)
    }
  }

  const checkInRate = metrics.total > 0 ? Math.round((metrics.checkedIn / metrics.total) * 100) : 0

  const metricCards = [
    { label: 'Total Registrations', value: metrics.total.toLocaleString(), icon: Users, color: 'text-primary', bg: 'bg-primary/20' },
    { label: 'Paid Athletes', value: metrics.paid.toLocaleString(), icon: Banknote, color: 'text-success', bg: 'bg-success/20' },
    { label: 'Checked In', value: `${metrics.checkedIn.toLocaleString()} (${checkInRate}%)`, icon: UserPlus, color: 'text-primary', bg: 'bg-primary/20' },
    { label: 'Pending Payment', value: metrics.pending.toLocaleString(), icon: Clock, color: 'text-red-500 dark:text-red-300', bg: 'bg-red-500/10 dark:bg-red-300/20' },
  ]

  return (
    <div className="flex flex-col gap-8 font-inter text-foreground">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Users className="size-[16px] text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Global Fleet</span>
          </div>
          <h1 className="font-jakarta font-bold text-[28px] text-foreground tracking-tight">Participant & BIB Management</h1>
          <p className="text-[13px] text-muted-foreground">Cross-tenant registration ledger, race bib assignments, and real-time check-in controls</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchRegistrations}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-foreground text-[13px] font-medium hover:bg-accent hover:text-primary transition-all border border-border/30"
          >
            <RefreshCw className={`size-[16px] ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleExportCSV}
            disabled={exporting || registrations.length === 0}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary transition-all "
          >
            <Download className="size-[18px]" />
            <span>Export CSV</span>
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
          </div>
        ))}
      </div>

      {/* ── Filter Bar ───────────────────────────────────────────────────── */}
      <div className="bg-card rounded-xl p-4 border border-border/30 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 text-muted-foreground size-[18px] pointer-events-none" />
          <Input
            placeholder="Search BIB number or athlete..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="pl-9 bg-card border-border/30 text-foreground placeholder:text-muted-foreground h-9 text-[13px] focus-visible:ring-1 focus-visible:ring-primary"
          />
        </div>

        {/* Event Filter */}
        <Select
          value={selectedEvent}
          onValueChange={(val) => {
            setSelectedEvent(val)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[180px] bg-card border-border/30 text-foreground h-9 text-[13px]">
            <SelectValue placeholder="All Events" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border text-foreground">
            <SelectItem value="all">All Events</SelectItem>
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Payment Filter */}
        <Select
          value={selectedPayment}
          onValueChange={(val) => {
            setSelectedPayment(val)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[140px] bg-card border-border/30 text-foreground h-9 text-[13px]">
            <SelectValue placeholder="Payment" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border text-foreground">
            <SelectItem value="all">All Payments</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>

        {/* Check-In Filter */}
        <Select
          value={selectedCheckIn}
          onValueChange={(val) => {
            setSelectedCheckIn(val)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[140px] bg-card border-border/30 text-foreground h-9 text-[13px]">
            <SelectValue placeholder="Check-In" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border text-foreground">
            <SelectItem value="all">All Check-Ins</SelectItem>
            <SelectItem value="true">Checked In</SelectItem>
            <SelectItem value="false">Not Checked In</SelectItem>
          </SelectContent>
        </Select>

        {/* Reset */}
        {(search || selectedEvent !== 'all' || selectedPayment !== 'all' || selectedCheckIn !== 'all') && (
          <button
            onClick={() => {
              setSearch('')
              setSelectedEvent('all')
              setSelectedPayment('all')
              setSelectedCheckIn('all')
              setPage(1)
            }}
            className="flex items-center gap-1 text-[12px] text-red-500 dark:text-red-300 hover:underline px-2"
          >
            <X className="size-[14px]" />
            Clear
          </button>
        )}
      </div>

      {/* ── Registrations Table ──────────────────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border/30 overflow-hidden shadow-lg">
        <div className="p-5 border-b border-border/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ReceiptText className="text-primary size-[20px]" />
            <h2 className="font-jakarta font-semibold text-[18px] text-foreground">Live Registrations Ledger</h2>
          </div>
          <span className="text-[12px] text-muted-foreground font-mono">
            Showing {registrations.length} of {totalCount} total
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/30">
                {['BIB', 'Athlete', 'Event & Category', 'Payment', 'Check-In Status', 'Date', 'Actions'].map((h) => (
                  <th key={h} className="py-3 px-5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-accent/30 text-[13px]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-muted-foreground">
                    <Loader2 className="h-7 w-7 animate-spin mx-auto text-primary mb-2" />
                    <span>Loading participant records...</span>
                  </td>
                </tr>
              ) : registrations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-muted-foreground">
                    <SearchX className="size-[36px] text-border block mb-2" />
                    No registrations matching the active criteria
                  </td>
                </tr>
              ) : (
                registrations.map((reg) => (
                  <tr key={reg.id} className="hover:bg-card/50 transition-colors">
                    {/* BIB */}
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                          #{reg.bib_number || 'UNASSIGNED'}
                        </span>
                        <button
                          onClick={() => {
                            setSelectedReg(reg)
                            setNewBib(reg.bib_number || '')
                            setEditBibOpen(true)
                          }}
                          title="Reassign BIB"
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                          <Pencil className="size-[14px]" />
                        </button>
                      </div>
                    </td>

                    {/* Athlete */}
                    <td className="py-3.5 px-5">
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground font-jakarta">
                          {reg.runner_profiles?.full_name || 'Anonymous Runner'}
                        </span>
                        {reg.runner_profiles?.phone && (
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {reg.runner_profiles.phone} · Size {reg.runner_profiles.t_shirt_size || 'M'}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Event & Category */}
                    <td className="py-3.5 px-5">
                      <div className="flex flex-col">
                        <span className="text-foreground font-medium">{reg.events?.name || '—'}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {reg.race_categories?.name || 'General'} · RM {(reg.race_categories?.price ?? 0).toFixed(2)}
                        </span>
                      </div>
                    </td>

                    {/* Payment */}
                    <td className="py-3.5 px-5">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                        reg.payment_status === 'paid'
                          ? 'text-success bg-success/10 border-success/20'
                          : reg.payment_status === 'refunded'
                            ? 'text-red-500 dark:text-red-300 bg-red-500/10 dark:bg-red-300/10 border-red-500/30 dark:border-red-300/20'
                            : 'text-amber-500 bg-amber-500/10 border-amber-500/20'
                      }`}>
                        {reg.payment_status.toUpperCase()}
                      </span>
                    </td>

                    {/* Check-In */}
                    <td className="py-3.5 px-5">
                      <button
                        onClick={() => handleToggleCheckIn(reg)}
                        disabled={updatingId === reg.id}
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border inline-flex items-center gap-1.5 transition-all ${
                          reg.checked_in
                            ? 'text-primary bg-primary/10 border-primary/20 hover:bg-primary/20'
                            : 'text-muted-foreground bg-muted-foreground/10 border-muted-foreground/20 hover:text-foreground hover:bg-accent'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${reg.checked_in ? 'bg-primary' : 'bg-muted-foreground'}`} />
                        {updatingId === reg.id ? (
                          <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        ) : reg.checked_in ? (
                          'Checked In'
                        ) : (
                          'Pending Check-In'
                        )}
                      </button>
                    </td>

                    {/* Date */}
                    <td className="py-3.5 px-5 text-muted-foreground font-mono text-[12px]">
                      {new Date(reg.created_at).toLocaleDateString()}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleCheckIn(reg)}
                          disabled={updatingId === reg.id}
                          className="px-2 py-1 rounded bg-card text-muted-foreground hover:text-white hover:bg-accent text-[11px] font-medium border border-border/30"
                        >
                          {reg.checked_in ? 'Undo' : 'Check-In'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-border/30 flex items-center justify-between text-[12px] text-muted-foreground">
            <span>Page {page} of {totalPages}</span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 rounded bg-card text-foreground disabled:opacity-40 hover:bg-accent border border-border/30"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1 rounded bg-card text-foreground disabled:opacity-40 hover:bg-accent border border-border/30"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Edit BIB Dialog ──────────────────────────────────────────────── */}
      <Dialog open={editBibOpen} onOpenChange={setEditBibOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle className="font-jakarta text-[18px] text-foreground flex items-center gap-2">
              <Tag className="text-primary" />
              Reassign Race BIB
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-[13px]">
              Update the assigned BIB number for athlete {selectedReg?.runner_profiles?.full_name || 'Anonymous'}.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-3">
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-muted-foreground">New BIB Number</label>
              <Input
                value={newBib}
                onChange={(e) => setNewBib(e.target.value)}
                placeholder="e.g. 1042"
                className="bg-card border-border text-foreground font-mono text-[16px] tracking-wider focus-visible:ring-primary"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <button
              onClick={() => setEditBibOpen(false)}
              className="px-4 py-2 rounded-lg bg-accent text-foreground text-[13px] font-medium hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveBib}
              disabled={savingBib || !newBib.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-[13px] font-bold hover:bg-primary transition-all flex items-center gap-1.5"
            >
              {savingBib && <Loader2 className="h-4 w-4 animate-spin" />}
              Save BIB
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
