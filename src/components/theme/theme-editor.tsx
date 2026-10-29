'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Moon, Paintbrush, RotateCcw, Save, Sun, UploadCloud } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { saveEventTheme } from '@/components/events/actions'
import { useThemeDirtyReporter } from '@/components/events/event-tabs'
import { MiniThemePreview } from '@/components/theme/mini-theme-preview'
import { ThemedImage, THEME_ASPECTS } from '@/components/theme/themed-image'
import { validateThemeConfig } from '@/lib/theme/validate'
import { deriveTheme } from '@/lib/theme/resolve'
import { normalizeThemeDraft, seedThemeDraft, themeDraftEquals } from '@/lib/theme/draft'
import {
  ASSET_LIMITS,
  FAMILY_FONT_URLS,
  FONT_LIMIT,
  uploadThemeAsset,
  type AssetKind,
  type FontKind,
  type ImageAssetKey,
  type ThemeAssetKind,
} from '@/lib/theme/assets'
import {
  LABEL_KEYS,
  LABEL_MAX,
  fallbackLabel,
  labelPreview,
  sanitizeDraftLabel,
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

// ── Assets section (P2 Task 7, spec §6/§8) ───────────────────────────────────
// Aspect keys are the exported THEME_ASPECTS from Task 6 (note: the badge
// key is `badge`, the kind is `badge_icon` — mapped explicitly here).
const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp'

const ASSET_ROWS: { key: ImageAssetKey; kind: AssetKind; label: string; aspect: string; hint: string }[] = [
  {
    key: 'banner_url',
    kind: 'banner',
    label: 'Banner',
    aspect: THEME_ASPECTS.banner,
    hint: `${(ASSET_LIMITS.banner.maxBytes / 1_048_576).toFixed(1)} MB max · PNG, JPEG or WebP`,
  },
  {
    key: 'logo_url',
    kind: 'logo',
    label: 'Logo',
    aspect: THEME_ASPECTS.logo,
    hint: `${(ASSET_LIMITS.logo.maxBytes / 1024).toFixed(0)} KB max · PNG, JPEG or WebP`,
  },
  {
    key: 'badge_icon_url',
    kind: 'badge_icon',
    label: 'Badge icon',
    aspect: THEME_ASPECTS.badge,
    hint: `${(ASSET_LIMITS.badge_icon.maxBytes / 1024).toFixed(0)} KB max · PNG, JPEG or WebP`,
  },
  {
    key: 'certificate_background_url',
    kind: 'certificate_background',
    label: 'Certificate background',
    aspect: THEME_ASPECTS.certificate_background,
    hint: `${(ASSET_LIMITS.certificate_background.maxBytes / 1_048_576).toFixed(1)} MB max · PNG, JPEG or WebP`,
  },
]

const FONT_SLOTS: { kind: FontKind; urlKey: 'heading_font_url' | 'body_font_url'; label: string }[] = [
  { kind: 'heading_font', urlKey: 'heading_font_url', label: 'Heading font' },
  { kind: 'body_font', urlKey: 'body_font_url', label: 'Body font' },
]

const FONT_FAMILY_ITEMS = Object.entries(FAMILY_FONT_URLS)
const FONT_URL_TO_FAMILY = new Map(FONT_FAMILY_ITEMS.map(([name, url]) => [url, name]))

/**
 * Theme tab (spec §8, plan Task 13): preset gallery + custom color pickers +
 * vocabulary fields with a live preview — everything renders through the same
 * `.event-theme` engine as the runner pages. The WCAG gate UX: Save is
 * hard-blocked only on the validateThemeConfig `errors` (the primary <3:1
 * rule); secondary/accent/ring warn-and-degrade.
 */
export function ThemeEditor({
  eventId,
  organizerId,
  canEdit,
  savedPresetId,
  savedConfig,
  presets,
}: {
  eventId: string
  organizerId: string
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
  // P2 Task 7 — in-flight upload keyed by asset kind / font kind; last
  // structured upload error carries its row (one upload at a time) so the
  // message renders AT the affected row only.
  const [uploading, setUploading] = useState<ThemeAssetKind | null>(null)
  const [uploadError, setUploadError] = useState<{ kind: ThemeAssetKind; message: string } | null>(null)

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
    // Draft path: sanitize WITHOUT trim/collapse so tail spaces survive
    // mid-typing (review carry). The save payload passes through
    // normalizeThemeDraft, which applies full sanitizeLabel → the DB keeps
    // trimmed canonical values.
    const clean = sanitizeDraftLabel(raw)
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

  // ── Assets (P2 Task 7) ──────────────────────────────────────────────────────
  // String values only; null/garbage never reaches the draft (draft.ts
  // projection). A direct Storage upload (merch precedent) returns the
  // canonical public URL — the client gate in assets.ts rejects BEFORE any
  // network call when size/type/ext is off.
  function setAssetUrl(key: ImageAssetKey, url: string | null) {
    setDraft((d) => {
      const assets = { ...(d.assets ?? {}) }
      if (url === null) delete assets[key]
      else assets[key] = url
      const next = { ...d }
      if (Object.keys(assets).length > 0) next.assets = assets
      else delete next.assets
      return next as ThemeTokens
    })
  }

  function setFontUrl(urlKey: 'heading_font_url' | 'body_font_url', url: string | null) {
    setDraft((d) => {
      const typography = { ...(d.typography ?? {}) }
      if (url === null) delete typography[urlKey]
      else typography[urlKey] = url
      const next = { ...d }
      if (Object.keys(typography).length > 0) next.typography = typography
      else delete next.typography
      return next as ThemeTokens
    })
  }

  // One assign-callback per kind/slot keeps the shared uploader dumb about
  // where the public URL lands (assets vs typography slot).
  const assigners = new Map<ThemeAssetKind, (url: string) => void>(
    [
      ...ASSET_ROWS.map((row) => [row.kind, (url: string) => setAssetUrl(row.key, url)] as const),
      ...FONT_SLOTS.map((slot) => [slot.kind, (url: string) => setFontUrl(slot.urlKey, url)] as const),
    ],
  )

  async function handleUpload(kind: ThemeAssetKind, file: File) {
    if (!canEdit || uploading) return
    setUploadError(null)
    setUploading(kind)
    try {
      const result = await uploadThemeAsset(createClient(), {
        organizerId,
        eventId,
        kind,
        file,
      })
      assigners.get(kind)?.(result.publicUrl)
    } catch (err) {
      setUploadError({
        kind,
        message: err instanceof Error ? err.message : 'Upload failed — please try again.',
      })
    } finally {
      setUploading(null)
    }
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

        {/* ── Assets (P2 Task 7): per-kind ThemedImage thumbnails, drag-drop +
             picker uploads with the §6 client gate, omit-key remove ──── */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Assets
          </h3>
          <div className="space-y-2">
            {ASSET_ROWS.map((row) => (
              <AssetRow
                key={row.key}
                rowKey={row.key}
                label={row.label}
                aspect={row.aspect}
                hint={row.hint}
                url={typeof draft.assets?.[row.key] === 'string' ? (draft.assets?.[row.key] as string) : undefined}
                busy={uploading === row.kind}
                error={uploadError?.kind === row.kind ? uploadError.message : null}
                canEdit={canEdit}
                onPick={(file) => void handleUpload(row.kind, file)}
                onRemove={() => setAssetUrl(row.key, null)}
              />
            ))}
            {FONT_SLOTS.map((slot) => (
              <FontRow
                key={slot.kind}
                label={slot.label}
                value={draft.typography?.[slot.urlKey]}
                busy={uploading === slot.kind}
                error={uploadError?.kind === slot.kind ? uploadError.message : null}
                canEdit={canEdit}
                onSelect={(url) => setFontUrl(slot.urlKey, url === '' ? null : url)}
                onPick={(file) => void handleUpload(slot.kind, file)}
                onRemove={() => setFontUrl(slot.urlKey, null)}
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

/**
 * One asset row (P2 Task 7, spec §8 component 3): ThemedImage reserved-box
 * thumbnail (draft value when set — omit-reset semantics when removed),
 * drag-drop + file-picker upload with the §6 client gate, per-kind limit
 * hint, upload-in-progress and structured error states.
 */
function AssetRow({
  rowKey,
  label,
  aspect,
  hint,
  url,
  busy,
  error,
  canEdit,
  onPick,
  onRemove,
}: {
  rowKey: ImageAssetKey
  label: string
  aspect: string
  hint: string
  url?: string
  busy: boolean
  error: string | null
  canEdit: boolean
  onPick: (file: File) => void
  onRemove: () => void
}) {
  const rowError = error
  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-border p-2.5"
      onDragOver={(e) => {
        if (canEdit && !busy) e.preventDefault()
      }}
      onDrop={(e) => {
        e.preventDefault()
        const file = e.dataTransfer.files?.[0]
        if (canEdit && !busy && file) onPick(file)
      }}
    >
      <ThemedImage src={url} alt={label} aspect={aspect} className="max-w-[240px] rounded-md border border-border" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <Label className="text-xs">{label}</Label>
          {url && <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{url.split('/').pop()}</span>}
        </div>
        <p className="text-xs text-muted-foreground">{hint}</p>
        {rowError && <p className="text-xs text-destructive">{rowError}</p>}
        <div className="flex items-center gap-1.5">
          <Label
            htmlFor={`asset-${rowKey}`}
            aria-label={`Upload ${label}`}
            className={cn(
              'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 text-sm hover:bg-accent',
              (!canEdit || busy) && 'pointer-events-none opacity-50',
            )}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
            {busy ? 'Uploading…' : 'Upload'}
          </Label>
          <input
            id={`asset-${rowKey}`}
            type="file"
            accept={IMAGE_ACCEPT}
            multiple={false}
            className="sr-only"
            disabled={!canEdit || busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onPick(file)
              e.target.value = ''
            }}
          />
          {url && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={!canEdit || busy}
              aria-label={`Remove ${label}`}
              onClick={onRemove}
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * One font row (P2 Task 7): curated gstatic family dropdown (URL values land
 * in `draft.typography.{heading,body}_font_url`) OR a .woff2 upload ≤ the
 * font limit; the saved URL is re-gated by `themeFontUrlOk` at save+resolve.
 */
function FontRow({
  label,
  value,
  busy,
  error,
  canEdit,
  onSelect,
  onPick,
  onRemove,
}: {
  label: string
  value?: string
  busy: boolean
  error: string | null
  canEdit: boolean
  onSelect: (url: string) => void
  onPick: (file: File) => void
  onRemove: () => void
}) {
  const family = value ? FONT_URL_TO_FAMILY.get(value) : undefined
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border p-2.5">
      <div className="min-w-0 flex-1 space-y-1">
        <Label className="text-xs">{label}</Label>
        <p className="text-xs text-muted-foreground">
          {`Google OFL families or your own .woff2 (≤ ${(FONT_LIMIT / 1_048_576).toFixed(1)} MB)`}
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>      <Select
        value={family ?? (value ? 'custom' : 'platform-default')}
        disabled={!canEdit || busy}
        onValueChange={(v) => {
          // The sentinel "custom" is a display-only option for an already
          // uploaded custom .woff2 (picked via the file input) — never a
          // value to write to the draft.
          if (v === 'custom') return
          onSelect(v === 'platform-default' ? '' : v)
        }}
      >
        <SelectTrigger aria-label={`${label} family`} className="h-8 w-[180px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="platform-default">Platform default</SelectItem>
          {value && family === undefined && <SelectItem value="custom">Custom upload</SelectItem>}
          {FONT_FAMILY_ITEMS.map(([name, url]) => (
            <SelectItem key={url} value={url}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Label
        htmlFor={`font-${label.replace(/\s+/g, '-').toLowerCase()}`}
        aria-label={`Upload custom ${label.toLowerCase()}`}
        className={cn(
          'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 text-sm hover:bg-accent',
          (!canEdit || busy) && 'pointer-events-none opacity-50',
        )}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
      </Label>
      <input
        id={`font-${label.replace(/\s+/g, '-').toLowerCase()}`}
        type="file"
        accept=".woff2"
        multiple={false}
        className="sr-only"
        disabled={!canEdit || busy}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPick(file)
          e.target.value = ''
        }}
      />
      {value !== undefined && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!canEdit || busy}
          aria-label={`Reset ${label.toLowerCase()}`}
          onClick={onRemove}
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}
