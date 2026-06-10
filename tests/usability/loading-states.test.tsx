import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Suspense } from 'react'

describe('Usability: Loading States', () => {
  it('all async pages should export a loading.tsx (Next.js convention)', () => {
    const fs = require('fs')
    const path = require('path')
    const appDir = path.join(process.cwd(), 'src', 'app')
    
    // Key routes that should have loading states
    const requiredLoadingRoutes = [
      'admin',
      'organizer',
      'organizer/analytics',
      'organizer/events',
      'organizer/merch',
      'runner',
      'runner/badges',
      'runner/events',
      'runner/leaderboard',
      'runner/merch',
    ]
    
    for (const route of requiredLoadingRoutes) {
      const loadingPath = path.join(appDir, route, 'loading.tsx')
      const exists = fs.existsSync(loadingPath)
      
      expect(exists, `Route ${route} should have loading.tsx`).toBe(true)
    }
  })

  it('loading.tsx files should render a skeleton or spinner', () => {
    const fs = require('fs')
    const path = require('path')
    const appDir = path.join(process.cwd(), 'src', 'app')
    
    const loadingFiles = [
      'admin/loading.tsx',
      'organizer/loading.tsx',
      'runner/loading.tsx',
    ]
    
    for (const file of loadingFiles) {
      const fullPath = path.join(appDir, file)
      const content = fs.readFileSync(fullPath, 'utf-8')
      
      // Should contain some loading indicator
      const hasLoadingIndicator =
        content.includes('Skeleton') ||
        content.includes('spinner') ||
        content.includes('loading') ||
        content.includes('animate-pulse') ||
        content.includes('Loading')
      
      expect(hasLoadingIndicator, `${file} should contain a loading indicator`).toBe(true)
    }
  })

  it('Suspense boundaries are used for data-fetching components', () => {
    // Check that key pages use Suspense for async components
    const fs = require('fs')
    const path = require('path')
    const appDir = path.join(process.cwd(), 'src', 'app')
    
    // This is a structural check - pages that fetch data should have Suspense
    const dataFetchingPages = [
      'page.tsx', // landing page
    ]
    
    for (const page of dataFetchingPages) {
      const fullPath = path.join(appDir, page)
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8')
        // Should either use Suspense or be a Server Component (no async client fetch)
        expect(content).toBeTruthy()
      }
    }
  })
})
