'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'

type Category = { id: string; name: string }

type GuestRow = { name: string; email: string; phone: string; category: string; role: string }

type RpcResult = {
  added: { bib_number: string | null; name: string }[]
  skipped: { name: string; email: string; reason: string }[]
}

/** Minimal RFC4180-ish CSV parser (supports quoted fields with commas). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

const ROLES = ['pacer', 'vip', 'runner'] as const

export function ComplimentaryGuestsClient({
  eventId,
  categories,
}: {
  eventId: string
  categories: Category[]
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id ?? '')
  const [role, setRole] = useState<string>('pacer')
  const [singleName, setSingleName] = useState('')
  const [singleEmail, setSingleEmail] = useState('')
  const [singlePhone, setSinglePhone] = useState('')
  const [importedRows, setImportedRows] = useState<GuestRow[] | null>(null)
  const [fileParseError, setFileParseError] = useState<string | null>(null)
  const [results, setResults] = useState<RpcResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const selectedCategory = categories.find(c => c.id === categoryId)

  async function submitAll(guests: { name: string; email: string; phone: string }[]) {
    setBusy(true)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc(
      'organizer_add_complimentary_registrations',
      {
        p_event_id: eventId,
        p_category_id: categoryId,
        p_role: role,
        p_guests: guests,
      }
    )
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setResults(data as RpcResult)
    setSingleName('')
    setSingleEmail('')
    setSinglePhone('')
    setImportedRows(null)
    if (fileRef.current) fileRef.current.value = ''
    router.refresh()
  }

  function handleSingleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!singleName.trim()) {
      setError('Name is required')
      return
    }
    submitAll([{ name: singleName.trim(), email: singleEmail.trim(), phone: singlePhone.trim() }])
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setFileParseError(null)
    const file = e.target.files?.[0]
    if (!file) return
    file.text().then((text) => {
      const rows = parseCsv(text)
      if (rows.length < 2) {
        setFileParseError('CSV must have a header row and at least one guest')
        return
      }
      const header = rows[0].map(h => h.trim().toLowerCase())
      const idx = (k: string) => header.indexOf(k)
      const iName = idx('name')
      const iEmail = idx('email')
      const iPhone = idx('phone')
      const iCategory = idx('category')
      const iRole = idx('role')
      if (iName === -1) {
        setFileParseError('CSV header must include a "name" column')
        return
      }
      const guests: GuestRow[] = rows.slice(1).map(r => ({
        name: (r[iName] ?? '').trim(),
        email: iEmail >= 0 ? (r[iEmail] ?? '').trim() : '',
        phone: iPhone >= 0 ? (r[iPhone] ?? '').trim() : '',
        category: iCategory >= 0 ? (r[iCategory] ?? '').trim() : '',
        role: iRole >= 0 ? (r[iRole] ?? '').trim().toLowerCase() : '',
      })).filter(g => g.name || g.email)
      if (!guests.length) {
        setFileParseError('No guest rows found in CSV')
        return
      }
      setImportedRows(guests)
    })
  }

  /** Honor per-row category/role columns by batching into separate RPC calls. */
  async function importRows() {
    if (!importedRows) return
    setBusy(true)
    setError(null)
    // Batch rows by (category, role) — per-row CSV "category"/"role" columns
    // are honored by issuing one RPC per batch, defaulting to the form's
    // selected category/role when the column is empty or unrecognized.
    const grouped = new Map<string, GuestRow[]>()
    const allSkippedRows: { name: string; email: string; reason: string }[] = []
    // Rows whose batch RPC failed — kept for retry (resubmitting only
    // the failed batches avoids the already-added "Already in this
    // event" false positives from successful batches).
    const failedBatchGuests: GuestRow[] = []
    for (const g of importedRows) {
      const catName = g.category.toLowerCase()
      const match = catName
        ? categories.find(c => c.name.toLowerCase() === catName)
        : selectedCategory
      if (catName && !match) {
        allSkippedRows.push({ name: g.name, email: g.email, reason: 'Unknown category' })
        continue
      }
      const r = ROLES.includes(g.role as typeof ROLES[number]) ? g.role : role
      const key = `${match?.id ?? categoryId}::${r}`
      grouped.set(key, [...(grouped.get(key) ?? []), g])
    }
    const allResults: RpcResult = { added: [], skipped: [] }
    let lastError = ''
    for (const [key, guestsInGroup] of grouped) {
      const [catGroup, r] = key.split('::')
      const { data, error: rpcError } = await supabase.rpc(
        'organizer_add_complimentary_registrations',
        {
          p_event_id: eventId,
          p_category_id: catGroup,
          p_role: r,
          p_guests: guestsInGroup.map(({ name, email, phone }) => ({ name, email, phone })),
        }
      )
      if (rpcError) {
        lastError = rpcError.message
        failedBatchGuests.push(...guestsInGroup)
        continue
      }
      const res = data as RpcResult
      allResults.added.push(...(res.added ?? []))
      allResults.skipped.push(...(res.skipped ?? []))
    }
    for (const g of allSkippedRows) {
      allResults.skipped.push({ name: g.name, email: g.email, reason: `Unknown category` })
    }
    setBusy(false)
    // Partial successes must surface: set results regardless of batch errors.
    setResults(allResults)
    if (lastError) {
      setError(lastError)
      // Keep only the rows whose batches failed, so retrying doesn't
      // resubmit already-added successful rows.
      setImportedRows(failedBatchGuests)
      router.refresh()
      return
    }
    setImportedRows(null)
    if (fileRef.current) fileRef.current.value = ''
    router.refresh()
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle>Add Complimentary Guests</CardTitle>
        <CardDescription>
          Register pacers, VIPs or invited guests who bypass payment.
          Payment status is set to <strong>waived</strong> and a BIB is allocated immediately.
          Guests claim their E-Bib automatically when they sign up with the same email.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="guest-role">Role</Label>
            <select
              id="guest-role"
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {ROLES.map(r => (
                <option key={r} value={r} className="capitalize">{r}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="guest-category">Category</Label>
            <select
              id="guest-category"
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <form onSubmit={handleSingleSubmit} className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <div className="grid gap-2">
            <Label htmlFor="guest-name">Name</Label>
            <Input id="guest-name" value={singleName} onChange={e => setSingleName(e.target.value)} placeholder="Full name" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="guest-email">Email</Label>
            <Input id="guest-email" type="email" value={singleEmail} onChange={e => setSingleEmail(e.target.value)} placeholder="name@example.com" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="guest-phone">Phone</Label>
            <Input id="guest-phone" value={singlePhone} onChange={e => setSinglePhone(e.target.value)} placeholder="Phone (optional)" />
          </div>
          <Button type="submit" disabled={busy || !categoryId || !selectedCategory}>
            Add Guest
          </Button>
        </form>

        <div className="grid gap-2">
          <Label htmlFor="guest-bulk">Bulk import (CSV: name, email, phone, category, role)</Label>
          <Input
            id="guest-bulk"
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
          />
        </div>

        {fileParseError && (
          <p className="text-sm text-red-500">{fileParseError}</p>
        )}

        {importedRows && (
          <div className="rounded-md border border-border">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <span className="text-sm font-medium">{importedRows.length} guests ready to import</span>
              <Button size="sm" onClick={importRows} disabled={busy}>
                {busy ? 'Importing…' : 'Import'}
              </Button>
            </div>
            <div className="max-h-48 overflow-y-auto">
              <table className="w-full text-sm">
                <tbody>
                  {importedRows.map((g, i) => (
                    <tr key={i} className="border-t border-border/60">
                      <td className="px-4 py-1.5 font-medium">{g.name || <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-4 py-1.5 text-muted-foreground">{g.email || '—'}</td>
                      <td className="px-4 py-1.5 text-muted-foreground">{g.category || selectedCategory?.name}</td>
                      <td className="px-4 py-1.5 text-muted-foreground capitalize">{g.role || role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-500 dark:text-red-300">{error}</p>
        )}

        {results && (
          <div className="rounded-md border border-border p-4 text-sm">
            {results.added?.length > 0 && (
              <ul className="space-y-1">
                {results.added.map((r, i) => (
                  <li key={i} className="text-foreground">
                    <span className="font-medium">{r.name}</span>
                    {r.bib_number ? ` — BIB ${r.bib_number}` : ' — BIB TBA'}
                  </li>
                ))}
              </ul>
            )}
            {results.skipped?.length > 0 && (
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {results.skipped.map((r, i) => (
                  <li key={i}>
                    <span className="font-medium">{r.name || r.email}</span> — {r.reason}
                  </li>
                ))}
              </ul>
            )}
                        {results.added?.length > 0 && (
              <p className="mt-2 text-muted-foreground">Guests added as complimentary (waived) participants.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
