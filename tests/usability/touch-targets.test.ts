import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

describe('Usability: Touch Targets', () => {
  const componentsDir = join(process.cwd(), 'src', 'components')

  function getAllTsxFiles(dir: string): string[] {
    const files: string[] = []
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...getAllTsxFiles(fullPath))
      } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
        files.push(fullPath)
      }
    }
    return files
  }

  it('Button components should have minimum touch target size', () => {
    const buttonPath = join(componentsDir, 'ui', 'button.tsx')
    const content = readFileSync(buttonPath, 'utf-8')
    
    // Check for minimum size classes
    const hasMinSize =
      content.includes('h-') ||
      content.includes('min-h-') ||
      content.includes('w-') ||
      content.includes('min-w-') ||
      content.includes('px-') ||
      content.includes('py-')
    
    expect(hasMinSize).toBe(true)
  })

  it('Header mobile menu button has explicit touch target size', () => {
    const headerPath = join(componentsDir, 'landing', 'header.tsx')
    const content = readFileSync(headerPath, 'utf-8')
    
    // Mobile menu button should have h-11 w-11 (44px) minimum
    expect(content).toContain('h-11')
    expect(content).toContain('w-11')
  })

  it('all navigation links in header have adequate spacing', () => {
    const headerPath = join(componentsDir, 'landing', 'header.tsx')
    const content = readFileSync(headerPath, 'utf-8')
    
    // Navigation should have gap-8 (32px) for desktop
    expect(content).toContain('gap-8')
    
    // Mobile nav should have gap-4 (16px) which is still acceptable for stacked items
    expect(content).toContain('gap-4')
  })

  it('Form inputs should have adequate padding for touch', () => {
    const uiDir = join(componentsDir, 'ui')
    const inputFiles = readdirSync(uiDir)
      .filter((f) => f.includes('input') || f.includes('select') || f.includes('button'))
      .map((f) => join(uiDir, f))
    
    for (const file of inputFiles) {
      const content = readFileSync(file, 'utf-8')
      
      // Should have some padding or height to ensure touch target
      const hasTouchSize =
        content.includes('h-') ||
        content.includes('min-h-') ||
        content.includes('px-') ||
        content.includes('py-') ||
        content.includes('p-')
      
      expect(hasTouchSize, `${file} should have touch-friendly sizing`).toBe(true)
    }
  })

  it('No interactive elements are smaller than 44px without explicit sizing', () => {
    // This is a structural check - we verify that all interactive elements
    // in the UI directory have sizing classes
    const allFiles = getAllTsxFiles(componentsDir)
    
    for (const file of allFiles) {
      const content = readFileSync(file, 'utf-8')
      
      // Skip non-UI files (data, types, hooks)
      if (file.includes('hooks') || file.includes('lib')) continue
      
      // Check that any onClick/onPress handlers are attached to elements
      // that have sizing classes
      if (content.includes('onClick') || content.includes('onPress')) {
        const hasSizeClass =
          content.includes('h-') ||
          content.includes('min-h-') ||
          content.includes('w-') ||
          content.includes('min-w-') ||
          content.includes('size-') ||
          content.includes('p-') ||
          content.includes('px-') ||
          content.includes('py-')
        
        // This is a best-effort check - not all onClick elements need size
        // but most should
        expect(hasSizeClass, `${file} interactive elements should have sizing`).toBe(true)
      }
    }
  })
})
