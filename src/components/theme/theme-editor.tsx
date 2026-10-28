'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, Moon, Paintbrush, RotateCcw, Save, Sun } from 'lucide-react'
import { saveEventTheme } from '@/components/events/actions'
import { useThemeDirtyReporter } from '@/components/events/event-tabs'
import { MiniThemePreview } from '@/components/theme/mini-theme-preview'
import { validateThemeConfig } from '@/lib/theme/validate'
import { deriveTheme } from '@/lib/theme/resolve'
import { normalizeThemeDraft, seedThemeDraft, themeDraftEquals } from '@/lib/theme/draft'
import {
  LABEL_KEYS,
  LABEL_MAX,
  fallbackLabel,
  labelPreview,
  sanitizeLabel,
} from '@/lib/theme/labels'
import { PLATFORM_BG_HEX, contrastRatio, hexToOklch, oklchToString } from '@/lib/theme/color'
import type { LabelKey, ThemeTokens } from '@/lib/theme/types'
import { cn } from '@/lib/utils'

export type ThemePresetOption = {
  id: string
  name: string
  tokens: ThemeTokens
}

const COLOR_ROLES = ['primary', 'secondary', 'accent', 'ring'] as const
type ColorRole = (typeof COLOR_ROLES)[number]

const ROLE_LABELS: Record<ColorRole, string> = {
  primary: 'Primary',
  secondary: 'Secondary',
  accent: 'Accent',
  ring: 'Ring',
}

// Same strict HEX contract the tokens use (validate.ts / 076).
const HEX_RE = /^#[0-9a-fA-F]{6}$/

/**
 * Theme tab (spec §8, plan Task 13): preset gallery + custom color pickers +
 * vocabulary fields with a live preview — everything renders through the same
 * `.event-theme` engine as the runner pages. The WCAG gate UX: Save is
 * hard-blocked only on the validateThemeConfig `errors` (the primary <3:1
 * rule); secondary/accent/ring warn-and-degrade.
 */
