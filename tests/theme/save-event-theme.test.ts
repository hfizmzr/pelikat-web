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
 *  - P2 Task 7 carry: after a successful save, cleanupThemeAssets runs with
 *    the FRESHLY-READ DB config; list/remove failures surface as structured
 *    warnings, never break the save.
 */

const { requireAuth, revalidatePath, updatePayload, updateError, cleanupThemeAssets } = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  revalidatePath: vi.fn(),
  updatePayload: vi.fn(),
  updateError: vi.fn(),
  cleanupThemeAssets: vi.fn(),
}))

vi.mock('@/lib/auth/requireUser', () => ({ requireAuth }))
vi.mock('next/cache', () => ({ revalidatePath }))
// actions.ts's module graph pulls server-only modules (supabase/server via
// createClient, subscription) — never exercised here, stubbed out.
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/subscription', () => ({ getOrganizerSubscriptionPrice: vi.fn() }))
// P2 Task 7: the storage cleanup runs in its own module — stubbed + pinned by
// assets.test.ts; here only the wiring (fresh-DB read + invocation) matters.
vi.mock('@/lib/theme/assets', () => ({ cleanupThemeAssets }))

type Row = unknown

function makeSupabase(opts: { event?: Row; preset?: Row; savedConfig?: Row } = {}) {
  return {
    from: (table: string) => ({
      select: (cols: string) => ({
        eq: () => ({
          single: async () => {
            if (table === 'events' && cols.includes('theme_config')) {
              return { data: opts.savedConfig == null ? null : { theme_config: opts.savedConfig }, error: null }
            }
            return { data: table === 'events' ? (opts.event ?? null) : null, error: null }
          },
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
const OWNED_EVENT = { id: 'event-1', organizer_id: 'org-1', theme_preset_id: null }
const SYSTEM_PRESET = { id: 'preset-1', kind: 'system', organizer_id: null, is_active: true }

const { saveEventTheme } = await import('@/components/events/actions')

beforeEach(() => {
  requireAuth.mockReset()
  revalidatePath.mockReset()
  updatePayload.mockReset()
  updateError.mockReset()
  cleanupThemeAssets.mockReset()
  updateError.mockReturnValue(null)
  cleanupThemeAssets.mockResolvedValue({ removed: [], warnings: [] })
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

  // P2 Task 8: switching to a DEACTIVATED preset is rejected fail-closed
  // (same structured treatment as the ownership violation — no PII).
  it('inactive preset (is_active=false) → rejected with structured error, never writes', async () => {
    requireAuth.mockResolvedValue({
      supabase: makeSupabase({
        event: OWNED_EVENT,
        preset: { id: 'preset-1', kind: 'system', organizer_id: null, is_active: false },
      }),
      user: OWNER,
    })
    const result = await saveEventTheme('event-1', {
      theme_preset_id: 'preset-1',
      theme_config: null,
    })
    expect(result.ok).toBe(false)
    expect((result as { error: string }).error).toMatch(/no longer available/i)
    expect(updatePayload).not.toHaveBeenCalled()
  })

  // @manager ruling (formerly #10): deactivation gates SELECTION only —
  // re-saving the ALREADY-REFERENCED inactive preset stays allowed so
  // deactivated-but-themed events keep rendering (resolve.ts unchanged).
  it('already-referenced inactive preset → still saves (selection-only gating)', async () => {
    requireAuth.mockResolvedValue({
      supabase: makeSupabase({
        event: { ...OWNED_EVENT, theme_preset_id: 'preset-1' },
        preset: { id: 'preset-1', kind: 'system', organizer_id: null, is_active: false },
      }),
      user: OWNER,
    })
    const result = await saveEventTheme('event-1', {
      theme_preset_id: 'preset-1',
      theme_config: { colors: { primary: '#00807A' } },
    })
    expect(result.ok).toBe(true)
    expect(updatePayload).toHaveBeenCalledWith({
      theme_preset_id: 'preset-1',
      theme_config: { colors: { primary: '#00807A' } },
    })
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

  it('happy path with a fails-companion secondary → ok:true with structured warnings', async () => {
    requireAuth.mockResolvedValue({
      supabase: makeSupabase({ event: OWNED_EVENT, preset: SYSTEM_PRESET }),
      user: OWNER,
    })
    // Ruling #10 (P2 Task 5): '#FFD700' now renders (dark-text companion
    // 14.1:1 ≥ 4.5) — the warn-and-accept carrier is the pickForeground dead
    // band where BOTH companions sit just under 4.5:1 (white 4.48, dark 4.42).
    const result = await saveEventTheme('event-1', {
      theme_preset_id: null,
      theme_config: { colors: { primary: '#00807A', secondary: '#777777' } },
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

// ── P2 Task 7: post-save orphan cleanup wiring ───────────────────────────────
describe('saveEventTheme → cleanupThemeAssets (P2 Task 7)', () => {
  it('after a successful save, cleanup runs with the freshly-read DB config (NOT the client draft)', async () => {
    const savedConfig = {
      assets: { banner_url: 'https://ugexrrslijmwtieevjbs.supabase.co/storage/v1/object/public/event-themes/organizers/org-1/events/event-1/banner-v111.woff2' },
      typography: { heading_font_url: 'https://fonts.gstatic.com/s/prata/v22/6xKhdSpbNNCT-sWPCm4.woff2' },
    }
    requireAuth.mockResolvedValue({
      supabase: makeSupabase({ event: OWNED_EVENT, preset: SYSTEM_PRESET, savedConfig }),
      user: OWNER,
    })
    // the client draft references a DIFFERENT (not-yet-saved) banner
    const result = await saveEventTheme('event-1', {
      theme_preset_id: 'preset-1',
      theme_config: { assets: { banner_url: 'banner-v999.png' } },
    })
    expect(result.ok).toBe(true)
    expect(cleanupThemeAssets).toHaveBeenCalledTimes(1)
    expect(cleanupThemeAssets).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizerId: 'org-1',
        eventId: 'event-1',
        savedAssets: {
          banner_url: savedConfig.assets.banner_url,
          heading_font_url: savedConfig.typography.heading_font_url,
          // banner-v999.png from the client draft must NOT be the reference
        },
      }),
    )
  })

  it('failed save → cleanup never runs', async () => {
    requireAuth.mockResolvedValue({
      supabase: makeSupabase({ event: OWNED_EVENT, preset: SYSTEM_PRESET }),
      user: OWNER,
    })
    updateError.mockReturnValue({ message: 'check constraint violated' })
    await saveEventTheme('event-1', {
      theme_preset_id: null,
      theme_config: { colors: { primary: '#00807A' } },
    })
    expect(cleanupThemeAssets).not.toHaveBeenCalled()
  })

  it('cleanup warnings merge into the save result (structured, never throw)', async () => {
    requireAuth.mockResolvedValue({
      supabase: makeSupabase({ event: OWNED_EVENT, preset: SYSTEM_PRESET }),
      user: OWNER,
    })
    cleanupThemeAssets.mockResolvedValue({ removed: [], warnings: ['theme assets: could not list existing assets — cleanup skipped'] })
    const result = await saveEventTheme('event-1', {
      theme_preset_id: null,
      theme_config: null,
    })
    expect(result.ok).toBe(true)
    expect((result as { warnings: string[] }).warnings).toContain(
      'theme assets: could not list existing assets — cleanup skipped',
    )
  })
})
