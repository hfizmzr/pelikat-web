'use client'

import { Bell, Building2, CreditCard, LoaderCircle, Save, Webhook } from "lucide-react"
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export default function OrganizerSettingsPage() {
  const [notifEmail, setNotifEmail] = useState(true)
  const [notifSms, setNotifSms] = useState(false)
  const [webhookEnabled, setWebhookEnabled] = useState(false)
  const [saving, setSaving] = useState(false)

  // Audit #9: the Organization Profile form never pre-filled (placeholders
  // only, Save wrote blanks). Load the organizer row on mount and write the
  // same columns back on Save. organizers has no phone column, so that
  // placeholder-only field is dropped.
  const [profile, setProfile] = useState({ name: '', slug: '', contact_email: '' })
  const [profileLoading, setProfileLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function loadProfile() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const organizerId = user?.app_metadata?.organizer_id
      if (!organizerId) {
        setProfileLoading(false)
        return
      }
      const { data } = await supabase
        .from('organizers')
        .select('name, slug, contact_email')
        .eq('id', organizerId)
        .maybeSingle()
      if (!cancelled && data) {
        setProfile({ name: data.name ?? '', slug: data.slug ?? '', contact_email: data.contact_email ?? '' })
      }
      if (!cancelled) setProfileLoading(false)
    }
    void loadProfile()
    return () => { cancelled = true }
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const organizerId = user?.app_metadata?.organizer_id
      if (!organizerId) {
        toast.error('Not signed in as an organizer.')
        return
      }
      // Only send fields that have values — contact_email/slug are UNIQUE
      // columns and an empty string would collide (or blank out real data).
      const update: Record<string, string> = {}
      if (profile.name.trim()) update.name = profile.name.trim()
      if (profile.slug.trim()) update.slug = profile.slug.trim()
      if (profile.contact_email.trim()) update.contact_email = profile.contact_email.trim()
      if (Object.keys(update).length === 0) {
        toast.error('Nothing to save — fill in at least one field.')
        return
      }
      const { error } = await supabase
        .from('organizers')
        .update(update)
        .eq('id', organizerId)
      if (error) {
        toast.error(error.message.includes('duplicate key')
          ? 'That slug or contact email is already taken.'
          : (error.message || 'Failed to save.'))
        return
      }
      toast.success('Organization profile saved.')
    } finally {
      setSaving(false)
    }
  }

  const sections = [
    {
      id: 'profile',
      label: 'Organization profile',
      description: 'Basic information about your organization',
      icon: Building2,
      content: (
        <div className="flex flex-col gap-4">
          {[
            { id: 'org-name', label: 'Organization name', type: 'text', placeholder: 'Pelikat Batik events', key: 'name' as const },
            { id: 'org-slug', label: 'URL slug', type: 'text', placeholder: 'pelikat-batik-events', key: 'slug' as const },
            { id: 'contact-email', label: 'Contact email', type: 'email', placeholder: 'contact@yourorg.com', key: 'contact_email' as const },
          ].map(f => (
            <div key={f.id} className="flex flex-col gap-1.5">
              <label htmlFor={f.id} className="text-[12px] leading-[16px] font-medium text-muted-foreground">{f.label}</label>
              <input
                id={f.id}
                type={f.type}
                placeholder={f.placeholder}
                value={profile[f.key]}
                onChange={(e) => setProfile(prev => ({ ...prev, [f.key]: e.target.value }))}
                disabled={profileLoading}
                className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-foreground text-[14px] leading-[20px] focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 placeholder:text-muted-foreground transition-colors disabled:opacity-60"
              />
            </div>
          ))}
          <button
            onClick={handleSave}
            disabled={saving}
            className="self-start px-5 py-2.5 bg-primary text-primary-foreground text-[14px] leading-[20px] font-medium rounded-lg flex items-center gap-2 hover:opacity-90 transition-[color,background-color,border-color,opacity] disabled:opacity-60 "
          >
            {saving ? (
              <>
                <LoaderCircle className="size-[18px] animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="size-[18px]" />
                Save changes
              </>
            )}
          </button>
        </div>
      ),
    },
    {
      id: 'notifications',
      label: 'Notifications',
      description: 'How we reach you about registrations and race day',
      icon: Bell,
      content: (
        <div className="flex flex-col gap-4">
          {[
            { label: 'Email notifications', desc: 'Receive email for new registrations and payments', state: notifEmail, setState: setNotifEmail },
            { label: 'SMS alerts', desc: 'Receive SMS for urgent updates and check-in milestones', state: notifSms, setState: setNotifSms },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between p-4 bg-card rounded-xl border border-border">
              <div>
                <div className="text-[14px] leading-[20px] font-medium text-foreground">{item.label}</div>
                <div className="text-[12px] leading-[16px] text-muted-foreground mt-0.5">{item.desc}</div>
              </div>
              <button
                onClick={() => item.setState(!item.state)}
                className={`relative w-11 h-6 rounded-full transition-colors ${item.state ? 'bg-primary' : 'bg-accent'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 left-0 rounded-full bg-white shadow-sm transition-transform duration-150 ${item.state ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'webhooks',
      label: 'Webhooks',
      description: 'HTTP callbacks when registrations, payments and check-ins happen',
      icon: Webhook,
      content: (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between p-4 bg-card rounded-xl border border-border">
            <div>
              <div className="text-[14px] leading-[20px] font-medium text-foreground">Enable webhooks</div>
              <div className="text-[12px] leading-[16px] text-muted-foreground mt-0.5">Receive HTTP callbacks for registration events</div>
            </div>
            <button
              onClick={() => setWebhookEnabled(!webhookEnabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${webhookEnabled ? 'bg-primary' : 'bg-accent'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 left-0 rounded-full bg-white shadow-sm transition-transform duration-150 ${webhookEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {webhookEnabled && (
            <div className="flex flex-col gap-2">
              <label className="text-[12px] leading-[16px] font-medium text-muted-foreground">Webhook URL</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://yourapp.com/webhooks/pelikat"
                  className="flex-1 px-3 py-2.5 bg-card border border-border rounded-lg text-foreground text-[14px] leading-[20px] focus:outline-none focus:border-primary/50 placeholder:text-muted-foreground"
                />
              </div>
              <div className="text-[11px] text-muted-foreground">
                Events sent: <span className="font-mono text-foreground">registration.created</span>, <span className="font-mono text-foreground">payment.confirmed</span>, <span className="font-mono text-foreground">checkin.completed</span>
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'subscription',
      label: 'Subscription',
      description: 'Billing for your organizer account',
      icon: CreditCard,
      content: (
        <div className="flex flex-col gap-4">
          <p className="max-w-[64ch] text-[14px] text-muted-foreground">
            One subscription covers every feature for all your events. Runner accounts are free; runners pay only the entry fee and any merch they order.
          </p>
          <div className="flex gap-2">
            {/* Audit #7: Manage Billing was dead — /organizer/payment is the
            subscription destination (HitPay checkout + sub_expires_at). */}
            <Link
              href="/organizer/payment"
              className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-[14px] font-medium text-foreground transition-colors hover:bg-accent"
            >
              Manage billing
            </Link>
          </div>
        </div>
      ),
    },
  ]

  return (
    <div className="mx-auto w-full max-w-[960px] px-4 py-8 sm:px-8">

      <div className="flex flex-col gap-6 w-full">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] leading-9 font-medium text-foreground">Settings</h1>
        </div>

        {/* Settings panels */}
        {sections.map(section => (
          <div key={section.id} className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center gap-3">
              <section.icon className="size-[18px] shrink-0 text-muted-foreground" strokeWidth={1.75} />
              <div>
                <h2 className="text-[15px] leading-5 font-medium text-foreground">{section.label}</h2>
                <div className="text-[12px] leading-[16px] text-muted-foreground">{section.description}</div>
              </div>
            </div>
            <div className="p-6">
              {section.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}