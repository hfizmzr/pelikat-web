import { test, expect } from '@playwright/test'
import { goto, login } from './helpers'

/**
 * klcityrunners' published active event (seed id ...25, custody of organizer
 * d0e5e000-0000-4000-8000-000000000012). Its seeded saved preset is "Wizard
 * Academy", so switching the draft to "Batik Heritage" is a real dirty-state
 * cycle that ends with a verified save.
 */
const EVENT_ID = 'd0e5e000-0000-4000-8000-000000000025'
const THEME_URL = `/organizer/events/${EVENT_ID}`

test('organizer selects a theme preset and saves it', async ({ page }) => {
  // Three serialized save round-trips (recover + verify + cleanup) — allow
  // for slow dev-server SSR under the parallel multi-project run.
  test.setTimeout(90000)
  await login(page, 'klcityrunners@pelikat.test')
  await goto(page, THEME_URL)
  await page.getByRole('tab', { name: 'Theme' }).click()
  await expect(page.getByText('Live preview')).toBeVisible()

  const batik = page.locator('button', {
    has: page.locator('p', { hasText: 'Batik Heritage' }),
  }).first()

  // Leftover-state guard: a crashed earlier run can leave Batik saved — then
  // selecting it would be a no-op (already the baseline). Restore first so the
  // run below always exercises a real preset switch.
  if ((await batik.getAttribute('aria-pressed')) === 'true') {
    const restore = page.locator('button', {
      has: page.locator('p', { hasText: 'Wizard Academy' }),
    }).first()
    await restore.click()
    const recover = page.getByRole('button', { name: 'Save theme' })
    await recover.click()
    await expect(page.getByText('Unsaved changes')).toBeHidden({ timeout: 10000 })
  }

  await batik.click()
  await expect(batik).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Unsaved changes')).toBeVisible()

  // Save → dirty badge clears and the button re-disables.
  const save = page.getByRole('button', { name: 'Save theme' })
  await save.click()
  await expect(page.getByText('Unsaved changes')).toBeHidden({ timeout: 10000 })
  await expect(save).toBeDisabled()

  // Cleanup: restore the seeded preset so the spec is repeatable.
  const wizard = page.locator('button', {
    has: page.locator('p', { hasText: 'Wizard Academy' }),
  }).first()
  await wizard.click()
  await save.click()
  await expect(page.getByText('Unsaved changes')).toBeHidden({ timeout: 10000 })
})
