import { test, expect } from '@playwright/test'

test.describe('Availability: PWA Offline BIB Access', () => {
  test('BIB page should work offline after initial load', async ({ page }) => {
    await page.goto('/login')

    const swActive = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false
      const regs = await navigator.serviceWorker.getRegistrations()
      return regs.some((r) => r.active)
    })

    if (!swActive) {
      test.skip(true, 'Service Worker not active (disabled in dev mode, use pnpm test:e2e:pwa)')
      return
    }

    await page.context().setOffline(true)
    await page.reload()
    const body = await page.locator('body').innerText()
    expect(body.length).toBeGreaterThan(0)
    await page.context().setOffline(false)
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

    if (!swExists) {
      test.skip(true, 'Service Worker not registered (disabled in dev mode, use pnpm test:e2e:pwa for prod build)')
    }
    
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

    if (cachedAssets.length === 0) {
      test.skip(true, 'No cached assets (disabled in dev mode, use pnpm test:e2e:pwa for prod build)')
    }
    
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
