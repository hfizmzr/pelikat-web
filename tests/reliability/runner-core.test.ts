import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf-8')

describe('Reliability: Runner Core Loop (Phase 1)', () => {
  it('proxy gates runner routes on complete profile fields', () => {
    const proxy = read('src', 'proxy.ts')

    expect(proxy).toContain("pathname !== '/runner/profile'")
    expect(proxy).toContain("select('full_name, dob, gender, phone, pdpa_agreed, ic_encrypted')")
    expect(proxy).toContain('pdpa_agreed')
    expect(proxy).toContain('ic_encrypted')
    expect(proxy).toContain("new URL('/runner/profile', request.url)")
  })

  it('run-log inserts go through the log_run RPC (server-side validation)', () => {
    const page = read('src', 'app', 'runner', 'run-log', 'page.tsx')

    expect(page).toContain("supabase.rpc('log_run'")
    expect(page).not.toContain(".from('run_logs')\n      .insert")

    const migration = read(
      'supabase',
      'migrations',
      '048_run_log_validation.sql'
    )
    expect(migration).toContain('check (coalesce(distance_km, 0) > 0 and coalesce(duration_sec, 0) > 0)')
    expect(migration).toContain('p_duration_sec / 60.0 / p_distance_km')
    expect(migration).toContain("raise exception 'Distance must be greater than 0'")
    expect(migration).toContain("raise exception 'Time must be greater than 0'")
  })

  it('duplicate registrations are blocked by DB constraint and mapped to a friendly message', () => {
    const migration = read(
      'supabase',
      'migrations',
      '049_registration_unique_runner.sql'
    )
    expect(migration).toContain('unique (event_id, runner_id)')

    const actions = read(
      'src',
      'components',
      'events',
      'runner-registration-actions.tsx'
    )
    expect(actions).toContain("error.code === '23505'")
    expect(actions).toContain("registrations_event_runner_unique")
    expect(actions).toContain('You are already registered for this event.')
  })

  it('profile page captures emergency contact and manual IC fallback', () => {
    const migration = read(
      'supabase',
      'migrations',
      '047_runner_emergency_contact.sql'
    )
    expect(migration).toContain('emergency_contact_name')
    expect(migration).toContain('emergency_contact_phone')
    // PDPA erasure wipes the new fields too
    expect(migration).toContain('emergency_contact_name = null')

    const page = read('src', 'app', 'runner', 'profile', 'page.tsx')
    expect(page).toContain('emergency_contact_name')
    expect(page).toContain('storeEncryptedIc')
    expect(page).toContain('/^\\d{6}-\\d{2}-\\d{4}$/')

    const actions = read('src', 'lib', 'actions', 'account.ts')
    expect(actions).toContain('/ai/documents/encrypt-ic')
  })

  it('django exposes the encrypt-ic endpoint behind the internal key', () => {
    const urls = read('..', 'pelikat-api', 'apps', 'documents', 'urls.py')
    expect(urls).toContain('encrypt-ic')

    const views = read('..', 'pelikat-api', 'apps', 'documents', 'views.py')
    expect(views).toContain('_encrypt_ic_number')
    expect(views).toContain('re.fullmatch')
  })
})
