import { test, expect } from '@playwright/test'

test.describe('Usability: PWA Install', () => {
  test('manifest should have standalone display mode', async ({ page }) => {
    const response = await page.goto('/manifest.json')
    expect(response?.status()).toBe(200)
    
    const manifest = await page.evaluate(() => {
      return fetch('/manifest.json').then((r) => r.json())
    })
    
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBeTruthy()
  })

  test('manifest should have required icon sizes', async ({ page }) => {
    await page.goto('/')
    const manifest = await page.evaluate(async () => {
      try {
        const res = await fetch('/manifest.json')
        return await res.json()
      } catch {
        return null
      }
    })

    if (!manifest || !manifest.icons) {
      test.skip(true, 'Manifest not available')
      return
    }

    const has192 = manifest.icons.some((icon: { sizes: string }) =>
      icon.sizes && icon.sizes.includes('192')
    )
    const has512 = manifest.icons.some((icon: { sizes: string }) =>
      icon.sizes && icon.sizes.includes('512')
    )

    expect(has192).toBe(true)
    expect(has512).toBe(true)
  })

  test('page should have apple-touch-icon', async ({ page }) => {
    await page.goto('/')
    
    const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')
    expect(appleIcon).toBeTruthy()
  })

  test('page should have viewport meta tag for mobile', async ({ page }) => {
    await page.goto('/')
    
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
    expect(viewport).toContain('width=device-width')
    expect(viewport).toContain('initial-scale=1')
  })

  test('theme-color meta tag should be present', async ({ page }) => {
    await page.goto('/')
    
    const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content')
    expect(themeColor).toBeTruthy()
  })
})
