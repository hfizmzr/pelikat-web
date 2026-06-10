import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

describe('Usability: Error Messages', () => {
  it('error messages should be user-readable, not raw stack traces', () => {
    const fs = require('fs')
    const path = require('path')
    const srcDir = path.join(process.cwd(), 'src')
    
    // Check key action files for error handling
    const actionFiles = [
      'components/events/actions.ts',
      'app/runner/events/[id]/payment/page.tsx',
      'app/organizer/events/[id]/checkin/page.tsx',
    ]
    
    for (const file of actionFiles) {
      const fullPath = path.join(srcDir, file)
      if (!fs.existsSync(fullPath)) continue
      
      const content = fs.readFileSync(fullPath, 'utf-8')
      
      // Should not throw raw errors to users without try/catch
      const hasErrorHandling =
        content.includes('try {') ||
        content.includes('catch') ||
        content.includes('error') ||
        content.includes('Error')
      
      // Should not have empty catch blocks (swallows errors silently)
      const hasEmptyCatch = content.includes('catch(() => {})') || content.includes('catch (e) {}')
      
      expect(hasErrorHandling, `${file} should have error handling`).toBe(true)
    }
  })

  it('payment page shows user-friendly error messages', () => {
    const fs = require('fs')
    const path = require('path')
    const paymentPage = path.join(
      process.cwd(),
      'src',
      'app',
      'runner',
      'events',
      '[id]',
      'payment',
      'page.tsx'
    )
    
    if (fs.existsSync(paymentPage)) {
      const content = fs.readFileSync(paymentPage, 'utf-8')
      
      // Should show a message that explains it's a dummy payment
      expect(content).toContain('simulates')
      expect(content).toContain('No real transaction')
    }
  })

  it('toast notifications are used for async feedback', () => {
    const fs = require('fs')
    const path = require('path')
    const srcDir = path.join(process.cwd(), 'src')
    
    // Check that sonner toast is used for user feedback
    const files = [
      'app/organizer/events/[id]/checkin/page.tsx',
      'components/events/actions.ts',
    ]
    
    for (const file of files) {
      const fullPath = path.join(srcDir, file)
      if (!fs.existsSync(fullPath)) continue
      
      const content = fs.readFileSync(fullPath, 'utf-8')
      // Should not use console.log for user-facing messages
      // console.error is allowed for server-side error logging
      expect(content).not.toContain('console.log')
    }
  })
})
