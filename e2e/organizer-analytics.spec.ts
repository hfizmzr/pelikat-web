import { test, expect } from '@playwright/test'
import { goto, login } from './helpers'

/**
 * FR-33–36 analytics coverage. Component truth (verified in src at the
 * time of writing):
 *   - Per-event page /organizer/events/[id]/analytics renders FOUR KPI
 *     cards (Total Registrations / Checked In + check-in rate % /
 *     Categories / Revenue) and ONE chart: CategoryBreakdownChart
 *     (stacked Male/Female/Checked In bars, FR-33 tag in the
 *     description). Shirt-size (FR-34) and age-distribution (FR-35)
 *     views are NOT on the per-event page — they live on the organizer
 *     AGGREGATE analytics under the demographics tab
 *     (/organizer/analytics + src/components/organizer/analytics-charts
 *     .tsx: Gender Distribution / Age Groups / T-Shirt Sizes). Those are
 *     covered below and the per-event absence is recorded as an honest
 *     finding in the spec header + manager report.
 */
const KL_NIGHT_RUN_ID = 'd0e5e000-0000-4000-8000-000000000021' // KL City Night Run 2026 — owner organizer account below

test('per-event analytics renders KPI cards + category/gender chart (FR-33)', async ({ page }) => {
  await login(page, 'klcityrunners@pelikat.test')
  await goto(page, `/organizer/events/${KL_NIGHT_RUN_ID}/analytics`)

  await expect(page.getByRole('heading', { name: /Analytics — KL City Night Run 2026/ })).toBeVisible()

  // KPI cards (Total Registrations, Checked In with check-in rate)
  await expect(page.getByText('Total Registrations')).toBeVisible()
  await expect(page.getByText(/check-in rate/)).toBeVisible()
  await expect(page.getByText('Checked In').first()).toBeVisible()

  // FR-33: Registrations by Race Category chart (gender + check-in breakdown)
  await expect(page.getByText('Registrations by Race Category')).toBeVisible()
  await expect(page.getByText(/Broken down by gender and check-in status/)).toBeVisible()
  // Recharts legend text for the stacked series
  await expect(page.getByText('Male').first()).toBeVisible()
  await expect(page.getByText('Female').first()).toBeVisible()
})

// Honest finding (FR-34/FR-35): shirt-size + age-distribution views are
// not part of the per-event analytics page — they are rendered by the
// organizer aggregate analytics demographics tab. Assertions here pin
// them where they actually exist.
test('organizer aggregate analytics demographics: shirt-size + age views (FR-34/35)', async ({ page }) => {
  await login(page, 'klcityrunners@pelikat.test')
  await goto(page, '/organizer/analytics')

  await expect(page.getByRole('heading', { name: 'Telemetry & Analytics' })).toBeVisible()
  // Check-in rate KPI (FR-36) on the aggregate page
  await expect(page.getByText('Check-in Rate')).toBeVisible()

  await page.getByRole('button', { name: 'demographics' }).click()
  await expect(page.getByText('Gender Distribution')).toBeVisible()
  await expect(page.getByText('Age Groups')).toBeVisible()
  await expect(page.getByText('T-Shirt Sizes')).toBeVisible()
})

// FR-34/35 author caveat: the shirt-size + age-distribution views are NOT
// rendered on the per-event analytics page — they live only on the aggregate
// hub (/organizer/analytics, demographics tab). This test pins the real
// authoring journey: from a per-event analytics page the aggregate
// demographics view is reachable through the hub nav (sidebar on desktop
// viewports, hamburger menu sheet on mobile) and renders both charts.
test('per-event analytics reaches the aggregate demographics views (FR-34/35 author caveat)', async ({ page }) => {
  await login(page, 'klcityrunners@pelikat.test')
  await goto(page, `/organizer/events/${KL_NIGHT_RUN_ID}/analytics`)
  await expect(page.getByRole('heading', { name: /Analytics — KL City Night Run 2026/ })).toBeVisible()

  // Hub nav: sidebar link exists server-side on ≥lg viewports; on mobile
  // viewports it mounts inside the hamburger Sheet.
  const analyticsLink = page.getByRole('link', { name: 'Telemetry & Analytics' })
  if ((await analyticsLink.count()) === 0) {
    await page.locator('header button').first().click()
  }
  await expect(analyticsLink).toBeVisible()
  await analyticsLink.click()

  // Radix Sheet does not auto-close on in-portal Link navigation — the modal
  // keeps the page root aria-hidden (role queries can't see page headings
  // until it is dismissed), so close it before asserting.
  await page.waitForURL((url) => url.pathname === '/organizer/analytics', { timeout: 15000 })
  await page.keyboard.press('Escape')

  await expect(page.getByRole('heading', { name: 'Telemetry & Analytics' })).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: 'demographics' }).click()
  await expect(page.getByText('T-Shirt Sizes')).toBeVisible()
  await expect(page.getByText('Age Groups')).toBeVisible()
})
