import { test, expect } from '@playwright/test'
import { goto, login } from './helpers'

/**
 * klcityrunners' published active event (seed id ...25, custody of organizer
 * d0e5e000-0000-4000-8000-000000000011). Its SEED baseline is Custom — seed.sql
 * never assigns event 25 a theme_preset_id (only E1 → Batik Heritage and
 * E3 → Hidden Village), so any preset-carrying state here is test drift. The
 * run switches the draft to "Batik Heritage" (a real dirty-state cycle ending
 * in a verified save), then restores the null/Custom baseline.
 *
 * Local multi-project runs must pass --workers=1 or expect event-25
 * saved-preset state clobber across projects (CI is safe: workers 1, retries 2).
 */
const EVENT_ID = 'd0e5e000-0000-4000-8000-000000000025'
const THEME_URL = `/organizer/events/${EVENT_ID}`

const batikCard = (page: import('@playwright/test').Page) =>
  page.locator('button', { has: page.locator('p', { hasText: 'Batik Heritage' }) }).first()
// The Custom card is the null-preset target ("Platform + your overrides").
const customCard = (page: import('@playwright/test').Page) =>
  page.locator('button', { hasText: 'Platform + your overrides' }).first()

test('organizer selects a theme preset and saves it', async ({ page }) => {
  // Up to three serialized save round-trips (recover + verify + cleanup) —
  // allow for slow dev-server SSR under the parallel multi-project run.
  test.setTimeout(90000)
  await login(page, 'klcityrunners@pelikat.test')
  await goto(page, THEME_URL)
  await page.getByRole('tab', { name: 'Theme' }).click()
  await expect(page.getByText('Live preview')).toBeVisible()

  const batik = batikCard(page)
  const save = page.getByRole('button', { name: 'Save theme' })

  // Leftover-state guard: a crashed earlier run can leave Batik saved — then
  // selecting it would be a no-op (already the baseline). Restore the true
  // seed baseline (no preset) first so the run below always exercises a real
  // preset switch.
  if ((await batik.getAttribute('aria-pressed')) === 'true') {
    await customCard(page).click()
    await save.click()
    await expect(page.getByText('Unsaved changes')).toBeHidden({ timeout: 10000 })
  }

  await batik.click()
  await expect(batik).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Unsaved changes')).toBeVisible()

  // Save → dirty badge clears and the button re-disables.
  await save.click()
  await expect(page.getByText('Unsaved changes')).toBeHidden({ timeout: 10000 })
  await expect(save).toBeDisabled()

  // Cleanup: restore the seeded no-preset (Custom) baseline so the spec is
  // repeatable and leave-no-trace.
  await customCard(page).click()
  await save.click()
  await expect(page.getByText('Unsaved changes')).toBeHidden({ timeout: 10000 })
})
