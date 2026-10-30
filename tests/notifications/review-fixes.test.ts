import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (...parts: string[]) => readFileSync(path.join(process.cwd(), ...parts), 'utf8')

// PR #39 review: notifications must never break the transaction that
// queued them (payment/BIB confirmation, broadcast), and broadcasts
// serialize per event.
describe('085 notification review fixes', () => {
  const migration = read('supabase', 'migrations', '085_notifications_review_fixes.sql')

  function fn(name: string) {
    const start = migration.indexOf(`create or replace function public.${name}`)
    expect(start).toBeGreaterThanOrEqual(0)
    return migration.slice(start, migration.indexOf('$$;', start))
  }

  it('dispatch kick swallows pg_net/vault errors', () => {
    const kick = fn('kick_notification_dispatch()')
    expect(kick).toContain('exception when others then')
    expect(kick).toContain('raise warning')
  })

  it('registration trigger never aborts the payment update', () => {
    const trigger = fn('notify_registration_confirmed()')
    expect(trigger).toMatch(/exception when others then\s+[\s\S]*raise warning[\s\S]*return null;\s*end;/)
  })

  it('broadcasts lock per event before the one-per-minute guard and refuse empty sends', () => {
    const broadcast = fn('send_event_broadcast(')
    const lock = broadcast.indexOf('pg_advisory_xact_lock')
    expect(lock).toBeGreaterThan(-1)
    expect(lock).toBeLessThan(broadcast.indexOf('Double-click / spam guard'))
    expect(broadcast).toContain("raise exception 'No runners can receive this message on the selected channels'")
  })
})
