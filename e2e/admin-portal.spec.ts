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
