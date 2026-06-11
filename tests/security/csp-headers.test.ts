import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('Security: CSP Headers', () => {
  it('next.config.ts sets Cache-Control to no-store (prevents caching of sensitive data)', () => {
    const configPath = join(process.cwd(), 'next.config.ts')
    const content = readFileSync(configPath, 'utf-8')
    
    expect(content).toContain('Cache-Control')
    expect(content).toContain('no-store')
    expect(content).toContain('max-age=0')
  })

  it('next.config.ts restricts images to Supabase Storage only', () => {
    const configPath = join(process.cwd(), 'next.config.ts')
    const content = readFileSync(configPath, 'utf-8')
    
    expect(content).toContain('images')
    expect(content).toContain('remotePatterns')
    expect(content).toContain('supabaseHostname')
    expect(content).toContain('https')
  })

  it('no wildcard allowed origins in production', () => {
    const configPath = join(process.cwd(), 'next.config.ts')
    const content = readFileSync(configPath, 'utf-8')
    
    // Should not have '*' in allowed origins
    expect(content).not.toContain("'*'")
    expect(content).not.toContain('"*"')
    
    // Should explicitly list allowed origins
    expect(content).toContain('localhost')
    expect(content).toContain('127.0.0.1')
  })

  it('proxy.ts uses database as source of truth (not JWT)', () => {
    const proxyPath = join(process.cwd(), 'src', 'proxy.ts')
    const content = readFileSync(proxyPath, 'utf-8')
    
    // The proxy should verify against database, not just JWT
    expect(content).toContain('organizers')
    expect(content).toContain('is_active')
    expect(content).toContain('sub_expires_at')
  })
})
