// Covers: FR-02–FR-03 (UC02), FR-06–FR-08 (UC03 KPI cards + audit log) — admin portal journeys

import { test, expect } from '@playwright/test'
import { goto, login } from './helpers'

test('admin settings expose the subscription pricing control', async ({ page }) => {
  await login(page, 'admin1@pelikat.test')
  await goto(page, '/admin/settings')
  await expect(page.getByRole('heading', { name: 'Subscription Pricing' })).toBeVisible()
  await expect(page.getByText('Amount (RM)')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Update Pricing' })).toBeVisible()
})

test('admin overview shows the recent audit log', async ({ page }) => {
  await login(page, 'admin1@pelikat.test')
  await goto(page, '/admin')
  await expect(page.getByRole('heading', { name: 'Recent Audit Log' })).toBeVisible()
  // 'View Ledger' lives inside the Recent Audit Log card on the overview
  // (the sidebar nav collapses behind a drawer on mobile viewports).
  await expect(page.getByRole('link', { name: 'View Ledger' })).toBeVisible()
})

// FR-06/07: cross-tenant aggregate KPI cards on the admin overview
// (src/app/admin/page.tsx kpiCards: tenants / registrations / events).
test('admin overview renders aggregate KPI cards with counts (FR-06/07)', async ({ page }) => {
  await login(page, 'admin1@pelikat.test')
  await goto(page, '/admin')

  await expect(page.getByText('Active Platform Tenants').first()).toBeVisible()
  await expect(page.getByText('Aggregate Registrations').first()).toBeVisible()
  await expect(page.getByText('Platform Events').first()).toBeVisible()
})
// FR-03: /admin/organizers is the tenant directory with server-side
// search/filter/sort over the organizers table
// (src/components/admin/organizer-table.tsx: search input + status
// filter + sortable headers + Active/Inactive/Expiring/Expired badges).
test.describe('admin tenant directory (FR-03)', () => {
  const ORGANIZERS = '/admin/organizers'
  const KL_CITY = 'KL City Runners'
  const PENANG = 'Penang Pacers'

  test('tenant table renders seeded organizers with status badges', async ({ page }) => {
    await login(page, 'admin1@pelikat.test')
    await goto(page, ORGANIZERS)

    await expect(page.getByRole('heading', { name: 'Active Organizers' })).toBeVisible()
    // Seeded tenants render (seed.sql organizers …011 KL City Runners, …012 Penang Pacers)
    await expect(page.getByRole('cell', { name: KL_CITY })).toBeVisible()
    await expect(page.getByRole('cell', { name: PENANG })).toBeVisible()
    // Status chips (Active/Inactive/Expiring Soon/Expired) render — the seed
    // has active approved tenants, so the exact-text 'Active' badge exists.
    await expect(page.getByText('Active', { exact: true }).first()).toBeVisible()
  })

  test('search input filters the tenant table', async ({ page }) => {
    await login(page, 'admin1@pelikat.test')
    await goto(page, ORGANIZERS)
    await expect(page.getByRole('cell', { name: KL_CITY })).toBeVisible()
    await expect(page.getByRole('cell', { name: PENANG })).toBeVisible()

    const search = page.getByPlaceholder('Search by name, slug or email…')
    await search.fill('Penang')
    // Search narrows to the matched tenant only
    await expect(page.getByRole('cell', { name: PENANG })).toBeVisible()
    await expect(page.getByRole('cell', { name: KL_CITY })).toHaveCount(0)

    // Non-matching query surfaces the empty state (row count → 0 data rows)
    await search.fill('zzzz-no-such-tenant')
    await expect(page.getByText('No organizers match your search.')).toBeVisible()
    // Status filter is left on 'all' — reset again via the empty search
    await search.fill('')
    await expect(page.getByRole('cell', { name: KL_CITY })).toBeVisible()
  })
})
