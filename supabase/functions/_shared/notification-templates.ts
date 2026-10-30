// supabase/functions/_shared/notification-templates.ts
//
// Email + push content for public.notifications rows. Dependency-free so
// the dispatcher (Deno) and the organizer's broadcast preview (Next.js)
// render the exact same email.

export type NotificationKind = 'registration_confirmed' | 'results_published' | 'broadcast' | 'test'

export interface NotificationJob {
  id: string
  kind: NotificationKind
  title: string
  body: string
  url: string | null
  event_id: string | null
  data: Record<string, unknown> | null
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

const BRAND = '#0f9b9b'

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s === '' ? null : s
}

/** '2026-12-14' → 'Sun, 14 Dec 2026' (date-only, no timezone shift). */
export function formatEventDate(value: unknown): string | null {
  const s = str(value)
  if (!s) return null
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function absoluteUrl(path: string | null, siteUrl: string): string | null {
  if (!path) return null
  if (/^https?:\/\//.test(path)) return path
  return `${siteUrl.replace(/\/+$/, '')}${path.startsWith('/') ? '' : '/'}${path}`
}

// Reserved/test TLDs and example domains never receive mail — seed
// accounts (runnerN@pelikat.test) would only bounce and hurt the sender.
export function isDeliverableEmail(address: string | null | undefined): boolean {
  if (!address) return false
  const m = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/.exec(address.trim())
  if (!m) return false
  const domain = m[1].toLowerCase()
  if (/\.(test|example|invalid|localhost|local)$/.test(domain)) return false
  return !/^example\.(com|org|net)$/.test(domain)
}

function row(label: string, value: string | null): string {
  if (!value) return ''
  return `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:110px;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600;">${escapeHtml(value)}</td></tr>`
}

function button(href: string | null, label: string): string {
  if (!href) return ''
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;"><tr><td style="border-radius:10px;background:${BRAND};"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a></td></tr></table>`
}

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px;color:#374151;font-size:15px;line-height:1.6;">${escapeHtml(p).replace(/\n/g, '<br />')}</p>`)
    .join('')
}

function layout(opts: { preheader: string; heading: string; content: string; footer: string }): string {
  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(opts.heading)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
<tr><td style="background:${BRAND};padding:18px 28px;color:#ffffff;font-size:18px;font-weight:800;letter-spacing:0.02em;">Pelikat</td></tr>
<tr><td style="padding:28px 28px 8px;">
<h1 style="margin:0 0 16px;color:#111827;font-size:22px;line-height:1.3;">${escapeHtml(opts.heading)}</h1>
${opts.content}
</td></tr>
<tr><td style="padding:16px 28px 24px;color:#9ca3af;font-size:12px;line-height:1.5;border-top:1px solid #f3f4f6;">${escapeHtml(opts.footer)}</td></tr>
</table></td></tr></table>
</body></html>`
}

export function renderEmail(job: NotificationJob, siteUrl: string): RenderedEmail | null {
  const d = job.data ?? {}
  const eventName = str(d.event_name) ?? 'your event'
  const name = str(d.runner_name)?.split(/\s+/)[0] ?? 'there'
  const link = absoluteUrl(job.url, siteUrl)
  const footer = `You're receiving this because you're registered for ${eventName} on Pelikat.`

  if (job.kind === 'registration_confirmed') {
    const bib = str(d.bib_number)
    const virtual = d.event_type === 'virtual'
    const role = str(d.registration_role)
    const date = formatEventDate(d.event_date)
    const content =
      `<p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.6;">Hi ${escapeHtml(name)}, you're officially in. See you at the start line!</p>` +
      (bib
        ? `<div style="margin:0 0 20px;padding:18px;border-radius:12px;background:#f0fdfa;border:1px solid #99f6e4;text-align:center;"><div style="color:#0f766e;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Your BIB number</div><div style="margin-top:4px;color:#111827;font-size:36px;font-weight:800;letter-spacing:0.04em;">${escapeHtml(bib)}</div></div>`
        : '') +
      `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">` +
      row('Event', eventName) +
      row('Date', date) +
      row(virtual ? 'Format' : 'Location', virtual ? 'Virtual run' : str(d.location) ?? 'TBA') +
      row('Category', str(d.category_name)) +
      (role && role !== 'runner' ? row('Entry', role.charAt(0).toUpperCase() + role.slice(1)) : '') +
      `</table>` +
      (virtual
        ? `<p style="margin:18px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">Log your runs in the Pelikat app to climb the leaderboard and earn your e-certificate.</p>`
        : `<p style="margin:18px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">Show your digital BIB pass at the race-kit collection (REPC) desk.</p>`) +
      button(link, bib ? 'View your digital BIB' : 'Open event')
    return {
      subject: bib ? `Registration confirmed: ${eventName} — BIB ${bib}` : `Registration confirmed: ${eventName}`,
      html: layout({ preheader: job.body, heading: 'Registration confirmed', content, footer }),
      text: [
        `Hi ${name}, you're registered for ${eventName}.`,
        bib ? `BIB number: ${bib}` : null,
        date ? `Date: ${date}` : null,
        virtual ? 'Format: Virtual run' : `Location: ${str(d.location) ?? 'TBA'}`,
        str(d.category_name) ? `Category: ${str(d.category_name)}` : null,
        link,
      ]
        .filter(Boolean)
        .join('\n'),
    }
  }

  if (job.kind === 'results_published') {
    const rank = str(d.rank)
    const km = d.total_km === null || d.total_km === undefined ? null : Number(d.total_km)
    const content =
      `<p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.6;">Hi ${escapeHtml(name)}, the organizer has published the official results for <strong>${escapeHtml(eventName)}</strong>.</p>` +
      (rank
        ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 8px;"><tr>` +
          `<td style="padding:16px;border-radius:12px;background:#f0fdfa;text-align:center;width:50%;"><div style="color:#0f766e;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Your rank</div><div style="color:#111827;font-size:30px;font-weight:800;">#${escapeHtml(rank)}</div></td>` +
          `<td style="width:12px;"></td>` +
          `<td style="padding:16px;border-radius:12px;background:#f9fafb;text-align:center;width:50%;"><div style="color:#6b7280;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Distance</div><div style="color:#111827;font-size:30px;font-weight:800;">${km !== null && Number.isFinite(km) ? escapeHtml(km.toFixed(2)) : '—'}<span style="font-size:14px;color:#6b7280;"> km</span></div></td>` +
          `</tr></table>`
        : '') +
      button(link, 'See the leaderboard')
    return {
      subject: `Results are out: ${eventName}`,
      html: layout({ preheader: job.body, heading: 'Results are out', content, footer }),
      text: [`Hi ${name}, results for ${eventName} are now published.`, job.body, link].filter(Boolean).join('\n'),
    }
  }

  if (job.kind === 'broadcast') {
    const content =
      `<p style="margin:0 0 18px;color:#6b7280;font-size:13px;">Message from the organizer of <strong style="color:#111827;">${escapeHtml(eventName)}</strong></p>` +
      paragraphs(job.body) +
      button(link, 'Open event')
    return {
      subject: `[${eventName}] ${job.title}`,
      html: layout({ preheader: job.body.slice(0, 120), heading: job.title, content, footer }),
      text: [`Message from the organizer of ${eventName}`, '', job.title, '', job.body, link].filter((l) => l !== null).join('\n'),
    }
  }

  return null
}

/** JSON the service worker's `push` handler reads (src/lib/notifications/push-payload.ts). */
export function buildPushPayload(job: NotificationJob): string {
  const body = job.body.length > 300 ? `${job.body.slice(0, 297)}…` : job.body
  return JSON.stringify({
    id: job.id,
    title: job.title.slice(0, 120),
    body,
    url: job.url ?? '/runner/notifications',
    // one confirmation/results card per event replaces itself; broadcasts stack
    tag: job.kind === 'broadcast' || !job.event_id ? `${job.kind}:${job.id}` : `${job.kind}:${job.event_id}`,
  })
}
