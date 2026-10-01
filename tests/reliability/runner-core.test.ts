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

describe('Polish: Registration & Emails (Phase 2)', () => {
  it('registration flow confirms profile t-shirt size (UC11 step 3)', () => {
    const actions = read(
      'src',
      'components',
      'events',
      'runner-registration-actions.tsx'
    )
    expect(actions).toContain('T-Shirt Size:')
    expect(actions).toContain('runner.tShirtSize')
    expect(actions).toContain('"/runner/profile"')

    const page = read('src', 'app', 'runner', 'events', '[id]', 'page.tsx')
    expect(page).toContain("select('id, t_shirt_size')")
    expect(page).toContain('runner={{ email: user?.email ?? null, tShirtSize: profile?.t_shirt_size ?? null }}')
  })

  it('register_for_event retries BIB assignment on unique collisions', () => {
    const migration = read(
      'supabase',
      'migrations',
      '050_register_bib_retry.sql'
    )
    expect(migration).toContain('for v_attempt in 1..3 loop')
    expect(migration).toContain('when unique_violation then')
    expect(migration).toContain("position('registrations_event_runner_unique' in sqlerrm) > 0")
    expect(migration).toContain("raise exception 'Already registered for this event'")
    // silent retry: recompute next number inside the loop and exit after insert
    expect(migration).toContain('into v_next_number')
    expect(migration).toContain('exit;')
  })

  it('transactional emails are stubbed without RESEND_API_KEY', () => {
    const fn = read(
      'supabase',
      'functions',
      'send-transactional-email',
      'index.ts'
    )
    expect(fn).toContain('RESEND_API_KEY')
    expect(fn).toContain('skipped: "email_disabled"')
    expect(fn).toContain('body.type === "registration_confirmation"')
    expect(fn).toContain('body.type === "organizer_welcome"')
    expect(fn).toContain('EMAILS_DISABLED')
  })

  it('confirmation email fires after successful registration', () => {
    const actions = read(
      'src',
      'components',
      'events',
      'runner-registration-actions.tsx'
    )
    expect(actions).toContain("invoke('send-transactional-email'")
    expect(actions).toContain("type: 'registration_confirmation'")
    expect(actions).toContain('bibNumber: data?.bib_number')
  })

  it('welcome email fires after organizer creation (UC01 step 5)', () => {
    const form = read('src', 'components', 'admin', 'organizer-form.tsx')
    expect(form).toContain("invoke('send-transactional-email'")
    expect(form).toContain("type: 'organizer_welcome'")
    expect(form).toContain('organizerEmail: contactEmail')
  })

  it('organizer slug is normalized on submit, not per keystroke', () => {
    const form = read('src', 'components', 'admin', 'organizer-form.tsx')
    // free typing + single normalization point
    expect(form).toContain('const finalSlug = generateSlug(slug)')
    expect(form).toContain('onChange={(e) => setSlug(e.target.value)}')
    // name-blur autofill only when slug is empty
    expect(form).toContain('!isEdit && !slug && setSlug(generateSlug(e.target.value))')
  })
})

describe('Polish: Analytics & Leaderboard (Phase 4)', () => {
  it('migration adds results_published gate and category to leaderboard view', () => {
    const migration = read(
      'supabase',
      'migrations',
      '051_results_publish_and_leaderboard_category.sql'
    )
    expect(migration).toContain('results_published boolean default false')
    expect(migration).toContain('r.category_id')
    expect(migration).toContain('rc.name as category_name')
    // new columns appended; old columns kept for create-or-replace compatibility
    expect(migration.indexOf('rp.gender')).toBeLessThan(migration.indexOf('r.category_id'))
  })

  it('organizer can toggle results publishing from event settings', () => {
    const actions = read('src', 'components', 'events', 'actions.ts')
    expect(actions).toContain('export async function setResultsPublished')
    expect(actions).toContain('results_published: published')

    const panel = read('src', 'components', 'events', 'event-settings-panel.tsx')
    expect(panel).toContain('resultsPublished')
    expect(panel).toContain('onCheckedChange={handleResultsToggle}')

    const page = read('src', 'app', 'organizer', 'events', '[id]', 'page.tsx')
    expect(page).toContain('resultsPublished={eventDetail.results_published ?? false}')
  })

  it('runner leaderboard is gated until results are published (FR-69)', () => {
    const page = read('src', 'app', 'runner', 'leaderboard', 'page.tsx')
    expect(page).toContain('resultsLocked')
    expect(page).toContain('Results coming soon. Stay tuned!')
    expect(page).toContain('.in(\'event_id\', publishedIds)')
  })

  it('leaderboard supports category filter alongside gender', () => {
    const page = read('src', 'app', 'runner', 'leaderboard', 'page.tsx')
    expect(page).toContain("category_id")
    expect(page).toContain(".eq('category_id', category_id)")

    const filters = read('src', 'app', 'runner', 'leaderboard', 'filters.tsx')
    expect(filters).toContain("updateParams('category_id', e.target.value)")
    // gender values match the view's M/F (was male/female — never matched)
    expect(filters).toContain('<option value="M">Male</option>')
    expect(filters).not.toContain('<option value="male">Male</option>')

    const live = read('src', 'components', 'gamification', 'live-leaderboard.tsx')
    // realtime refresh re-applies active filters instead of resetting them
    expect(live).toContain('filtersRef.current')
    expect(live).toContain("query.eq(\"category_id\", f.category_id)")
  })

  it('per-event analytics page renders category-by-gender chart (FR-33)', () => {
    const page = read('src', 'app', 'organizer', 'events', '[id]', 'analytics', 'page.tsx')
    expect(page).toContain('CategoryBreakdownChart')
    expect(page).toContain('checkInRate')
    expect(page).toContain('FR-33')

    const chart = read('src', 'components', 'organizer', 'category-breakdown-chart.tsx')
    expect(chart).toContain("from 'recharts'")
    expect(chart).toContain('dataKey="male"')
    expect(chart).toContain('dataKey="female"')
  })
})
