import { test, expect } from '@playwright/test'

test.describe('Usability: Touch Targets', () => {
  test('primary CTA buttons are at least 44px tall on landing', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.setViewportSize({ width: 375, height: 667 })

    // Find the Get Started CTA — on mobile it may be in the hamburger sheet
    const getStarted = page.locator('a:has-text("Get Started")').first()
    const visible = await getStarted.isVisible().catch(() => false)
    if (!visible) {
      test.skip(true, 'Get Started CTA not visible on mobile landing')
      return
    }

    const box = await getStarted.boundingBox()
    if (box) {
      expect(box.height, `Get Started CTA too short: ${box.height}px`).toBeGreaterThanOrEqual(44)
    }
  })

  test('mobile menu button is at least 44x44px', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.setViewportSize({ width: 375, height: 667 })

    const menuButton = page.locator('button[aria-label="Open menu"]')
    await expect(menuButton).toBeVisible()

    const box = await menuButton.boundingBox()
    if (box) {
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
  })

  test('login form inputs have adequate touch targets', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await page.setViewportSize({ width: 375, height: 667 })

    const inputs = page.locator('input:visible')
    const count = await inputs.count()
    if (count === 0) {
      test.skip(true, 'No visible input elements on login page')
      return
    }

    for (let i = 0; i < count; i++) {
      const box = await inputs.nth(i).boundingBox()
      if (box) {
        expect(box.height, `Input ${i} on login page is too short: ${box.height}px`).toBeGreaterThanOrEqual(44)
      }
    }
  })

  test('registration form inputs have adequate touch targets', async ({ page }) => {
    await page.goto('/register')
    await page.waitForLoadState('networkidle')
    await page.setViewportSize({ width: 375, height: 667 })

    const inputs = page.locator('input:visible')
    const count = await inputs.count()
    if (count === 0) {
      test.skip(true, 'No visible input elements on register page')
      return
    }

    for (let i = 0; i < count; i++) {
      const box = await inputs.nth(i).boundingBox()
      if (box) {
        expect(box.height, `Input ${i} on register page is too short: ${box.height}px`).toBeGreaterThanOrEqual(44)
      }
    }
  })

  test('main CTA buttons are at least 44px tall', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.setViewportSize({ width: 375, height: 667 })

    const ctaButton = page.locator('a:has-text("Get Started"), button:has-text("Get Started")').first()
    const visible = await ctaButton.isVisible().catch(() => false)
    if (!visible) {
      test.skip(true, 'Get Started CTA not visible on mobile landing')
      return
    }

    const box = await ctaButton.boundingBox()
    if (box) {
      expect(box.height, `Get Started CTA too short: ${box.height}px`).toBeGreaterThanOrEqual(44)
    }
  })
})
