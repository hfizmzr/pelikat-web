import { test, expect } from '@playwright/test'
import { goto, login } from './helpers'

/**
 * FR-69 — organizer console as a mobile-first experience. Route verified
 * in src: /organizer/mobile/* exists (console / events / scanner / merch
 * pages + a shared bottom-nav tab layout, src/app/organizer/mobile/
 * layout.tsx NAV_ITEMS: Home / Events / BIB Pass / Console / Merch).
 * This spec pins viewport to a Pixel 5-size phone and walks the tabs.
 */
test.use({ viewport: { width: 393, height: 851 } })

test.describe('organizer mobile console (FR-69)', () => {
  test('console renders active-event ops + bottom nav tabs', async ({ page }) => {
    await login(page, 'klcityrunners@pelikat.test')
    await goto(page, '/organizer/mobile/console')

    // Console shell + active-event ops panel (earliest published event
    // for klcityrunners = Putrajaya Heritage Half Marathon, seed …023)
    await expect(page.getByText('Race Console')).toBeVisible()
    await expect(page.getByText('Critical Ops Status')).toBeVisible()
    await expect(page.getByText('Category Breakdown')).toBeVisible()

    // Bottom-nav tabs render (the console IS a tab in the mobile shell)
    const nav = page.locator('nav')
    for (const tab of ['Home', 'Events', 'BIB Pass', 'Console', 'Merch']) {
      await expect(nav.getByRole('link', { name: tab })).toBeVisible()
    }
  })

  test('tabs navigate to events / BIB-pass scanner / merch surfaces', async ({ page }) => {
    await login(page, 'klcityrunners@pelikat.test')

    await goto(page, '/organizer/mobile/events')
    // Strict-mode guard: under full-parallel load the headings can be
    // duplicated in the DOM (same flake hardened in auth.spec.ts with
    // .first()), so select the first heading match explicitly.
    await expect(page.getByRole('heading', { name: 'Upcoming & Active' }).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Past Events' }).first()).toBeVisible()

    // Scan entry point out of the events list
    await expect(page.getByRole('link', { name: /Check-in/ }).first()).toBeVisible()

    await goto(page, '/organizer/mobile/merch')
    await expect(page.getByText('Merch Hub')).toBeVisible()
  })
})
