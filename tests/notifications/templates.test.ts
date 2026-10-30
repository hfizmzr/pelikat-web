import { describe, expect, it } from 'vitest'
import {
  buildPushPayload,
  formatEventDate,
  isDeliverableEmail,
  renderEmail,
  type NotificationJob,
} from '../../supabase/functions/_shared/notification-templates'
import { parsePushMessage, safeNotificationPath } from '@/lib/notifications/push-payload'

const SITE = 'https://app.pelikat.my/'

function job(overrides: Partial<NotificationJob>): NotificationJob {
  return {
    id: 'n1',
    kind: 'registration_confirmed',
    title: "You're in: KL Run",
    body: 'Your BIB number is A0042 · 10K',
    url: '/runner/events/e1/bib',
    event_id: 'e1',
    data: {
      runner_name: 'Abu bin Runner',
      event_name: 'KL Run',
      event_date: '2026-12-14',
      location: 'Dataran Merdeka',
      event_type: 'physical',
      category_name: '10K',
      bib_number: 'A0042',
      registration_role: 'runner',
    },
    ...overrides,
  }
}

describe('registration confirmation email (FR-29)', () => {
  it('puts the BIB number in the subject and body', () => {
    const email = renderEmail(job({}), SITE)!
    expect(email.subject).toBe('Registration confirmed: KL Run — BIB A0042')
    expect(email.html).toContain('A0042')
    expect(email.html).toContain('Mon, 14 Dec 2026')
    expect(email.html).toContain('Dataran Merdeka')
    expect(email.html).toContain('href="https://app.pelikat.my/runner/events/e1/bib"')
    expect(email.html).toContain('Hi Abu,')
    expect(email.text).toContain('BIB number: A0042')
  })

  it('virtual events have no BIB and say so', () => {
    const email = renderEmail(
      job({
        body: 'Registration confirmed · 5K',
        url: '/runner/events/e1',
        data: { event_name: 'Virtual 5K', event_type: 'virtual', bib_number: null },
      }),
      SITE
    )!
    expect(email.subject).toBe('Registration confirmed: Virtual 5K')
    expect(email.html).toContain('Virtual run')
    expect(email.html).not.toContain('Your BIB number')
  })

  it('guests without an app link get no button', () => {
    const email = renderEmail(job({ url: null }), SITE)!
    expect(email.html).not.toContain('View your digital BIB')
  })
})

describe('results email (FR-30)', () => {
  it('shows rank and distance when the runner is on the leaderboard', () => {
    const email = renderEmail(
      job({
        kind: 'results_published',
        url: '/runner/leaderboard?event_id=e1',
        data: { event_name: 'KL Run', rank: 3, total_km: 42.195 },
      }),
      SITE
    )!
    expect(email.subject).toBe('Results are out: KL Run')
    expect(email.html).toContain('#3')
    expect(email.html).toContain('42.20')
    expect(email.html).toContain('See the leaderboard')
  })
})

describe('broadcast email (FR-32)', () => {
  it('escapes organizer text and keeps paragraphs', () => {
    const email = renderEmail(
      job({
        kind: 'broadcast',
        title: 'Kit pickup <moved>',
        body: 'Hall B now.\nBring your IC.\n\n<script>alert(1)</script>',
        data: { event_name: 'KL Run' },
      }),
      SITE
    )!
    expect(email.subject).toBe('[KL Run] Kit pickup <moved>')
    expect(email.html).toContain('Kit pickup &lt;moved&gt;')
    expect(email.html).toContain('Hall B now.<br />Bring your IC.')
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;')
  })

  it('test notifications are push-only', () => {
    expect(renderEmail(job({ kind: 'test' }), SITE)).toBeNull()
  })
})

describe('helpers', () => {
  it.each([
    ['runner@gmail.com', true],
    ['runner1@pelikat.test', false],
    ['a@example.com', false],
    ['a@foo.localhost', false],
    ['not-an-email', false],
    [null, false],
  ])('isDeliverableEmail(%s) → %s', (addr, expected) => {
    expect(isDeliverableEmail(addr)).toBe(expected)
  })

  it('formats date-only values without timezone drift', () => {
    expect(formatEventDate('2026-01-01')).toBe('Thu, 1 Jan 2026')
    expect(formatEventDate(null)).toBeNull()
  })
})

describe('push payload → service worker', () => {
  it('round-trips through the SW parser', () => {
    const msg = parsePushMessage(buildPushPayload(job({})))
    expect(msg.title).toBe("You're in: KL Run")
    expect(msg.options.body).toBe('Your BIB number is A0042 · 10K')
    expect(msg.options.data).toEqual({ url: '/runner/events/e1/bib', id: 'n1' })
    expect(msg.options.tag).toBe('registration_confirmed:e1')
  })

  it('broadcasts get their own tag so they stack', () => {
    const msg = parsePushMessage(buildPushPayload(job({ kind: 'broadcast', id: 'n9' })))
    expect(msg.options.tag).toBe('broadcast:n9')
  })

  it('falls back safely on junk payloads', () => {
    expect(parsePushMessage(null).title).toBe('Pelikat')
    expect(parsePushMessage('plain text').options.body).toBe('plain text')
  })

  it.each([
    ['/runner/events/e1', '/runner/events/e1'],
    ['https://evil.example/phish', '/runner/notifications'],
    ['//evil.example', '/runner/notifications'],
    ['/\\evil.example', '/runner/notifications'],
    [42, '/runner/notifications'],
  ])('safeNotificationPath(%s) → %s', (input, expected) => {
    expect(safeNotificationPath(input)).toBe(expected)
  })
})
