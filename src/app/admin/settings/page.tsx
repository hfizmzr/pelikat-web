'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Camera, Construction, Footprints, Loader2, Save, Settings, Shield, ToggleRight, TriangleAlert, Wallet } from "lucide-react"
import { toast } from 'sonner'

interface PlatformSettings {
  platform_name: string
  support_email: string
  feature_virtual_run: boolean
  feature_photo_ai: boolean
  feature_repc_collection: boolean
  maintenance_mode: boolean
}

// Single-tier organizer subscription price (configurable, MYR decimal).
interface SubscriptionPrice {
  amount: number
  currency: string
  period: string
  duration_days: number
}

const PRICING_KEY = 'organizer_subscription_price'

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<PlatformSettings>({
    platform_name: 'Pelikat running platform',
    support_email: 'support@pelikat.com',
    feature_virtual_run: true,
    feature_photo_ai: true,
    feature_repc_collection: true,
    maintenance_mode: false,
  })
  const [subPrice, setSubPrice] = useState<SubscriptionPrice | null>(null)
  const [amountInput, setAmountInput] = useState('')
  const [savePricing, setSavePricing] = useState(false)
  const [pricingDirty, setPricingDirty] = useState(false)

  useEffect(() => {
    async function fetchSettings() {
      const res = await fetch('/api/admin/settings')
      if (res.ok) {
        const json = await res.json()
        if (json.success && json.data) {
          setSettings((prev) => ({
            platform_name: json.data.platform_name || prev.platform_name,
            support_email: json.data.support_email || prev.support_email,
            feature_virtual_run: json.data.feature_virtual_run ?? true,
            feature_photo_ai: json.data.feature_photo_ai ?? true,
            feature_repc_collection: json.data.feature_repc_collection ?? true,
            maintenance_mode: json.data.maintenance_mode ?? false,
          }))
          const price = json.data[PRICING_KEY] as SubscriptionPrice | undefined
          if (price && typeof price === 'object') {
            setSubPrice(price)
            setAmountInput(String(price.amount))
          }
        }
      }
      setLoading(false)
    }
    fetchSettings()
  }, [])

  const handleSavePricingCard = async () => {
    const amount = Number(amountInput)
    if (!Number.isFinite(amount) || amount < 1) {
      toast.error('Amount must be a MYR decimal of at least 1.00')
      return
    }
    setSaving(true)
    setSavePricing(true)
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      // Only the pricing key is patched here; other settings keep their
      // own Save Changes flow.
      body: JSON.stringify({
        settings: {
          [PRICING_KEY]: subPrice
            ? { ...subPrice, amount: Number(amount.toFixed(2)) }
            : {
                amount: Number(amount.toFixed(2)),
                currency: 'MYR',
                period: 'year',
                duration_days: 365,
              },
        },
      }),
    })
    const json = await res.json()
    if (json.success) {
      setPricingDirty(false)
      toast.success('Subscription pricing updated')
    } else {
      toast.error(json.error || 'Failed to update subscription pricing')
    }
    setSaving(false)
    setSavePricing(false)
  }

  const handleSave = async () => {
    setSaving(true)
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
    })
    const json = await res.json()
    if (json.success) {
      toast.success('Settings saved successfully')
    } else {
      toast.error(json.error || 'Failed to save settings')
    }
    setSaving(false)
  }

  const updateSetting = <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8 font-inter text-foreground">
      {/* ── Page Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[28px] leading-9 font-medium text-foreground">Settings</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">Subscription pricing, feature flags and maintenance mode</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-primary hover:opacity-90 text-primary-foreground hover:text-white text-[13px] font-medium transition-[color,background-color,border-color,opacity] font-inter disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          <Save className="size-[18px]" />
          Save changes
        </button>
      </div>

      {/* ── General Settings ─────────────────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border/30 overflow-hidden">
        <div className="p-5 border-b border-border/30 flex items-center gap-2">
          <Settings className="text-primary size-[20px]" />
          <div>
            <h2 className="font-jakarta font-medium text-[16px] text-foreground">General settings</h2>
            <p className="text-[11px] text-muted-foreground font-inter">Basic platform identity and contact configuration</p>
          </div>
        </div>
        <div className="p-5 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-muted-foreground font-inter" htmlFor="platform-name">
              Platform name
            </label>
            <Input
              id="platform-name"
              value={settings.platform_name}
              onChange={(e) => updateSetting('platform_name', e.target.value)}
              className="bg-card border-border/40 text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:border-primary rounded-lg text-[13px]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-muted-foreground font-inter" htmlFor="support-email">
              Support email
            </label>
            <Input
              id="support-email"
              type="email"
              value={settings.support_email}
              onChange={(e) => updateSetting('support_email', e.target.value)}
              className="bg-card border-border/40 text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:border-primary rounded-lg text-[13px]"
            />
          </div>
        </div>
      </div>

      {/* ── Subscription Pricing ────────────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border/30 overflow-hidden">
        <div className="p-5 border-b border-border/30 flex items-center gap-2">
          <Wallet className="text-primary size-[20px]" />
          <div>
            <h2 className="font-jakarta font-medium text-[16px] text-foreground">Subscription pricing</h2>
            <p className="text-[11px] text-muted-foreground font-inter">Single-tier organizer subscription shown on the apply and payment pages</p>
          </div>
        </div>
        <div className="p-5 flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-muted-foreground font-inter" htmlFor="sub-amount">
                Amount (RM)
              </label>
              <Input
                id="sub-amount"
                type="number"
                min="1"
                step="0.01"
                value={amountInput}
                onChange={(e) => {
                  setAmountInput(e.target.value)
                  setPricingDirty(true)
                }}
                className="bg-card border-border/40 text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:border-primary rounded-lg text-[13px]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-muted-foreground font-inter">Currency</span>
              <span className="px-3 py-2.5 rounded-lg bg-accent/50 border border-border/40 text-[13px] font-medium text-foreground font-mono w-fit">
                MYR
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-muted-foreground font-inter">Billing period</span>
              <span className="px-3 py-2.5 rounded-lg bg-accent/50 border border-border/40 text-[13px] font-medium text-foreground w-fit">
                per {subPrice?.period ?? 'year'}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground font-inter">
            Grants {subPrice?.duration_days ?? 365} days of organizer access after payment. Runner accounts are always
            free — runners pay only per event registration or merch order; this tier applies to organizers only.
          </p>
          <div>
            <button
              onClick={handleSavePricingCard}
              disabled={savePricing || !amountInput || Number(amountInput) < 1}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-[13px] font-medium transition-[color,background-color,border-color,opacity] font-inter disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {savePricing && <Loader2 className="h-4 w-4 animate-spin" />}
              <Save className="size-[16px]" />
              Update pricing
            </button>
            {pricingDirty && (
              <span className="ml-2 text-[11px] text-warning font-inter">Unsaved changes</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Feature Flags ─────────────────────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border/30 overflow-hidden">
        <div className="p-5 border-b border-border/30 flex items-center gap-2">
          <ToggleRight className="text-primary size-[20px]" />
          <div>
            <h2 className="font-jakarta font-medium text-[16px] text-foreground">Feature flags</h2>
            <p className="text-[11px] text-muted-foreground font-inter">Enable or disable platform features globally</p>
          </div>
        </div>
        <div className="divide-y divide-accent/30">
          {[
            {
              key: 'feature_virtual_run' as const,
              label: 'Virtual run tracking',
              desc: 'Enable GPS-based virtual run tracking and verification',
              icon: Footprints,
            },
            {
              key: 'feature_photo_ai' as const,
              label: 'AI BIB photo vision',
              desc: 'Enable AI-powered race photo bib number recognition (OCR)',
              icon: Camera,
            },
            {
              key: 'feature_repc_collection' as const,
              label: 'REPC consent collection',
              desc: 'Enable participant consent data collection at check-in',
              icon: Shield,
            },
          ].map((flag) => (
            <div key={flag.key} className="flex items-center justify-between px-5 py-4 hover:bg-card/50 transition-colors">
              <div className="flex items-center gap-3">
                <flag.icon className="size-[20px] text-primary" />
                <div>
                  <p className="text-[13px] font-medium text-foreground font-inter">{flag.label}</p>
                  <p className="text-[11px] text-muted-foreground font-inter">{flag.desc}</p>
                </div>
              </div>
              <Switch
                checked={settings[flag.key]}
                onCheckedChange={(checked) => updateSetting(flag.key, checked)}
                className="data-[state=checked]:bg-primary"
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Danger Zone ─────────────────────────────────────────────── */}
      <div className="rounded-xl bg-destructive/10 border border-destructive/30 dark:border-destructive/20 overflow-hidden">
        <div className="p-5 border-b border-destructive dark:border-destructive/10 flex items-center gap-2">
          <TriangleAlert className="text-destructive size-[20px]" />
          <div>
            <h2 className="font-jakarta font-medium text-[16px] text-destructive">Danger zone</h2>
            <p className="text-[11px] text-muted-foreground font-inter">Irreversible platform-level actions</p>
          </div>
        </div>
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <Construction className="size-[20px] text-destructive" />
            <div>
              <p className="text-[13px] font-medium text-foreground font-inter">Maintenance mode</p>
              <p className="text-[11px] text-muted-foreground font-inter">
                Blocks all non-admin access to the platform. Use during deployments.
              </p>
            </div>
          </div>
          <Switch
            checked={settings.maintenance_mode}
            onCheckedChange={(checked) => updateSetting('maintenance_mode', checked)}
            className="data-[state=checked]:bg-destructive"
          />
        </div>
      </div>
    </div>
  )
}
