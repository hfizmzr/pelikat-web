/**
 * EventThemeScope — server component, spec §5.3 (two-tier injection, zero FOUC).
 *
 * Resolves the event theme server-side and renders the themed scope as a
 * wrapper div carrying ALL `--et-*` vars INLINE (tier 1) — values are correct
 * at first paint, pre-hydration; next-themes `.dark` toggling re-resolves via
 * pure CSS (`src/app/event-theme.css`, tier 2).
 *
 * The per-event heading/body @font-faces (resolver-built: allowlisted URLs,
 * system-generated `ET-{prefix}-Heading` / `-Body` families) are injected as a
 * <style> inside the scope — spec §5.4's resolver-built fallback. Scope dies
 * with navigation, so the faces die with it.
 *
 * Unthemed events render children unwrapped: zero DOM, zero queries.
 */
import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getResolvedTheme, type EventThemeInput } from '@/lib/theme/resolve'
import { buildStyleVars, buildFontFace } from '@/lib/theme/css'
import { isPlainObject } from '@/lib/theme/utils'
import { ThemedImage, THEME_ASPECTS } from '@/components/theme/themed-image'

/** Event row subset the scope consumes — `id` drives the font family + var bindings. */
type EventWithTheme = EventThemeInput & { id: string }

/** No-theme predicate: no preset reference AND no (non-empty) override config. */
function hasTheme(event: EventWithTheme): boolean {
  if (typeof event.theme_preset_id === 'string' && event.theme_preset_id.length > 0) return true
  return isPlainObject(event.theme_config) && Object.keys(event.theme_config).length > 0
}

export async function EventThemeScope({
  event,
  children,
  showAssets = false,
}: {
  event: EventWithTheme
  children: ReactNode
  /** Task 10: banner/logo rendering opt-in. ONLY the runner event-detail page
   * passes it — the leaderboard keeps the default false and its P1 DOM. Asset
   * nodes render ONLY when a resolved value exists (showAssets + no assets →
   * the DOM stays byte-identical to the no-prop render; unthemed events are
   * unaffected — the early return happens before this prop is ever consulted). */
  showAssets?: boolean
}) {
  if (!hasTheme(event)) return <>{children}</>

  // getResolvedTheme never throws — any failure degrades to the platform
  // theme (spec §5.5), so the wrapper always carries valid oklch vars.
  const supabase = await createClient()
  const resolved = await getResolvedTheme(supabase, event)

  // BINDING (Task 10 review carry): event.id is REQUIRED in both calls —
  // without it the font vars/families never emit.
  const fontFace = buildFontFace(event.id, resolved.fonts)

  // Asset slots (Task 10): values ONLY exist when resolved — no reserved
  // empty boxes here, so no-asset events keep the exact P1 output.
  const { banner, logo } = showAssets
    ? { banner: resolved.assets.banner, logo: resolved.assets.logo }
    : { banner: null, logo: null }

  return (
    <div className="event-theme" style={buildStyleVars(resolved, event.id)}>
      {fontFace !== '' && <style dangerouslySetInnerHTML={{ __html: fontFace }} />}
      {banner !== null ? (
        // Leading banner above the children; the logo overlaps top-right of it.
        <div className="relative">
          <ThemedImage src={banner} alt="Event banner" aspect={THEME_ASPECTS.banner} />
          {logo !== null && (
            <div className="absolute right-4 top-4 w-16">
              <ThemedImage src={logo} alt="Event logo" aspect={THEME_ASPECTS.logo} />
            </div>
          )}
        </div>
      ) : logo !== null ? (
        // No banner to anchor the overlay → small logo slot at the scope start.
        <div className="w-16">
          <ThemedImage src={logo} alt="Event logo" aspect={THEME_ASPECTS.logo} />
        </div>
      ) : null}
      {children}
    </div>
  )
}
