'use client'

import { buildStyleVars } from '@/lib/theme/css'
import { storageAssetUrl } from '@/lib/theme/assets'
import type { ResolvedTheme } from '@/lib/theme/types'
import { ThemedImage, THEME_ASPECTS } from '@/components/theme/themed-image'
import { cn } from '@/lib/utils'

/**
 * MiniThemePreview — spec §8: preset gallery cards AND the editor's live
 * preview render through the SAME `.event-theme` engine as the runner pages
 * (EventThemeScope). No token mappings outside the stylesheet whitelist —
 * the mock consumes themed tokens via Tailwind classes (`text-primary`,
 * `bg-primary text-primary-foreground`, …) which resolve to the mapped vars.
 *
 * Pure CSS vars — no image generation, no client theme logic.
 */
export function MiniThemePreview({
  resolved,
  eventId,
  className,
}: {
  resolved: ResolvedTheme
  /** Two-arg form (Task 10 BINDING carry): the themed font family is bound
   * per event id; P1 fonts are unset so no var emits today, but passing the
   * real id keeps the preview font-correct when P2 lands. */
  eventId?: string
  className?: string
}) {
  return (
    <div
      className={cn('event-theme rounded-lg border bg-background p-3', className)}
      style={buildStyleVars(resolved, eventId)}
    >
      {/* Themed event-card mock */}
      <div className="space-y-2 rounded-md border bg-card p-3">
        {/* Task 10 asset slot: the SAME reserved-box engine/props as the
            runner banner + logo overlay. Values come from the resolved assets
            slot — Task 11 rider: bucket-path values expand via
            storageAssetUrl before reaching the <img> (https passes through,
            junk → null → gradient fallback). P2 seed presets carry none. */}
        <div className="relative">
          <ThemedImage
            src={storageAssetUrl(resolved.assets.banner ?? null) ?? undefined}
            alt="Event banner"
            aspect={THEME_ASPECTS.banner}
          />
          <div className="absolute right-2 top-2 w-10">
            <ThemedImage
              src={storageAssetUrl(resolved.assets.logo ?? null) ?? undefined}
              alt="Event logo"
              aspect={THEME_ASPECTS.logo}
            />
          </div>
        </div>
        <p className="text-sm font-bold text-primary">Riverside Run 2026</p>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
            42.5K
          </span>
          <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
            Open
          </span>
        </div>
        <span className="block w-full rounded-md bg-primary px-3 py-1.5 text-center text-sm font-medium text-primary-foreground">
          Register
        </span>
      </div>
      {/* Themed leaderboard-row mock */}
      <div className="mt-2 flex items-center gap-2 rounded-md border bg-card px-3 py-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          1
        </span>
        <span className="flex-1 truncate text-sm">Runner name</span>
        <span className="text-xs tabular-nums text-muted-foreground">00:42:07</span>
      </div>
      {/* Vocabulary live preview — resolved labels (fallbacks filled) as plain text children */}
      <p className="mt-2 truncate text-xs text-muted-foreground">
        {resolved.labels.checkpoint_label} · {resolved.labels.medal_label} ·{' '}
        {resolved.labels.bib_label} #1234
      </p>
    </div>
  )
}
