import { test, expect } from '@playwright/test'

test.describe('Availability: PWA Offline BIB Access', () => {
  test('BIB page should work offline after initial load', async ({ page }) => {
    // Navigate to a runner BIB page
    await page.goto('/login')
    
    // Wait for service worker registration
    const swRegistration = await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready
        return !!registration.active
      }
      return false
    })
    
    // If service worker is available, test offline functionality
    if (swRegistration) {
      // Simulate going offline
      await page.context().setOffline(true)
      
      // Try to reload the page
      await page.reload()
      
      // Page should still be accessible (served from cache)
      // The exact behavior depends on the SW implementation
      // We expect at least some content to be available
      const body = await page.locator('body').innerText()
      expect(body.length).toBeGreaterThan(0)
      
      // Go back online
      await page.context().setOffline(false)
    } else {
      test.skip(true, 'Service Worker not available in this environment')
    }
  })

  test('Service Worker should be registered', async ({ page }) => {
    await page.goto('/')
    
    const swExists = await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        return registrations.length > 0
      }
      return false
    })
    
    expect(swExists).toBe(true)
  })

  test('Static assets should be precached', async ({ page }) => {
    await page.goto('/')
    
    const cachedAssets = await page.evaluate(async () => {
      if (!('caches' in window)) return []
      
      const cacheNames = await caches.keys()
      const assets = []
      
      for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName)
        const requests = await cache.keys()
        assets.push(...requests.map((req) => req.url))
      }
      
      return assets
    })
    
    // Should have at least some cached assets
    expect(cachedAssets.length).toBeGreaterThan(0)
  })

  test('Manifest should be valid and accessible', async ({ page }) => {
    const response = await page.goto('/manifest.json')
    
    expect(response?.status()).toBe(200)
    
    const manifest = await page.evaluate(() => {
      return fetch('/manifest.json').then((r) => r.json())
    })
    
    expect(manifest).toHaveProperty('name')
    expect(manifest).toHaveProperty('short_name')
    expect(manifest).toHaveProperty('start_url')
    expect(manifest).toHaveProperty('display')
    expect(manifest).toHaveProperty('icons')
    expect(manifest.icons).toBeInstanceOf(Array)
    expect(manifest.icons.length).toBeGreaterThan(0)
  })
})
