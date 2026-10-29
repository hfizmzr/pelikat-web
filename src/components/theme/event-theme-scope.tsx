/**
 * EventThemeScope — server component, spec §5.3 (two-tier injection, zero FOUC).
 *
 * Resolves the event theme server-side and renders the themed scope as a
 * wrapper div carrying ALL `--et-*` vars INLINE (tier 1) — values are correct
 * at first paint, pre-hydration; next-themes `.dark` toggling re-resolves via
 * pure CSS (`src/app/event-theme.css`, tier 2).
 *
 * The per-event heading @font-face (resolver-built: allowlisted URL,
 * system-generated `ET-{prefix}-Heading` family) is injected as a <style>
 * inside the scope — spec §5.4's resolver-built fallback. Scope dies with
 * navigation, so the face dies with it.
 *
 * Unthemed events render children unwrapped: zero DOM, zero queries.
 */
import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getResolvedTheme, type EventThemeInput } from '@/lib/theme/resolve'
import { buildStyleVars, buildFontFace } from '@/lib/theme/css'
import { isPlainObject } from '@/lib/theme/utils'

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
}: {
  event: EventWithTheme
  children: ReactNode
}) {
  if (!hasTheme(event)) return <>{children}</>

  // getResolvedTheme never throws — any failure degrades to the platform
  // theme (spec §5.5), so the wrapper always carries valid oklch vars.
  const supabase = await createClient()
  const resolved = await getResolvedTheme(supabase, event)

  // BINDING (Task 10 review carry): event.id is REQUIRED in both calls —
  // without it the font vars/family never emit.
  const fontFace = resolved.fonts.heading ? buildFontFace(event.id, resolved.fonts.heading) : ''

  return (
    <div className="event-theme" style={buildStyleVars(resolved, event.id)}>
      {fontFace !== '' && <style dangerouslySetInnerHTML={{ __html: fontFace }} />}
      {children}
    </div>
  )
}
