'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

  const updateSetting = <K extends keyof PlatformSettings>(
    key: K,
    value: PlatformSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">
            Manage platform settings and configuration
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </div>

      <div className="grid gap-6">
        <Card className="border-border">
          <CardHeader>
            <CardTitle>General Settings</CardTitle>
            <CardDescription>Basic platform configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="platform-name">Platform Name</Label>
              <Input
                id="platform-name"
                value={settings.platform_name}
                onChange={(e) => updateSetting('platform_name', e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="support-email">Support Email</Label>
              <Input
                id="support-email"
                type="email"
                value={settings.support_email}
                onChange={(e) => updateSetting('support_email', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle>Feature Flags</CardTitle>
            <CardDescription>Enable or disable platform features</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Virtual Run</Label>
                <p className="text-sm text-muted-foreground">
                  Enable virtual run tracking
                </p>
              </div>
              <Switch
                checked={settings.feature_virtual_run}
                onCheckedChange={(checked) =>
                  updateSetting('feature_virtual_run', checked)
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Photo AI</Label>
                <p className="text-sm text-muted-foreground">
                  Enable AI photo processing
                </p>
              </div>
              <Switch
                checked={settings.feature_photo_ai}
                onCheckedChange={(checked) =>
                  updateSetting('feature_photo_ai', checked)
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>REPC Collection</Label>
                <p className="text-sm text-muted-foreground">
                  Enable REPC consent collection
                </p>
              </div>
              <Switch
                checked={settings.feature_repc_collection}
                onCheckedChange={(checked) =>
                  updateSetting('feature_repc_collection', checked)
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>Irreversible actions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Maintenance Mode</Label>
                <p className="text-sm text-muted-foreground">
                  Put platform in maintenance mode (blocks non-admin access)
                </p>
              </div>
              <Switch
                checked={settings.maintenance_mode}
                onCheckedChange={(checked) =>
                  updateSetting('maintenance_mode', checked)
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
