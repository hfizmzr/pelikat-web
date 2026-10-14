'use client'

import { Bell, Building2, CreditCard, LoaderCircle, Save, Webhook } from "lucide-react"
import { useState } from 'react'

export default function OrganizerSettingsPage() {
  const [notifEmail, setNotifEmail] = useState(true)
  const [notifSms, setNotifSms] = useState(false)
  const [webhookEnabled, setWebhookEnabled] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await new Promise(r => setTimeout(r, 800))
    setSaving(false)
  }

  const sections = [
    {
      id: 'profile',
      label: 'Organization Profile',
      description: 'Basic information about your organization',
      icon: Building2,
      content: (
        <div className="flex flex-col gap-4">
          {[
            { id: 'org-name', label: 'Organization Name', type: 'text', placeholder: 'Pelikat Batik Events', defaultValue: '' },
            { id: 'org-slug', label: 'URL Slug', type: 'text', placeholder: 'pelikat-batik-events', defaultValue: '' },
            { id: 'contact-email', label: 'Contact Email', type: 'email', placeholder: 'contact@yourorg.com', defaultValue: '' },
            { id: 'contact-phone', label: 'Contact Phone', type: 'tel', placeholder: '+60 12-345 6789', defaultValue: '' },
          ].map(f => (
            <div key={f.id} className="flex flex-col gap-1.5">
              <label htmlFor={f.id} className="text-[12px] leading-[16px] tracking-[0.02em] font-semibold text-muted-foreground">{f.label}</label>
              <input
                id={f.id}
                type={f.type}
                placeholder={f.placeholder}
                defaultValue={f.defaultValue}
                className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-foreground text-[14px] leading-[20px] focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 placeholder:text-border transition-colors"
              />
            </div>
          ))}
          <button
            onClick={handleSave}
            disabled={saving}
            className="self-start px-5 py-2.5 bg-primary text-primary-foreground text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-2 hover:bg-primary transition-all disabled:opacity-60 "
          >
            {saving ? (
              <>
                <LoaderCircle className="size-[18px] animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="size-[18px]" />
                Save Changes
              </>
            )}
          </button>
        </div>
      ),
    },
    {
      id: 'notifications',
      label: 'Notification Preferences',
      description: 'Configure how you receive alerts and updates',
      icon: Bell,
      content: (
        <div className="flex flex-col gap-4">
          {[
            { label: 'Email Notifications', desc: 'Receive email for new registrations and payments', state: notifEmail, setState: setNotifEmail },
            { label: 'SMS Alerts', desc: 'Receive SMS for urgent updates and check-in milestones', state: notifSms, setState: setNotifSms },
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
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${item.state ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'webhooks',
      label: 'Webhooks & API',
      description: 'Configure webhooks for real-time event notifications',
      icon: Webhook,
      content: (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between p-4 bg-card rounded-xl border border-border">
            <div>
              <div className="text-[14px] leading-[20px] font-medium text-foreground">Enable Webhooks</div>
              <div className="text-[12px] leading-[16px] text-muted-foreground mt-0.5">Receive HTTP callbacks for registration events</div>
            </div>
            <button
              onClick={() => setWebhookEnabled(!webhookEnabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${webhookEnabled ? 'bg-primary' : 'bg-accent'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${webhookEnabled ? 'left-5' : 'left-0.5'}`} />
            </button>
          </div>
          {webhookEnabled && (
            <div className="flex flex-col gap-2">
              <label className="text-[12px] leading-[16px] tracking-[0.02em] font-semibold text-muted-foreground">Webhook URL</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://yourapp.com/webhooks/pelikat"
                  className="flex-1 px-3 py-2.5 bg-card border border-border rounded-lg text-foreground text-[14px] leading-[20px] focus:outline-none focus:border-primary/50 placeholder:text-border"
                />
                <button className="px-4 py-2.5 bg-card hover:bg-accent text-foreground text-[14px] font-medium rounded-lg border border-border transition-colors">
                  Test
                </button>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Events fired: <span className="text-primary">registration.created</span>, <span className="text-primary">payment.confirmed</span>, <span className="text-primary">checkin.completed</span>
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'subscription',
      label: 'Subscription & Billing',
      description: 'Manage your organizer subscription plan',
      icon: CreditCard,
      content: (
        <div className="flex flex-col gap-4">
          <div className="p-4 bg-card rounded-xl border border-primary/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[14px] font-semibold text-foreground">Current Plan</span>
              <span className="px-2.5 py-1 rounded-full bg-primary/15 text-primary text-[10px] font-semibold border border-primary/20">Enterprise SLA</span>
            </div>
            <p className="text-[12px] text-muted-foreground">Your subscription grants access to unlimited events, priority support, and advanced analytics.</p>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2.5 bg-card hover:bg-card text-foreground text-[14px] font-medium rounded-lg border border-muted transition-colors">
              Manage Billing
            </button>
            <button className="px-4 py-2.5 text-red-500 dark:text-red-300 hover:bg-red-500/10 dark:bg-red-500 dark:bg-red-300/10 text-[14px] font-medium rounded-lg transition-colors">
              Cancel Subscription
            </button>
          </div>
        </div>
      ),
    },
  ]

  return (
    <div className="relative w-full min-h-full px-6 py-8 bg-background">
      <div className="absolute -top-20 -right-20 w-80 h-80 bg-primary/8 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 flex flex-col gap-6 w-full">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] leading-[14px] tracking-[0.05em] font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary uppercase w-fit">
            Config
          </span>
          <h1 className="text-[28px] leading-[36px] tracking-[-0.02em] font-bold text-foreground">Settings & Webhooks</h1>
          <p className="text-[14px] leading-[20px] text-muted-foreground">Configure your organizer account, notifications, and integration settings.</p>
        </div>

        {/* Settings panels */}
        {sections.map(section => (
          <div key={section.id} className="bg-card rounded-xl border border-muted overflow-hidden">
            <div className="px-6 py-4 border-b border-muted bg-card flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-primary">
                <section.icon className="size-[18px]" />
              </div>
              <div>
                <div className="text-[15px] leading-[20px] font-semibold text-foreground">{section.label}</div>
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