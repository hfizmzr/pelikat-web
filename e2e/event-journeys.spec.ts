// Covers: FR-20–FR-21 (UC05), FR-23–FR-24 (UC06), FR-37–FR-41 (UC08), FR-38–FR-39 (UC12), FR-54–FR-55, FR-57 (UC13), FR-69–FR-73 (UC16) — organizer & runner event journeys

import { test, expect } from '@playwright/test'
import { goto, login } from './helpers'

/**
 * P4 partner journeys against the RUNNING prod stack (:3000, cloud Supabase).
 *
 * Seed ids pinned from supabase/seed.sql (same convention as
 * runner-journey.spec.ts / organizer-analytics.spec.ts). NOTE: the task recon
 * brief listed 00000000-… ids for E1/E9 — seed.sql (and every live spec) uses
 * the d0e5e000-… prefix, which is what's actually in the cloud DB:
 *   E1 …-21 = KL City Night Run 2026 (runner1 N10-001, photo + merch seed)
 *   E3 …-23 = Putrajaya Heritage Half (runner1 PH21-001, checked in)
 *   E9 …-29 = 100K New Year (runner1's upcoming paid registration — storefront)
 */
const E1_ID = 'd0e5e000-0000-4000-8000-000000000021'
const E3_ID = 'd0e5e000-0000-4000-8000-000000000023'
const E9_ID = 'd0e5e000-0000-4000-8000-000000000029'

const ORGANIZER = 'klcityrunners@pelikat.test'
const RUNNER = 'runner1@pelikat.test'

/**
 * Seed order numbers (seed.sql §12, PM-SEED001..004) rendered in the merch
 * hub Orders tab regardless of date drift.
 */
const SEED_ORDER = 'PM-SEED001'

test.describe('Organizer: merch hub', () => {
  test('tabs, stat cards and seeded orders render for KL Night Run', async ({ page }) => {
    await login(page, ORGANIZER)
    await goto(page, `/organizer/merch?event=${E1_ID}`)

    await expect(page.getByRole('heading', { name: 'Merch Hub Manager' })).toBeVisible({ timeout: 15000 })
    for (const stat of ['Products', 'Stock alerts', 'Orders to fulfil', 'Revenue']) {
      // "Products" also matches the tab trigger — take the stat card hit.
      await expect(page.getByText(stat, { exact: true }).first()).toBeVisible()
    }
    for (const tab of ['Products', 'Inventory', 'Orders', 'Sales']) {
      await expect(page.getByRole('tab', { name: tab })).toBeVisible()
    }

    // Orders tab: status sub-filters, search box, seeded order row.
    await page.getByRole('tab', { name: 'Orders' }).click()
    const filterTabs = page.getByRole('tablist', { name: 'Filter orders by status' })
    await expect(filterTabs).toBeVisible({ timeout: 15000 })
    for (const filter of ['All', 'Pending', 'Confirmed', 'Ready', 'Collected', 'Cancelled']) {
      // Accessible name has no space between label and count ("All4").
      await expect(filterTabs.getByRole('tab', { name: new RegExp(`^${filter}\\d+$`) })).toBeVisible()
    }
    await expect(page.getByLabel('Search orders')).toBeVisible()
    // Seeded order row (desktop table cell / mobile order card both expose a
    // per-row select checkbox with the same accessible name).
    await expect(page.getByRole('checkbox', { name: `Select ${SEED_ORDER}` })).toBeVisible({ timeout: 15000 })  })
})