export function ThemeEditor({
  eventId,
  canEdit,
  savedPresetId,
  savedConfig,
  presets,
}: {
  eventId: string
  canEdit: boolean
  savedPresetId: string | null
  savedConfig: ThemeTokens | null
  presets: ThemePresetOption[]
}) {
  const [selectedPresetId, setSelectedPresetId] = useState(savedPresetId)
  const [draft, setDraft] = useState<ThemeTokens>(() => seedThemeDraft(savedConfig))
  const [baseline, setBaseline] = useState(() => ({
    presetId: savedPresetId,
    config: normalizeThemeDraft(seedThemeDraft(savedConfig)),
  }))
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [saveWarnings, setSaveWarnings] = useState<string[]>([])
  const [dark, setDark] = useState(false)

  const payload = useMemo(() => normalizeThemeDraft(draft), [draft])
  const validation = useMemo(() => validateThemeConfig(payload), [payload])
  const dirty =
    !themeDraftEquals(payload, baseline.config) || selectedPresetId !== baseline.presetId

  const selectedPreset = presets.find((p) => p.id === selectedPresetId) ?? null
  const previewResolved = useMemo(
    () => deriveTheme(selectedPreset?.tokens ?? {}, payload, selectedPresetId),
    [selectedPreset, payload, selectedPresetId],
  )

  // Dirty-state badge on the tab + leave confirmation (EventPageTabs shell).
  const reportDirty = useThemeDirtyReporter()
  useEffect(() => {
    reportDirty?.(dirty)
    return () => reportDirty?.(false)
  }, [dirty, reportDirty])

  function setColor(role: ColorRole, hex: string) {
    setDraft((d) => ({ ...d, colors: { ...(d.colors ?? {}), [role]: hex } }))
  }

  // Per-key reset = OMIT the key (carried requirement): the preset value (or
  // the platform default, for Custom) flows through the merge instead.
  function resetColor(role: ColorRole) {
    setDraft((d) => {
      const colors = { ...(d.colors ?? {}) }
      delete colors[role]
      const next = { ...d }
      if (Object.keys(colors).length > 0) next.colors = colors
      else delete next.colors
      return next as ThemeTokens
    })
  }

  function setVocab(key: LabelKey, raw: string) {
    const clean = sanitizeLabel(raw)
    setDraft((d) => {
      const vocabulary = { ...(d.vocabulary ?? {}) }
      if (clean.length === 0) delete vocabulary[key]
      else vocabulary[key] = clean
      const next = { ...d }
      if (Object.keys(vocabulary).length > 0) next.vocabulary = vocabulary
      else delete next.vocabulary
      return next as ThemeTokens
    })
  }

  async function handleSave() {
    if (!canEdit || saving || !validation.ok || !dirty) return
    setSaving(true)
    setActionError(null)
    setSaveWarnings([])
    try {
      const result = await saveEventTheme(eventId, {
        theme_preset_id: selectedPresetId,
        theme_config: payload,
      })
      if (result.ok) {
        setBaseline({ presetId: selectedPresetId, config: payload })
        setSaveWarnings(result.warnings)
      } else {
        setActionError(result.error)
      }
    } catch {
      setActionError('Could not save the theme. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        {!canEdit && (
          <p className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
            You can only theme events you organize — this tab is read-only.
          </p>
        )}

        {/* ── Preset gallery (cards rendered through the same .event-theme engine) ── */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Preset
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={!canEdit}
                onClick={() => setSelectedPresetId(preset.id)}
                aria-pressed={selectedPresetId === preset.id}
                className={cn(
                  'rounded-lg border p-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                  selectedPresetId === preset.id
                    ? 'border-primary ring-2 ring-ring/50'
                    : 'hover:border-primary/50',
                )}
              >
                <MiniThemePreview resolved={deriveTheme(preset.tokens, null, preset.id)} eventId={eventId} />
                <p className="mt-1.5 truncate text-xs font-medium">{preset.name}</p>
              </button>
            ))}
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => setSelectedPresetId(null)}
              aria-pressed={selectedPresetId === null}
              className={cn(
                'flex min-h-[80px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-2 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                selectedPresetId === null
                  ? 'border-primary ring-2 ring-ring/50'
                  : 'hover:border-primary/50',
              )}
            >
              <Paintbrush className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium">Custom</span>
              <span className="text-xs text-muted-foreground">Platform + your overrides</span>
            </button>
          </div>
        </section>

        {/* ── Colors: native picker + HEX, live oklch chip, WCAG meter, per-row reset ── */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Colors
          </h3>
          <div className="space-y-2">
            {COLOR_ROLES.map((role) => (
              <ColorRow
                key={role}
                role={role}
                value={effectiveColor(draft, selectedPreset, role)}
                overridden={isOverridden(draft, role)}
                canEdit={canEdit}
                onChange={(hex) => setColor(role, hex)}
                onReset={() => resetColor(role)}
              />
            ))}
          </div>
        </section>

        {/* ── Vocabulary: six inputs, live 40-char cap + sanitized on input ── */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Vocabulary
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {LABEL_KEYS.map((key) => {
              const labelKey = key as LabelKey
              const override = draft.vocabulary?.[labelKey]
              const presetValue = selectedPreset?.tokens?.vocabulary?.[labelKey]
              const effective =
                override ??
                (typeof presetValue === 'string' ? presetValue : fallbackLabel(labelKey))
              return (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={`vocab-${key}`} className="text-xs">
                      {fallbackLabel(labelKey)}
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      {(override ?? '').length}/{LABEL_MAX}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <Input
                      id={`vocab-${key}`}
                      value={override ?? ''}
                      maxLength={LABEL_MAX}
                      disabled={!canEdit}
                      placeholder={typeof presetValue === 'string' ? presetValue : fallbackLabel(labelKey)}
                      onChange={(e) => setVocab(labelKey, e.target.value)}
                      className="h-8 text-sm"
                    />
                    {override !== undefined && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={!canEdit}
                        aria-label={`Reset ${fallbackLabel(labelKey)}`}
                        onClick={() => setVocab(labelKey, '')}
                      >
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{labelPreview(effective)}</p>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      {/* ── Sticky live preview + save bar ─────────────────────────────── */}
      <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Live preview
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Toggle dark mode preview"
            onClick={() => setDark((v) => !v)}
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
        {/* `.dark` ancestor + .event-theme descendant = pure-CSS dark re-resolution */}
        <div className={dark ? 'dark' : undefined}>
          <MiniThemePreview resolved={previewResolved} eventId={eventId} />
        </div>

        {canEdit && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Save</span>
              {dirty && <Badge variant="secondary">Unsaved changes</Badge>}
            </div>
            {validation.errors.map((error) => (
              <p key={error} className="text-xs text-destructive">
                {error}
              </p>
            ))}
            {[...new Set([...validation.warnings, ...saveWarnings])].map((warning) => (
              <p key={warning} className="text-xs text-amber-600 dark:text-amber-400">
                {warning}
              </p>
            ))}
            {actionError && <p className="text-xs text-destructive">{actionError}</p>}
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || !validation.ok || !dirty}
              className="w-full"
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save theme
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function isOverridden(draft: ThemeTokens, role: ColorRole): boolean {
  return typeof draft.colors?.[role] === 'string'
}

function effectiveColor(
  draft: ThemeTokens,
  preset: ThemePresetOption | null,
  role: ColorRole,
): string {
  const override = draft.colors?.[role]
  if (typeof override === 'string') return override
  const presetValue = preset?.tokens?.colors?.[role]
  return typeof presetValue === 'string' ? presetValue : ''
}

/**
 * One color row: native picker + HEX field (valid full HEX commits to the
 * draft mid-typing; invalid input stays local until it is valid or reverted),
 * live oklch chip, WCAG meter, per-row reset.
 */
function ColorRow({
  role,
  value,
  overridden,
  canEdit,
  onChange,
  onReset,
}: {
  role: ColorRole
  value: string
  overridden: boolean
  canEdit: boolean
  onChange: (hex: string) => void
  onReset: () => void
}) {
  const [text, setText] = useState(value)
  // Follow preset switches / resets: adjust-on-prop-change during render (the
  // React-documented pattern — avoids a cascading-render effect).
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setText(value)
  }

  const valid = HEX_RE.test(text)
  const ratio = valid ? contrastRatio(text, PLATFORM_BG_HEX) : null

  // Mirror of validate.ts's contrastGate verdicts (validate.ts stays the
  // save-gate authority — this is per-row presentation only).
  const verdict =
    ratio === null
      ? null
      : ratio < 3
        ? role === 'primary'
          ? 'blocked'
          : 'degrades'
        : 'pass'

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border p-2.5">
      <span
        aria-hidden
        className="h-8 w-8 shrink-0 rounded-md border border-border"
        style={valid ? { backgroundColor: text } : undefined}
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <Label className="text-xs">{ROLE_LABELS[role]}</Label>
          {valid && (
            <span className="font-mono text-xs text-muted-foreground">{oklchToString(hexToOklch(text))}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {ratio === null
            ? 'Enter a 6-digit HEX color'
            : `${ratio.toFixed(2)}:1 vs platform background${
                verdict === 'pass'
                  ? ' — pass'
                  : verdict === 'blocked'
                    ? ' — save blocked'
                    : ' — will degrade to platform color'
              } · dark mode auto (derived)`}
        </p>
      </div>
      <input
        type="color"
        aria-label={`${ROLE_LABELS[role]} color picker`}
        value={valid ? text : '#000000'}
        disabled={!canEdit}
        onChange={(e) => {
          setText(e.target.value)
          onChange(e.target.value)
        }}
        className="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
      />
      <Input
        aria-label={`${ROLE_LABELS[role]} hex value`}
        value={text}
        maxLength={7}
        disabled={!canEdit}
        placeholder="Platform"
        onChange={(e) => {
          const next = e.target.value
          setText(next)
          if (HEX_RE.test(next)) onChange(next)
        }}
        onBlur={() => setText(value)} // revert invalid/partial input
        className="h-8 w-24 font-mono text-xs"
      />
      {overridden && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!canEdit}
          aria-label={`Reset ${ROLE_LABELS[role]} to preset`}
          onClick={onReset}
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}
