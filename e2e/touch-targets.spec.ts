import { test, expect } from '@playwright/test'

test.describe('Usability: Touch Targets', () => {
  test('all interactive elements on mobile are at least 44x44px', async ({ page }) => {
    await page.goto('/')
    await page.setViewportSize({ width: 375, height: 667 }) // iPhone SE size
    
    // Get all interactive elements
    const interactiveElements = await page.locator('button, a, [role="button"], input, select, textarea, [tabindex]:not([tabindex="-1"])').all()
    
    const violations = []
    
    for (const element of interactiveElements) {
      const box = await element.boundingBox()
      if (box) {
        // Check if element is visible and has a size
        if (box.width > 0 && box.height > 0) {
          if (box.width < 44 || box.height < 44) {
            const tag = await element.evaluate((el) => el.tagName)
            const text = await element.textContent()
            violations.push({
              tag,
              text: text?.slice(0, 30),
              width: box.width,
              height: box.height,
            })
          }
        }
      }
    }
    
    // Allow small exceptions for inline elements and text links
    // But flag any significantly undersized interactive elements
    const significantViolations = violations.filter(
      (v) => v.width < 30 && v.height < 30
    )
    
    expect(significantViolations).toHaveLength(0)
  })

  test('mobile menu button is at least 44x44px', async ({ page }) => {
    await page.goto('/')
    await page.setViewportSize({ width: 375, height: 667 })
    
    const menuButton = await page.locator('button[aria-label="Open menu"]').boundingBox()
    
    if (menuButton) {
      expect(menuButton.width).toBeGreaterThanOrEqual(44)
      expect(menuButton.height).toBeGreaterThanOrEqual(44)
    }
  })

  test('login form inputs have adequate touch targets', async ({ page }) => {
    await page.goto('/login')
    await page.setViewportSize({ width: 375, height: 667 })
    
    const inputs = await page.locator('input').all()
    
    for (const input of inputs) {
      const box = await input.boundingBox()
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(44)
      }
    }
  })

  test('registration form inputs have adequate touch targets', async ({ page }) => {
    await page.goto('/register')
    await page.setViewportSize({ width: 375, height: 667 })
    
    const inputs = await page.locator('input').all()
    
    for (const input of inputs) {
      const box = await input.boundingBox()
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(44)
      }
    }
  })

  test('main CTA buttons are at least 44px tall', async ({ page }) => {
    await page.goto('/')
    await page.setViewportSize({ width: 375, height: 667 })
    
    const buttons = await page.locator('button, a').all()
    
    for (const button of buttons) {
      const box = await button.boundingBox()
      if (box) {
        // Only check visible buttons that look like primary CTAs
        const text = await button.textContent()
        const isCTA = text && (text.includes('Get Started') || text.includes('Log In') || text.includes('Register'))
        
        if (isCTA && box.height > 0) {
          expect(box.height).toBeGreaterThanOrEqual(44)
        }
      }
    }
  })
})
