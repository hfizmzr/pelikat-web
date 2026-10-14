'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Camera, Construction, Footprints, Loader2, Save, Settings, Shield, ToggleRight, TriangleAlert } from "lucide-react"
import { toast } from 'sonner'

interface PlatformSettings {
  platform_name: string
  support_email: string
  feature_virtual_run: boolean
  feature_photo_ai: boolean
  feature_repc_collection: boolean
  maintenance_mode: boolean
}

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<PlatformSettings>({
    platform_name: 'Pelikat Running Platform',
    support_email: 'support@pelikat.com',
    feature_virtual_run: true,
    feature_photo_ai: true,
    feature_repc_collection: true,
    maintenance_mode: false,
  })

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
        }
      }
      setLoading(false)
    }
    fetchSettings()
  }, [])

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
          <div className="flex items-center gap-2">
            <span className="size-[16px] text-primary"><ToggleRight className="size-[16px] text-primary" /></span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary font-inter">Platform Config</span>
          </div>
          <h1 className="font-jakarta font-bold text-[28px] text-foreground tracking-tight">Settings</h1>
          <p className="text-[13px] text-muted-foreground">Manage platform-wide configuration, feature flags, and operational controls</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-primary hover:bg-primary text-primary-foreground hover:text-white text-[13px] font-semibold transition-all font-inter disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          <span className="size-[18px]"><Save className="size-[18px]" /></span>
          Save Changes
        </button>
      </div>

      {/* ── General Settings ─────────────────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border/30 overflow-hidden">
        <div className="p-5 border-b border-border/30 flex items-center gap-2">
          <span className="text-primary size-[20px]"><Settings className="text-primary size-[20px]" /></span>
          <div>
            <h2 className="font-jakarta font-semibold text-[16px] text-foreground">General Settings</h2>
            <p className="text-[11px] text-muted-foreground font-inter">Basic platform identity and contact configuration</p>
          </div>
        </div>
        <div className="p-5 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-muted-foreground font-inter" htmlFor="platform-name">
              Platform Name
            </label>
            <Input
              id="platform-name"
              value={settings.platform_name}
              onChange={(e) => updateSetting('platform_name', e.target.value)}
              className="bg-card border-border/40 text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:border-primary rounded-lg text-[13px]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-muted-foreground font-inter" htmlFor="support-email">
              Support Email
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

      {/* ── Feature Flags ─────────────────────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border/30 overflow-hidden">
        <div className="p-5 border-b border-border/30 flex items-center gap-2">
          <span className="text-primary size-[20px]"><ToggleRight className="text-primary size-[20px]" /></span>
          <div>
            <h2 className="font-jakarta font-semibold text-[16px] text-foreground">Feature Flags</h2>
            <p className="text-[11px] text-muted-foreground font-inter">Enable or disable platform features globally</p>
          </div>
        </div>
        <div className="divide-y divide-accent/30">
          {[
            {
              key: 'feature_virtual_run' as const,
              label: 'Virtual Run Tracking',
              desc: 'Enable GPS-based virtual run tracking and verification',
              icon: Footprints,
            },
            {
              key: 'feature_photo_ai' as const,
              label: 'AI BIB Photo Vision',
              desc: 'Enable AI-powered race photo bib number recognition (OCR)',
              icon: Camera,
            },
            {
              key: 'feature_repc_collection' as const,
              label: 'REPC Consent Collection',
              desc: 'Enable participant consent data collection at check-in',
              icon: Shield,
            },
          ].map((flag) => (
            <div key={flag.key} className="flex items-center justify-between px-5 py-4 hover:bg-card/50 transition-colors">
              <div className="flex items-center gap-3">
                <flag.icon className="size-[20px] text-primary" />
                <div>
                  <p className="text-[13px] font-semibold text-foreground font-inter">{flag.label}</p>
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
      <div className="rounded-xl bg-red-800/10 border border-red-300/20 overflow-hidden">
        <div className="p-5 border-b border-red-300/10 flex items-center gap-2">
          <span className="text-red-300 size-[20px]"><TriangleAlert className="text-red-300 size-[20px]" /></span>
          <div>
            <h2 className="font-jakarta font-semibold text-[16px] text-red-300">Danger Zone</h2>
            <p className="text-[11px] text-muted-foreground font-inter">Irreversible platform-level actions</p>
          </div>
        </div>
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="size-[20px] text-red-300"><Construction className="size-[20px] text-red-300" /></span>
            <div>
              <p className="text-[13px] font-semibold text-foreground font-inter">Maintenance Mode</p>
              <p className="text-[11px] text-muted-foreground font-inter">
                Blocks all non-admin access to the platform. Use during deployments.
              </p>
            </div>
          </div>
          <Switch
            checked={settings.maintenance_mode}
            onCheckedChange={(checked) => updateSetting('maintenance_mode', checked)}
            className="data-[state=checked]:bg-red-800"
          />
        </div>
      </div>
    </div>
  )
}
