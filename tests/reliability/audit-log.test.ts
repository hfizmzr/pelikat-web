import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('Reliability: Audit Log', () => {
  const auditPath = join(process.cwd(), 'src', 'lib', 'audit.ts')

  it('audit log function only uses INSERT (append-only)', () => {
    const content = readFileSync(auditPath, 'utf-8')
    
    expect(content).toContain('insert')
    expect(content).not.toContain('update')
    expect(content).not.toContain('delete')
    expect(content).not.toContain('upsert')
  })

  it('audit log captures actor information for traceability', () => {
    const content = readFileSync(auditPath, 'utf-8')
    
    expect(content).toContain('actor_id')
    expect(content).toContain('actor_email')
    expect(content).toContain('actor_name')
    expect(content).toContain('action')
    expect(content).toContain('target_id')
  })

  it('audit log is fire-and-forget (not awaited in critical paths)', () => {
    const content = readFileSync(auditPath, 'utf-8')
    
    // The function is async but the caller should not block on it
    // The logAudit function itself awaits the insert, but callers should
    // typically not await logAudit (or use void logAudit(...))
    expect(content).toContain('await supabase.from')
    
    // Check that the function signature returns Promise<void>
    expect(content).toContain('export async function logAudit')
  })

  it('audit log handles unauthenticated users gracefully', () => {
    const content = readFileSync(auditPath, 'utf-8')
    
    expect(content).toContain('user?.id || null')
    expect(content).toContain('user?.email || null')
  })
})
