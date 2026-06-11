import { test, expect } from '@playwright/test'

test.describe('Security: Authentication', () => {
  test('unauthenticated users redirected from organizer pages', async ({ page }) => {
    await page.goto('/organizer/dashboard')
    // Middleware redirects to /login?redirect=...
    await page.waitForURL((url) => url.pathname === '/login', { timeout: 10000 })
    expect(page.url()).toContain('/login')
  })

  test('unauthenticated users redirected from admin pages', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await page.waitForURL((url) => url.pathname === '/login', { timeout: 10000 })
    expect(page.url()).toContain('/login')
  })

  test('unauthenticated users redirected from runner protected pages', async ({ page }) => {
    await page.goto('/runner/events')
    await page.waitForURL((url) => url.pathname === '/login', { timeout: 10000 })
    expect(page.url()).toContain('/login')
  })

  test('login page is accessible without auth', async ({ page }) => {
    await page.goto('/login')
    
    expect(page.url()).toContain('/login')
    
    // Should show login form
    const form = await page.locator('form').count()
    expect(form).toBeGreaterThan(0)
  })

  test('register page is accessible without auth', async ({ page }) => {
    await page.goto('/register')
    
    expect(page.url()).toContain('/register')
    
    // Should show registration form
    const form = await page.locator('form').count()
    expect(form).toBeGreaterThan(0)
  })

  test('organizer apply page is accessible without auth', async ({ page }) => {
    await page.goto('/organizer/apply')
    
    expect(page.url()).toContain('/organizer/apply')
  })

  test('service role key should not be in browser bundle', async ({ page }) => {
    await page.goto('/')
    
    // Check that no script contains the service role key
    const scripts = await page.locator('script').all()
    
    for (const script of scripts) {
      const content = await script.textContent()
      if (content) {
        expect(content).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
        expect(content).not.toContain('service-role')
      }
    }
  })
})
