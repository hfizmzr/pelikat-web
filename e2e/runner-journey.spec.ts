// Covers: FR-47 (UC11 My Registration), FR-67–FR-68 (UC15 leaderboard + publish gate) — runner journey on a published virtual event

import { test, expect } from '@playwright/test'
import { goto, login } from './helpers'

/**
 * Slug pin (how it was found): slugs are NOT seeded — migrations 077/080
 * auto-derive them as kebab-case(name) + '-' + md5(event_id)[:8] (seed.sql
 * §5.1 documents this). For event id d0e5e000-0000-4000-8000-000000000027
 * ("JB Ultra Marathon 2027", the FUTURE physical event whose seeded reg
 * window stays open until ~Jan 2027) that is:
 *   kebab("JB Ultra Marathon 2027") + '-' + md5(id)[:8] = "d97c91d8"
 * Verified live against the running app: /events/<slug> 200 + <title>.
 * (Originally pinned to Cyberjaya Green Run, whose seed window
 * `current_date + 23` expired 12 Nov 2026 — remote Supabase staging is
 * read-only for agents, so the pin moved to a long-window FUTURE event.)
 */
const JB_ULTRA_SLUG = 'jb-ultra-marathon-2027-d97c91d8'

/**
 * runner1's registered active event (seeded registration 07c — seed.sql:814,
 * paid — → event id d0e5e000-0000-4000-8000-000000000025 "Virtual 60K Straits
 * Challenge").
 */
const VIRTUAL_60K_ID = 'd0e5e000-0000-4000-8000-000000000025'
/**
 * Scoped leaderboard needs a results-PUBLISHED event (unpublished ones show
 * "Results coming soon"). Merdeka Virtual Run Challenge (seed id ...22, closed
 * + published) — runner1 (Adam Faizal bin Harun) is seeded rank #1.
 */
const MERDEKA_ID = 'd0e5e000-0000-4000-8000-000000000022'

test('runner sees the public event page', async ({ page }) => {
  await goto(page, `/events/${JB_ULTRA_SLUG}`)
  await expect(page.getByRole('heading', { name: 'JB Ultra Marathon 2027' })).toBeVisible()
  await expect(page.getByText('About the Race')).toBeVisible()
  // published + inside the reg window → registration CTA
  await expect(page.getByRole('link', { name: 'Register for this Event' })).toBeVisible()
})

test.describe('runner1 authenticated journey', () => {
  test('registered event shows registration + leaderboard entry points', async ({ page }) => {
    await login(page, 'runner1@pelikat.test')
    await goto(page, `/runner/events/${VIRTUAL_60K_ID}`)
    await expect(page.getByRole('heading', { name: 'My Registration' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Event Leaderboard' })).toBeVisible()
  })

  test('leaderboard shows virtual rankings with the runner listed', async ({ page }) => {
    await login(page, 'runner1@pelikat.test')
    await goto(page, `/runner/leaderboard?event_id=${MERDEKA_ID}`)
    await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible()
    // runner1 is Adam Faizal bin Harun (seed) — ranked #1 on this event
    await expect(page.getByText('Global Rankings')).toBeVisible()
    await expect(page.getByText('Adam Faizal bin Harun')).toBeVisible()
  })
})
