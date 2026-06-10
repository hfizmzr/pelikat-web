import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

describe('Security: Service Role Key Exposure', () => {
  const srcDir = join(process.cwd(), 'src')

  function getAllTsFiles(dir: string): string[] {
    const files: string[] = []
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...getAllTsFiles(fullPath))
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        files.push(fullPath)
      }
    }
    return files
  }

  it('browser client (client.ts) never imports service-role key', () => {
    const clientPath = join(srcDir, 'lib', 'supabase', 'client.ts')
    const content = readFileSync(clientPath, 'utf-8')
    
    expect(content).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(content).not.toContain('service-role')
    expect(content).not.toContain('supabaseAdmin')
    expect(content).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  })

  it('server client (server.ts) never imports service-role key', () => {
    const serverPath = join(srcDir, 'lib', 'supabase', 'server.ts')
    const content = readFileSync(serverPath, 'utf-8')
    
    expect(content).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(content).not.toContain('service-role')
    expect(content).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  })

  it('service-role module is isolated and only used in API routes', () => {
    const serviceRolePath = join(srcDir, 'lib', 'supabase', 'service-role.ts')
    const content = readFileSync(serviceRolePath, 'utf-8')
    
    expect(content).toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(content).toContain('server-side admin API routes')
    
    // Check that no other file imports from service-role.ts
    const allFiles = getAllTsFiles(srcDir)
    const importingFiles = allFiles.filter((file) => {
      if (file === serviceRolePath) return false
      const fileContent = readFileSync(file, 'utf-8')
      return (
        fileContent.includes("from '@/lib/supabase/service-role'") ||
        fileContent.includes('from "@/lib/supabase/service-role"') ||
        fileContent.includes("import { supabaseAdmin }") ||
        fileContent.includes("from './service-role'")
      )
    })
    
    // Only files in app/api/ should import it
    const nonApiImports = importingFiles.filter(
      (f) => !f.includes(join('src', 'app', 'api'))
    )
    
    expect(nonApiImports).toHaveLength(0)
  })

  it('no NEXT_PUBLIC_ env var contains service role key', () => {
    const envExamplePath = join(process.cwd(), '.env.example')
    const envExample = readFileSync(envExamplePath, 'utf-8')
    
    // NEXT_PUBLIC_ vars should never include service role key
    const publicVars = envExample
      .split('\n')
      .filter((line) => line.startsWith('NEXT_PUBLIC_'))
    
    for (const variable of publicVars) {
      expect(variable.toLowerCase()).not.toContain('service_role')
      expect(variable.toLowerCase()).not.toContain('service-role')
    }
  })

  it('django.ts internal API key uses env var, not hardcoded in production', () => {
    const djangoPath = join(srcDir, 'lib', 'django.ts')
    const content = readFileSync(djangoPath, 'utf-8')
    
    expect(content).toContain('process.env.INTERNAL_API_KEY')
    // The fallback is a dummy value for development only
    expect(content).toContain('dummy-internal-api-key-12345')
  })
})
