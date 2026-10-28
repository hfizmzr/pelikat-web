import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * saveEventTheme action pins — plan Task 13 Step 1 + carried requirements:
 *  - unauthenticated → error (never a write)
 *  - non-owner → error (Task 2 anti-IDOR carry: the BFF path owns the
 *    ownership check — the 077 trigger bypasses postgres/service_role)
 *  - preset reference must be system OR owned by the caller's organizer
 *  - primary <3:1 vs platform background → blocked w/ structured errors
 *    (client-side validation is UX only — server re-validates, Task 9 carry)
 *  - happy path → BOTH columns written + revalidate of organizer, runner
 *    event, and leaderboard paths (Task 12 carry)
 */

const { requireAuth, revalidatePath, updatePayload, updateError } = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  revalidatePath: vi.fn(),
  updatePayload: vi.fn(),
  updateError: vi.fn(),
}))

vi.mock('@/lib/auth/requireUser', () => ({ requireAuth }))
vi.mock('next/cache', () => ({ revalidatePath }))
// actions.ts's module graph pulls server-only modules (supabase/server via
// createClient, subscription) — never exercised here, stubbed out.
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/subscription', () => ({ getOrganizerSubscriptionPrice: vi.fn() }))

type Row = unknown

function makeSupabase(opts: { event?: Row; preset?: Row } = {}) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: table === 'events' ? (opts.event ?? null) : null, error: null }),
          maybeSingle: async () => ({
            data: table === 'theme_presets' ? (opts.preset ?? null) : null,
            error: null,
          }),
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        updatePayload(payload)
        return { eq: async () => ({ error: updateError() }) }
      },
    }),
  }
}

const OWNER = { id: 'user-1', app_metadata: { organizer_id: 'org-1' } }
const OWNED_EVENT = { id: 'event-1', organizer_id: 'org-1' }
const SYSTEM_PRESET = { id: 'preset-1', kind: 'system', organizer_id: null }

const { saveEventTheme } = await import('@/components/events/actions')

beforeEach(() => {
  requireAuth.mockReset()
  revalidatePath.mockReset()
  updatePayload.mockReset()
  updateError.mockReset()
  updateError.mockReturnValue(null)
})

describe('saveEventTheme', () => {
  it('unauthenticated → error (requireAuth redirect propagates), never writes', async () => {
    requireAuth.mockRejectedValue(new Error('NEXT_REDIRECT'))
    await expect(
      saveEventTheme('event-1', { theme_preset_id: null, theme_config: null }),
    ).rejects.toThrow()
    expect(updatePayload).not.toHaveBeenCalled()
  })

  it('non-owner → error, never writes (anti-IDOR carry)', async () => {
    requireAuth.mockResolvedValue({
      supabase: makeSupabase({ event: { id: 'event-1', organizer_id: 'org-OTHER' } }),
      user: OWNER,
    })
    const result = await saveEventTheme('event-1', { theme_preset_id: null, theme_config: null })
    expect(result.ok).toBe(false)
    expect((result as { error: string }).error).toMatch(/organize/i)
    expect(updatePayload).not.toHaveBeenCalled()
  })

  it('caller without an organizer profile → error, never writes', async () => {
    requireAuth.mockResolvedValue({
      supabase: makeSupabase({ event: OWNED_EVENT }),
      user: { id: 'user-1', app_metadata: {} },
    })
    const result = await saveEventTheme('event-1', { theme_preset_id: null, theme_config: null })
    expect(result.ok).toBe(false)
    expect(updatePayload).not.toHaveBeenCalled()
  })

  it('preset reference that is not system and not owned → error, never writes', async () => {
    requireAuth.mockResolvedValue({
      supabase: makeSupabase({
        event: OWNED_EVENT,
        preset: { id: 'preset-x', kind: 'organizer', organizer_id: 'org-OTHER' },
      }),
      user: OWNER,
    })
    const result = await saveEventTheme('event-1', {
      theme_preset_id: 'preset-x',
      theme_config: null,
    })
    expect(result.ok).toBe(false)
    expect((result as { error: string }).error).toMatch(/preset/i)
    expect(updatePayload).not.toHaveBeenCalled()
  })

  it('primary <3:1 vs platform background → blocked with structured error, never writes', async () => {
    requireAuth.mockResolvedValue({
      supabase: makeSupabase({ event: OWNED_EVENT, preset: SYSTEM_PRESET }),
      user: OWNER,
    })
    const result = await saveEventTheme('event-1', {
      theme_preset_id: 'preset-1',
      theme_config: { colors: { primary: '#FFD700' } },
    })
    expect(result.ok).toBe(false)
    expect((result as { error: string }).error).toMatch(/colors\.primary.*contrast/i)
    expect(updatePayload).not.toHaveBeenCalled()
  })

  it('happy path → both columns written + revalidates organizer, runner event, leaderboard', async () => {
    requireAuth.mockResolvedValue({
      supabase: makeSupabase({ event: OWNED_EVENT, preset: SYSTEM_PRESET }),
      user: OWNER,
    })
    const config = { colors: { primary: '#00807A' }, vocabulary: { medal_label: 'Pingat' } }
    const result = await saveEventTheme('event-1', { theme_preset_id: 'preset-1', theme_config: config })
    expect(result.ok).toBe(true)
    expect(updatePayload).toHaveBeenCalledWith({
      theme_preset_id: 'preset-1',
      theme_config: config,
    })
    expect(revalidatePath).toHaveBeenCalledWith('/organizer/events/event-1')
    expect(revalidatePath).toHaveBeenCalledWith('/runner/events/event-1')
    expect(revalidatePath).toHaveBeenCalledWith('/runner/leaderboard')
  })

  it('happy path with a low-contrast secondary → ok:true with structured warnings', async () => {
    requireAuth.mockResolvedValue({
      supabase: makeSupabase({ event: OWNED_EVENT, preset: SYSTEM_PRESET }),
      user: OWNER,
    })
    const result = await saveEventTheme('event-1', {
      theme_preset_id: null,
      theme_config: { colors: { primary: '#00807A', secondary: '#FFD700' } },
    })
    expect(result.ok).toBe(true)
    expect((result as { warnings: string[] }).warnings.some((w) => w.includes('colors.secondary'))).toBe(true)
    expect(updatePayload).toHaveBeenCalled()
  })

  it('full reset (null/null) is a valid write', async () => {
    requireAuth.mockResolvedValue({
      supabase: makeSupabase({ event: OWNED_EVENT }),
      user: OWNER,
    })
    const result = await saveEventTheme('event-1', { theme_preset_id: null, theme_config: null })
    expect(result.ok).toBe(true)
    expect(updatePayload).toHaveBeenCalledWith({ theme_preset_id: null, theme_config: null })
  })

  it('DB write error → structured error', async () => {
    requireAuth.mockResolvedValue({
      supabase: makeSupabase({ event: OWNED_EVENT }),
      user: OWNER,
    })
    updateError.mockReturnValue({ message: 'check constraint violated' })
    const result = await saveEventTheme('event-1', {
      theme_preset_id: null,
      theme_config: { colors: { primary: '#00807A' } },
    })
    expect(result.ok).toBe(false)
    expect((result as { error: string }).error).toMatch(/check constraint/i)
  })
})
