'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Loader2 } from 'lucide-react'
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
        <Loader2 className="h-7 w-7 animate-spin text-[#d0bcff]" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8 font-inter text-[#e5e1e4]">
      {/* ── Page Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-[#d0bcff]">toggle_on</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#d0bcff] font-inter">Platform Config</span>
          </div>
          <h1 className="font-jakarta font-bold text-[28px] text-[#e5e1e4] tracking-tight">Settings</h1>
          <p className="text-[13px] text-[#958ea0]">Manage platform-wide configuration, feature flags, and operational controls</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#d0bcff] hover:bg-[#6d3bd7] text-[#3c0091] hover:text-white text-[13px] font-semibold transition-all glow-primary font-inter disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          <span className="material-symbols-outlined text-[18px]">save</span>
          Save Changes
        </button>
      </div>

      {/* ── General Settings ─────────────────────────────────────────── */}
      <div className="rounded-xl bg-[#1c1b1d] border border-[#494454]/30 overflow-hidden">
        <div className="p-5 border-b border-[#494454]/30 flex items-center gap-2">
          <span className="material-symbols-outlined text-[#d0bcff] text-[20px]">settings</span>
          <div>
            <h2 className="font-jakarta font-semibold text-[16px] text-[#e5e1e4]">General Settings</h2>
            <p className="text-[11px] text-[#958ea0] font-inter">Basic platform identity and contact configuration</p>
          </div>
        </div>
        <div className="p-5 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-[#cbc3d7] font-inter" htmlFor="platform-name">
              Platform Name
            </label>
            <Input
              id="platform-name"
              value={settings.platform_name}
              onChange={(e) => updateSetting('platform_name', e.target.value)}
              className="bg-[#201f22] border-[#494454]/40 text-[#e5e1e4] placeholder:text-[#958ea0] focus:ring-1 focus:ring-[#d0bcff] focus:border-[#d0bcff] rounded-lg text-[13px]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-[#cbc3d7] font-inter" htmlFor="support-email">
              Support Email
            </label>
            <Input
              id="support-email"
              type="email"
              value={settings.support_email}
              onChange={(e) => updateSetting('support_email', e.target.value)}
              className="bg-[#201f22] border-[#494454]/40 text-[#e5e1e4] placeholder:text-[#958ea0] focus:ring-1 focus:ring-[#d0bcff] focus:border-[#d0bcff] rounded-lg text-[13px]"
            />
          </div>
        </div>
      </div>

      {/* ── Feature Flags ─────────────────────────────────────────────── */}
      <div className="rounded-xl bg-[#1c1b1d] border border-[#494454]/30 overflow-hidden">
        <div className="p-5 border-b border-[#494454]/30 flex items-center gap-2">
          <span className="material-symbols-outlined text-[#4cd7f6] text-[20px]">toggle_on</span>
          <div>
            <h2 className="font-jakarta font-semibold text-[16px] text-[#e5e1e4]">Feature Flags</h2>
            <p className="text-[11px] text-[#958ea0] font-inter">Enable or disable platform features globally</p>
          </div>
        </div>
        <div className="divide-y divide-[#353437]/30">
          {[
            {
              key: 'feature_virtual_run' as const,
              label: 'Virtual Run Tracking',
              desc: 'Enable GPS-based virtual run tracking and verification',
              icon: 'directions_run',
            },
            {
              key: 'feature_photo_ai' as const,
              label: 'AI BIB Photo Vision',
              desc: 'Enable AI-powered race photo bib number recognition (OCR)',
              icon: 'photo_camera',
            },
            {
              key: 'feature_repc_collection' as const,
              label: 'REPC Consent Collection',
              desc: 'Enable participant consent data collection at check-in',
              icon: 'policy',
            },
          ].map((flag) => (
            <div key={flag.key} className="flex items-center justify-between px-5 py-4 hover:bg-[#201f22]/50 transition-colors">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-[#d0bcff]">{flag.icon}</span>
                <div>
                  <p className="text-[13px] font-semibold text-[#e5e1e4] font-inter">{flag.label}</p>
                  <p className="text-[11px] text-[#958ea0] font-inter">{flag.desc}</p>
                </div>
              </div>
              <Switch
                checked={settings[flag.key]}
                onCheckedChange={(checked) => updateSetting(flag.key, checked)}
                className="data-[state=checked]:bg-[#a078ff]"
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Danger Zone ─────────────────────────────────────────────── */}
      <div className="rounded-xl bg-[#93000a]/10 border border-[#ffb4ab]/20 overflow-hidden">
        <div className="p-5 border-b border-[#ffb4ab]/10 flex items-center gap-2">
          <span className="material-symbols-outlined text-[#ffb4ab] text-[20px]">warning</span>
          <div>
            <h2 className="font-jakarta font-semibold text-[16px] text-[#ffb4ab]">Danger Zone</h2>
            <p className="text-[11px] text-[#cbc3d7] font-inter">Irreversible platform-level actions</p>
          </div>
        </div>
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[20px] text-[#ffb4ab]">construction</span>
            <div>
              <p className="text-[13px] font-semibold text-[#e5e1e4] font-inter">Maintenance Mode</p>
              <p className="text-[11px] text-[#958ea0] font-inter">
                Blocks all non-admin access to the platform. Use during deployments.
              </p>
            </div>
          </div>
          <Switch
            checked={settings.maintenance_mode}
            onCheckedChange={(checked) => updateSetting('maintenance_mode', checked)}
            className="data-[state=checked]:bg-[#93000a]"
          />
        </div>
      </div>
    </div>
  )
}
