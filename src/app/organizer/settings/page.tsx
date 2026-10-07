'use client'

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
      icon: 'corporate_fare',
      content: (
        <div className="flex flex-col gap-4">
          {[
            { id: 'org-name', label: 'Organization Name', type: 'text', placeholder: 'Pelikat Batik Events', defaultValue: '' },
            { id: 'org-slug', label: 'URL Slug', type: 'text', placeholder: 'pelikat-batik-events', defaultValue: '' },
            { id: 'contact-email', label: 'Contact Email', type: 'email', placeholder: 'contact@yourorg.com', defaultValue: '' },
            { id: 'contact-phone', label: 'Contact Phone', type: 'tel', placeholder: '+60 12-345 6789', defaultValue: '' },
          ].map(f => (
            <div key={f.id} className="flex flex-col gap-1.5">
              <label htmlFor={f.id} className="text-[12px] leading-[16px] tracking-[0.02em] font-semibold text-[#cbc3d7]">{f.label}</label>
              <input
                id={f.id}
                type={f.type}
                placeholder={f.placeholder}
                defaultValue={f.defaultValue}
                className="w-full px-3 py-2.5 bg-[#201f22] border border-[#353437] rounded-lg text-[#e5e1e4] text-[14px] leading-[20px] focus:outline-none focus:border-[#d0bcff]/50 focus:ring-1 focus:ring-[#d0bcff]/20 placeholder:text-[#494454] transition-colors"
              />
            </div>
          ))}
          <button
            onClick={handleSave}
            disabled={saving}
            className="self-start px-5 py-2.5 bg-[#d0bcff] text-[#3c0091] text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-2 hover:bg-[#a078ff] transition-all disabled:opacity-60 shadow-[0_0_12px_rgba(208,188,255,0.2)]"
          >
            {saving ? (
              <>
                <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                Saving...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">save</span>
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
      icon: 'notifications',
      content: (
        <div className="flex flex-col gap-4">
          {[
            { label: 'Email Notifications', desc: 'Receive email for new registrations and payments', state: notifEmail, setState: setNotifEmail },
            { label: 'SMS Alerts', desc: 'Receive SMS for urgent updates and check-in milestones', state: notifSms, setState: setNotifSms },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between p-4 bg-[#201f22] rounded-xl border border-[#353437]">
              <div>
                <div className="text-[14px] leading-[20px] font-medium text-[#e5e1e4]">{item.label}</div>
                <div className="text-[12px] leading-[16px] text-[#958ea0] mt-0.5">{item.desc}</div>
              </div>
              <button
                onClick={() => item.setState(!item.state)}
                className={`relative w-11 h-6 rounded-full transition-colors ${item.state ? 'bg-[#d0bcff]' : 'bg-[#353437]'}`}
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
      icon: 'webhook',
      content: (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between p-4 bg-[#201f22] rounded-xl border border-[#353437]">
            <div>
              <div className="text-[14px] leading-[20px] font-medium text-[#e5e1e4]">Enable Webhooks</div>
              <div className="text-[12px] leading-[16px] text-[#958ea0] mt-0.5">Receive HTTP callbacks for registration events</div>
            </div>
            <button
              onClick={() => setWebhookEnabled(!webhookEnabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${webhookEnabled ? 'bg-[#d0bcff]' : 'bg-[#353437]'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${webhookEnabled ? 'left-5' : 'left-0.5'}`} />
            </button>
          </div>
          {webhookEnabled && (
            <div className="flex flex-col gap-2">
              <label className="text-[12px] leading-[16px] tracking-[0.02em] font-semibold text-[#cbc3d7]">Webhook URL</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://yourapp.com/webhooks/pelikat"
                  className="flex-1 px-3 py-2.5 bg-[#201f22] border border-[#353437] rounded-lg text-[#e5e1e4] text-[14px] leading-[20px] focus:outline-none focus:border-[#d0bcff]/50 placeholder:text-[#494454]"
                />
                <button className="px-4 py-2.5 bg-[#201f22] hover:bg-[#2a2a2c] text-[#e5e1e4] text-[14px] font-medium rounded-lg border border-[#353437] transition-colors">
                  Test
                </button>
              </div>
              <div className="text-[11px] text-[#958ea0]">
                Events fired: <span className="text-[#d0bcff]">registration.created</span>, <span className="text-[#d0bcff]">payment.confirmed</span>, <span className="text-[#d0bcff]">checkin.completed</span>
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
      icon: 'card_membership',
      content: (
        <div className="flex flex-col gap-4">
          <div className="p-4 bg-[#201f22] rounded-xl border border-[#d0bcff]/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[14px] font-semibold text-[#e5e1e4]">Current Plan</span>
              <span className="px-2.5 py-1 rounded-full bg-[#d0bcff]/15 text-[#d0bcff] text-[10px] font-semibold border border-[#d0bcff]/20">Enterprise SLA</span>
            </div>
            <p className="text-[12px] text-[#958ea0]">Your subscription grants access to unlimited events, priority support, and advanced analytics.</p>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2.5 bg-[#1c1b1d] hover:bg-[#201f22] text-[#e5e1e4] text-[14px] font-medium rounded-lg border border-[#23232b] transition-colors">
              Manage Billing
            </button>
            <button className="px-4 py-2.5 text-[#ffb4ab] hover:bg-[#ffb4ab]/10 text-[14px] font-medium rounded-lg transition-colors">
              Cancel Subscription
            </button>
          </div>
        </div>
      ),
    },
  ]

  return (
    <div className="relative w-full min-h-full px-6 py-8 bg-[#131315]">
      <div className="absolute -top-20 -right-20 w-80 h-80 bg-[#d0bcff]/8 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 flex flex-col gap-6 w-full">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] leading-[14px] tracking-[0.05em] font-semibold px-2.5 py-1 rounded-full bg-[#d0bcff]/10 text-[#e9ddff] uppercase w-fit">
            Config
          </span>
          <h1 className="text-[28px] leading-[36px] tracking-[-0.02em] font-bold text-[#e5e1e4]">Settings & Webhooks</h1>
          <p className="text-[14px] leading-[20px] text-[#cbc3d7]">Configure your organizer account, notifications, and integration settings.</p>
        </div>

        {/* Settings panels */}
        {sections.map(section => (
          <div key={section.id} className="bg-[#1c1b1d] rounded-xl border border-[#23232b] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#23232b] bg-[#201f22] flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#2a2a2c] flex items-center justify-center text-[#d0bcff]">
                <span className="material-symbols-outlined text-[18px]">{section.icon}</span>
              </div>
              <div>
                <div className="text-[15px] leading-[20px] font-semibold text-[#e5e1e4]">{section.label}</div>
                <div className="text-[12px] leading-[16px] text-[#958ea0]">{section.description}</div>
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