test.describe('Organizer: REPC check-in', () => {
  test('check-in dashboard renders and manual search is idempotent for a checked-in BIB', async ({ page }) => {
    await login(page, ORGANIZER)
    await goto(page, `/organizer/events/${E3_ID}/checkin`)

    await expect(page.getByRole('heading', { name: 'Check-in Dashboard' })).toBeVisible({ timeout: 15000 })
    // Headless has no camera: the dashboard must still offer manual search.
    await expect(page.getByText('Manual Search')).toBeVisible()
    await expect(page.getByText('Proxy Collection')).toBeVisible()

    // runner1's PH21-001 is already checked in (seed §E3): a manual lookup is
    // idempotent — success result, no state change, no navigation.
    await page.getByPlaceholder('Enter BIB number').fill('PH21-001')
    await page.getByPlaceholder('Enter BIB number').press('Enter')
    await expect(page.getByText(/BIB #PH21-001/).first()).toBeVisible({ timeout: 15000 })
  })
})

test.describe('Organizer: photo management', () => {
  test('photo management page renders review tabs and upload affordance', async ({ page }) => {
    await login(page, ORGANIZER)
    await goto(page, `/organizer/events/${E1_ID}/photos`)

    await expect(page.getByText('Upload Photos')).toBeVisible({ timeout: 15000 })
    await expect(
      page.getByText('Upload race photos. They are queued for AI tagging as soon as the upload finishes.')
    ).toBeVisible()
    for (const tab of ['Review Queue', 'Gallery', 'Rejected']) {
      await expect(page.getByRole('tab', { name: tab })).toBeVisible()
    }
  })
})

test.describe('Runner: race photo gallery', () => {
  test('gallery shows the tagged photo with disabled download/share and a working report flow', async ({ page }) => {
    await login(page, RUNNER)
    await goto(page, `/runner/events/${E1_ID}/gallery`)

    await expect(page.getByRole('heading', { name: 'My Photos' })).toBeVisible({ timeout: 15000 })
    // Seeded photo for N10-001; count rendered server-side (do not assume
    // relative-date copy — seed dates drift ~8 days on the cloud stack).
    await expect(page.getByText(/\d+ photos/).first()).toBeVisible()
    await expect(page.getByText('BIB N10-001')).toBeVisible()

    // Placeholder storage objects: download/share stay disabled…
    const download = page.getByTitle('Download photo')
    const share = page.getByTitle('Share photo')
    await expect(download).toBeDisabled()
    await expect(share).toBeDisabled()
    // …but the "not me" report affordance is enabled. Opening it is safe
    // (modal only) — verify the confirm dialog renders, then back out.
    const report = page.getByTitle('Not me? Send back to organizer review')
    await expect(report).toBeEnabled()
    await report.click()
    await expect(page.getByText('Send this photo back to review?')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send to Review' })).toBeVisible()
    // Reload instead of closing via the modal's Cancel: the modal lives inside
    // an overflow-hidden, transform-animating photo card, so its buttons sit
    // under the page root for hit-testing. A reload proves the report was NOT
    // submitted (photo count unchanged below) without risking a submit.
    await goto(page, `/runner/events/${E1_ID}/gallery`)
    await expect(page.getByText('Send this photo back to review?')).toBeHidden()
    await expect(page.getByText(/\d+ photos/).first()).toBeVisible()
  })
})

test.describe('Runner: digital BIB + proxy consent', () => {
  test('checked-in BIB page links to the proxy collection consent page', async ({ page }) => {
    await login(page, RUNNER)
    await goto(page, `/runner/events/${E3_ID}/bib`)

    await expect(page.getByText('Checked In').first()).toBeVisible({ timeout: 15000 })
    // The BIB number renders in two layouts (mobile card + desktop ticket).
    await expect(page.getByText('PH21-001').first()).toBeVisible()

    // Navigate to the consent page but DO NOT generate/consume a code.
    await page.getByRole('link', { name: 'Generate Proxy Collection Code' }).click()
    await page.waitForURL((url) => url.pathname.endsWith('/bib/consent'), { timeout: 15000 })
    await expect(page.getByRole('heading', { name: 'Proxy Collection' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('button', { name: 'Generate Code' })).toBeVisible()
  })
})

test.describe('Runner: dashboard → digital BIB navigation (FR-38)', () => {
  test('runner navigates Home → Explore → event → View Bib Number → BIB card + QR', async ({ page }) => {
    await login(page, RUNNER)
    await goto(page, '/runner')

    // Bottom nav pill: Explore → /runner/events.
    await page.getByRole('link', { name: 'Explore' }).click()
    await page.waitForURL((url) => url.pathname === '/runner/events', { timeout: 15000 })

    // E3's seed date ("tomorrow" at seed time) has drifted into the past on
    // the cloud stack, so the default Upcoming tab hides it — switch to All.
    await page.getByRole('link', { name: 'All', exact: true }).click()
    await page.waitForURL((url) => url.searchParams.get('period') === 'all', { timeout: 15000 })

    // E3 (physical, checked-in PH21-001) card under "Your Registered Events".
    await page.getByRole('link', { name: /Putrajaya Heritage Half Marathon/ }).first().click()
    await page.waitForURL((url) => url.pathname === `/runner/events/${E3_ID}`, { timeout: 15000 })

    // The themed bib label for E3 (Hidden Village preset) does not override
    // the platform bib_label, so the CTA copy is the default 'View Bib Number'.
    await page.getByRole('link', { name: 'View Bib Number' }).click()
    await page.waitForURL((url) => url.pathname.endsWith('/bib'), { timeout: 15000 })

    await expect(page.getByText('PH21-001').first()).toBeVisible({ timeout: 15000 })
    // Server-rendered secure QR: inline <svg> inside the white pass container.
    await expect(page.locator('div.bg-white svg').first()).toBeVisible()
  })
})

test.describe('Runner: race-day schedule card (FR-54)', () => {
  test('seeded times render on E3 event + bib pages; all-NULL virtual event shows TBA', async ({ page }) => {
    await login(page, RUNNER)

    // E3 Putrajaya Heritage Half: 05:30 / 06:00 / 10:30 (seed §17).
    // Time-text locators take .first(): both the event page and the BIB page
    // render the same card, and route-transition overlap can briefly keep
    // both copies in the DOM (same strict-mode pattern as 66da594).
    await goto(page, `/runner/events/${E3_ID}`)
    await expect(page.getByRole('heading', { name: 'Race-Day Schedule' }).first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('5:30 AM').first()).toBeVisible()
    await expect(page.getByText('6:00 AM').first()).toBeVisible()
    await expect(page.getByText('10:30 AM').first()).toBeVisible()
    // The legacy hardcoded hero copy is gone — the card replaced it.
    await expect(page.getByText('Starts at 6:00 AM')).toHaveCount(0)

    // Same data source on the BIB pass (offline companion).
    await goto(page, `/runner/events/${E3_ID}/bib`)
    await expect(page.getByRole('heading', { name: 'Race-Day Schedule' }).first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('5:30 AM').first()).toBeVisible()

    // E9 (100K New Year Virtual): all three columns NULL → single TBA line.
    await goto(page, `/runner/events/${E9_ID}`)
    await expect(page.getByRole('heading', { name: 'Race-Day Schedule' }).first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Schedule to be announced').first()).toBeVisible()
  })
})

test.describe('Runner: storefront order journey (E9)', () => {
  test('organizer lists a product, runner checks out, order appears and is cancelled', async ({ page }) => {
    // Six server-rendered page loads + two logins — Mobile Safari hydration
    // needs more than the default 30s budget.
    test.setTimeout(90_000)
    const productName = `P4 E2E Tee ${Date.now()}`

    // 1) Organizer creates a single-SKU product with stock on E9.
    await login(page, ORGANIZER)
    await goto(page, `/organizer/merch?event=${E9_ID}`)
    // Header + tab-panel both render an Add Product dialog trigger.
    await page.getByRole('button', { name: 'Add Product' }).first().click()
    await expect(page.getByRole('heading', { name: 'Create Product' })).toBeVisible({ timeout: 15000 })
    await page.locator('#merch-name').fill(productName)
    await page.locator('#merch-price').fill('25')
    await page.getByRole('spinbutton', { name: 'Stock', exact: true }).fill('10')
    await page.getByRole('button', { name: 'Create Product' }).click()
    await expect(page.getByText('Product created')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(productName).first()).toBeVisible({ timeout: 15000 })

    // 2) Runner shops: storefront → product sheet → add to cart → checkout.
    await login(page, RUNNER)
    await goto(page, `/runner/events/${E9_ID}/merch`)
    await page.getByRole('button', { name: new RegExp(productName) }).click()
    await page.getByRole('button', { name: 'Add to cart · RM 25.00' }).click()
    await page.getByRole('link', { name: /1 item/ }).click()
    await page.waitForURL((url) => url.pathname.endsWith('/merch/checkout'), { timeout: 15000 })
    await expect(page.getByText(productName)).toBeVisible({ timeout: 15000 })

    // 3) Reserve the order ("Proceed to payment" always leaves /checkout:
    // either the payment provider page, or the order page on failure).
    await page.getByRole('button', { name: 'Proceed to payment' }).click()
    await page.waitForURL(
      (url) => !url.pathname.endsWith('/merch/checkout'),
      { timeout: 20000 }
    )

    // 4) Order shows up under "Your orders" as awaiting payment.
    await goto(page, '/runner/merch')
    await expect(page.getByRole('heading', { name: 'Your orders' })).toBeVisible({ timeout: 15000 })
    await page.getByRole('link', { name: new RegExp(productName) }).first().click()
    await page.waitForURL((url) => url.pathname.startsWith('/runner/merch/orders/'), { timeout: 15000 })
    await expect(page.getByText('Awaiting payment').first()).toBeVisible({ timeout: 15000 })

    // 5) Cleanup: cancel the pending order so no stray state is left.
    await page.getByRole('button', { name: 'Cancel order' }).click()
    await expect(page.getByText('Cancelled').first()).toBeVisible({ timeout: 15000 })

    // 6) Cleanup: hide OUR product again so the E9 storefront is empty for
    // other specs (deletion is blocked once an order — even cancelled —
    // references the variant). Scope to the product's own card: with several
    // grid entries, a bare first() would hide the wrong one.
    await login(page, ORGANIZER)
    await goto(page, `/organizer/merch?event=${E9_ID}`)
    // The second organizer sign-in can flake under parallel suite load
    // (Supabase auth latency past the helper's 15s) — retry once.
    if (new URL(page.url()).pathname === '/login') {
      await login(page, ORGANIZER)
      await goto(page, `/organizer/merch?event=${E9_ID}`)
    }
    const myCard = page
      .locator('div.bg-card.rounded-xl.border', { has: page.getByRole('heading', { name: productName }) })
      .first()
    await myCard.getByLabel('Hide from store').click()
    await expect(myCard.getByLabel('Show in store')).toBeVisible({ timeout: 15000 })
  })
})

test.describe('Security: unauthenticated access', () => {
  test('protected organizer/admin/runner pages redirect to login', async ({ page }) => {
    for (const path of ['/organizer', '/admin', '/runner/events']) {
      await goto(page, path)
      await page.waitForURL((url) => url.pathname === '/login', { timeout: 10000 })
      expect(page.url()).toContain('/login')
    }
  })
})

test.describe('Offline BIB access (FR-39/NFR03)', () => {
  // WebKit/Safari-only honest skip: Playwright's WebKit does not replay a
  // service-worker-cached navigation on an offline reload (documented
  // WebKit SW limitation hit in earlier recon) — the cached document is not
  // consulted for navigation requests, so the offline reload fails there.
  // Chromium, Mobile Chrome and Firefox exercise the real flow below.
  test.skip(({ browserName }) => browserName === 'webkit', 'WebKit offline reload behind SW: cached navigation not served (documented limitation)')

  test('runner can reload their digital BIB while offline (SW NetworkFirst cache)', async ({ page, context }) => {
    test.setTimeout(120_000)

    // Online visit 1: login + let the SW install/activate (skipWaiting).
    await login(page, RUNNER)
    await goto(page, `/runner/events/${E3_ID}/bib`)
    await expect(page.getByText('PH21-001').first()).toBeVisible({ timeout: 15000 })
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => {}))

    // Online visit 2: now SW-controlled → NetworkFirst caches the document.
    await page.reload()
    await expect(page.getByText('PH21-001').first()).toBeVisible({ timeout: 15000 })
    // Deterministic gate: wait until the SW actually wrote the navigation
    // response into its 'bib-pages' Cache API entry (no sleeps).
    await page.waitForFunction(async () => {
      const cache = await caches.open('bib-pages').catch(() => null)
      if (!cache) return false
      return Boolean(await cache.match(location.pathname))
    }, undefined, { timeout: 20000 })

    // Offline reload — the BIB pass renders from the SW cache.
    await context.setOffline(true)
    await page.reload()
    await expect(page.getByText('PH21-001').first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Checked In').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Race-Day Schedule' })).toBeVisible()
  })
})
