'use server'

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { DjangoApiError, fetchDjangoApi } from '@/lib/django'
import { isConfirmedStatus } from '@/lib/registration-status'
// Dummy confirmation writes financial rows, so it lives with the other
// service-role-backed server actions live in lib/actions — re-exports are NOT
// allowed here ("use server" files may only export async functions from this
// module; a barreled re-export of another module's action throws a build
// error), so call sites import them from their defining module directly.
import {
  REPC_CHECK_IN_RPC,
  normalizeRepcCheckInResult,
  type RepcCheckInResult,
  type RepcCheckInRpcRow,
} from '@/lib/repc'
import { requireAuth } from '@/lib/auth/requireUser'
import { getOrganizerSubscriptionPrice } from '@/lib/subscription'
import { validateThemeConfig } from '@/lib/theme/validate'
import { cleanupThemeAssets } from '@/lib/theme/assets'
import { isPlainObject } from '@/lib/theme/utils'
import { MERCH_SIZE_PRESETS } from '@/lib/merch'
import type { PhotoBatch } from '@/lib/photo-batches'
import type { ThemeTokens } from '@/lib/theme/types'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// ─────────────────────────────────────────────────────────────────────────────
// Registration Actions
// ─────────────────────────────────────────────────────────────────────────────

// ── HitPay checkout (server-side funnel via Django) ──────────────────────────
// The browser never sees the HitPay API. Amount and reference come from
// the server; confirmation happens only through the signed webhook in
// Django — a redirect back from HitPay never marks anything paid.

interface DjangoCreatePayment {
  provider_request_id: string
  checkout_url: string
  qr_code: string | null
  direct_link_url: string | null
  status: string
}

export type HitpayCheckoutResult =
  // ALREADY-PAD re-entry: the registration is paid — callers must render the
  // confirmed state, never a new payment request (double-charge guard).
  | { ok: true; alreadyPaid: true }
  | {
      ok: true
      checkoutUrl: string
      qrCode: string | null
      providerRequestId: string
    }
  | { ok: false; error: string }

const PAYMENT_METHODS_UNAVAILABLE =
  'Payment methods are temporarily unavailable. Please try again shortly or contact support.'
const CHECKOUT_GENERIC_ERROR =
  'Could not start the payment. Please try again or contact support.'
const CATEGORY_PRICE_UNAVAILABLE =
  'This category does not currently have a registration fee. Please contact the organizer or try again shortly.'
// Django 409 on /payments/create: migration 063 reports the claim slot as
// still initializing (in-flight or crashed previous attempt).
const CHECKOUT_INITIALIZING =
  'Your previous payment attempt is still being initialized — please retry in a few seconds.'

function checkoutErrorResult(e: unknown): { ok: false; error: string } {
  // Gateway rails/currency rejections (HitPay 422s surfaced by Django)
  // are caged to a retryable, detail-free message; anything unexpected is
  // logged server-side and mapped to the same happy-path-clean shape.
  if (e instanceof DjangoApiError) {
    // 061/063: another create call holds the claim slot — a retry in a few
    // seconds gets the in-flight checkout; never show a generic failure.
    if (e.status === 409) {
      return { ok: false, error: CHECKOUT_INITIALIZING }
    }
    if (/payment method|currency/i.test(e.message)) {
      return { ok: false, error: PAYMENT_METHODS_UNAVAILABLE }
    }
  }
  console.error('HitPay checkout failed:', e)
  return { ok: false, error: CHECKOUT_GENERIC_ERROR }
}

function hitpayRedirectUrl(path: string): string {
  const appUrl =
    process.env.NEXT_PUBLIC_TUNNEL_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  return `${appUrl}${path}`
}

export async function createHitpayCheckout(input: {
  registrationId: string
  email: string
  name: string
}): Promise<HitpayCheckoutResult> {
  try {
    const { supabase } = await requireAuth()

    const { data: registration, error } = await supabase
      .from('registrations')
      .select('id, event_id, runner_id, payment_status, race_categories(price)')
      .eq('id', input.registrationId)
      .single()

    if (error || !registration) throw new Error('Registration not found')

    // ALREADY-PAD re-entry: never create a second checkout for a paid
    // registration — the runner must see the confirmed state instead.
    // Waived (complimentary) registrations are confirmed without a
    // charge and must never enter a checkout at all.
    if (isConfirmedStatus(registration.payment_status)) {
      return { ok: true, alreadyPaid: true }
    }

    const category = Array.isArray(registration.race_categories)
      ? registration.race_categories[0]
      : registration.race_categories

    // No price → never start a checkout (price removed, or read raced).
    // Django would 422; catching it here gives the runner a clear reason.
    const price = category?.price
    if (price == null || Number(price) <= 0) {
      return { ok: false, error: CATEGORY_PRICE_UNAVAILABLE }
    }

    const result: DjangoCreatePayment = await fetchDjangoApi('/payments/create', {
      method: 'POST',
      body: JSON.stringify({
        order_type: 'registration',
        registration_id: registration.id,
        reference_number: registration.id,
        runner_id: registration.runner_id,
        // Amount snapshot: race_categories.price read server-side, never
        // taken from the client.
        amount: Number(category?.price ?? 0),
        email: input.email,
        name: input.name,
        purpose: 'Event registration',
        redirect_url: hitpayRedirectUrl(
          `/runner/events/${registration.event_id}/payment`
        ),
      }),
    })

    return {
      ok: true,
      checkoutUrl: result.checkout_url,
      qrCode: result.qr_code ?? null,
      providerRequestId: result.provider_request_id,
    }
  } catch (e) {
    return checkoutErrorResult(e)
  }
}

export async function createHitpaySubscriptionCheckout(
): Promise<Exclude<HitpayCheckoutResult, { ok: true; alreadyPaid: true }>> {
  try {
    const { supabase, user } = await requireAuth()

    const organizerId = user.app_metadata?.organizer_id
    if (!organizerId) throw new Error('Organizer profile not found')

    const { data: organizer, error } = await supabase
      .from('organizers')
      .select('id, name, contact_email')
      .eq('id', organizerId)
      .single()

    if (error || !organizer) throw new Error('Organizer profile not found')

    // Amount snapshot: the DB-configured price is read server-side —
    // never taken from the caller (client-supplied money is untrusted).
    const price = await getOrganizerSubscriptionPrice(supabase)

    const result: DjangoCreatePayment = await fetchDjangoApi('/payments/create', {
      method: 'POST',
      body: JSON.stringify({
        order_type: 'organizer_subscription',
        organizer_id: organizer.id,
        amount: price.amount,
        email: organizer.contact_email ?? user.email,
        name: organizer.name,
        purpose: 'Organizer subscription',
        redirect_url: hitpayRedirectUrl('/organizer/payment'),
      }),
    })

    return {
      ok: true,
      checkoutUrl: result.checkout_url,
      qrCode: result.qr_code ?? null,
      providerRequestId: result.provider_request_id,
    }
  } catch (e) {
    return checkoutErrorResult(e)
  }
}

export async function getPaymentStatus(
  registrationId: string
): Promise<{ status: string; paymentRail: string | null }> {
  const { supabase } = await requireAuth()

  const { data: registration } = await supabase
    .from('registrations')
    .select('id')
    .eq('id', registrationId)
    .single()

  if (!registration) throw new Error('Registration not found')

  const result = await fetchDjangoApi(
    `/payments/status?reference_number=${encodeURIComponent(registrationId)}`
  )

  return {
    status: result.status,
    paymentRail: result.payment_rail ?? null,
  }
}

export async function cancelRegistration(eventId: string) {
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('runner_profiles')
    .select('id')
    .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
    .single()

  if (!profile) throw new Error('Runner profile not found')

  const { data: registration } = await supabase
    .from('registrations')
    .select('id')
    .eq('event_id', eventId)
    .eq('runner_id', profile.id)
    .single()

  if (!registration) throw new Error('Registration not found')

  const { error } = await supabase.rpc('cancel_registration', {
    p_registration_id: registration.id,
  })

  if (error) throw new Error(error.message)

  revalidatePath(`/runner/events/${eventId}`)
}

export async function generateConsentCode(registrationId: string) {
  const { supabase } = await requireAuth()

  const { error: regError } = await supabase
    .from('registrations')
    .select('id')
    .eq('id', registrationId)
    .single()

  if (regError) throw new Error('Registration not found')

  return fetchDjangoApi('/ai/qr/consent-code', {
    method: 'POST',
    body: JSON.stringify({ registration_id: registrationId }),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Actions
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteEvent(eventId: string) {
  const { supabase } = await requireAuth()

  const { error } = await supabase.from('events').delete().eq('id', eventId)
  if (error) throw new Error(error.message)

  redirect('/organizer/events')
}

export async function updateEventStatus(
  eventId: string,
  status: 'draft' | 'published' | 'closed'
) {
  const { supabase } = await requireAuth()

  const { error } = await supabase
    .from('events')
    .update({ status })
    .eq('id', eventId)

  if (error) throw new Error(error.message)

  revalidatePath(`/organizer/events/${eventId}`)
}

export async function setResultsPublished(eventId: string, published: boolean) {
  const { supabase } = await requireAuth()

  const { error } = await supabase
    .from('events')
    .update({ results_published: published })
    .eq('id', eventId)

  if (error) throw new Error(error.message)

  revalidatePath(`/organizer/events/${eventId}`)
  revalidatePath(`/organizer/events/${eventId}/leaderboard`)
  revalidatePath('/runner/leaderboard')
}

export async function updateEventDates(
  eventId: string,
  updates: { reg_open?: string | null; reg_close?: string | null }
) {
  const { supabase } = await requireAuth()

  const { error } = await supabase
    .from('events')
    .update(updates)
    .eq('id', eventId)

  if (error) throw new Error(error.message)

  revalidatePath(`/organizer/events/${eventId}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme Actions (Event Themes P1 — Task 13)
// ─────────────────────────────────────────────────────────────────────────────

export type SaveEventThemeResult =
  | { ok: true; warnings: string[] }
  | { ok: false; error: string }

/**
 * Write an event's theme (both columns: `theme_preset_id` + `theme_config`).
 *
 * Server-side guarantees (carried requirements):
 *  - ownership: the 077 anti-IDOR trigger bypasses postgres/service_role and
 *    the BFF path has no DB-level ownership check — the event must belong to
 *    the caller's organizer BEFORE anything is written;
 *  - preset reference: system OR owned by the caller's organizer (same
 *    trigger-bypass rationale, defense in depth); a NEW (not-yet-referenced)
 *    preset must also be is_active (Task 8) — deactivation hides it from the
 *    gallery and blocks switching to it; the already-referenced preset is
 *    exempt (deactivated-but-themed events keep rendering, resolve unchanged);
 *  - validation: validateThemeConfig re-runs HERE — client validation is UX
 *    only (Task 9). Hard-blocks on `errors` (only the primary <3:1 rule);
 *    warnings ride along as structured strings (render as text children).
 *
 * Reset semantics (Task 3/9 carries): per-key reset = the draft omits the
 * key (JSON nulls are rejected at every level); full reset = null/null.
 */
export async function saveEventTheme(
  eventId: string,
  input: { theme_preset_id: string | null; theme_config: ThemeTokens | null }
): Promise<SaveEventThemeResult> {
  const { supabase, user } = await requireAuth()

  const organizerId = user.app_metadata?.organizer_id
  if (!organizerId) return { ok: false, error: 'Organizer profile not found' }

  const { data: event } = await supabase
    .from('events')
    .select('id, organizer_id, theme_preset_id')
    .eq('id', eventId)
    .single()

  if (!event || event.organizer_id !== organizerId) {
    return { ok: false, error: 'You can only theme events you organize.' }
  }

  const presetId = input.theme_preset_id || null
  if (presetId !== null) {
    const { data: preset } = await supabase
      .from('theme_presets')
      .select('id, kind, organizer_id, is_active')
      .eq('id', presetId)
      .maybeSingle()

    const permitted =
      preset != null &&
      ((preset.kind === 'system' && preset.organizer_id === null) ||
        (preset.kind === 'organizer' && preset.organizer_id === organizerId))

    if (!permitted) return { ok: false, error: 'Unknown or not permitted theme preset.' }

    // Task 8: deactivation gates SELECTION only — switching to an inactive
    // preset is rejected fail-closed (same structured treatment as the
    // ownership violation, no PII). Re-saving an already-referenced preset
    // stays allowed so deactivated-but-themed events keep rendering
    // (resolve.ts unchanged, @manager ruling, formerly ruling #10).
    if (presetId !== event.theme_preset_id && preset.is_active === false) {
      return { ok: false, error: 'That theme preset is no longer available.' }
    }
  }

  const validation = validateThemeConfig(input.theme_config)
  if (!validation.ok) {
    return { ok: false, error: validation.errors.join(' · ') }
  }

  const { error } = await supabase
    .from('events')
    .update({ theme_preset_id: presetId, theme_config: input.theme_config })
    .eq('id', eventId)

  if (error) return { ok: false, error: error.message }

  // Organizer view + every themed runner consumer (runner event page and the
  // single-event leaderboard, Task 12).
  revalidatePath(`/organizer/events/${eventId}`)
  revalidatePath(`/runner/events/${eventId}`)
  revalidatePath('/runner/leaderboard')

  // P2 Task 7 — orphan cleanup runs ONLY after a successful save, with the
  // FRESHLY-READ DB config (NOT the client draft — the DB is the canonical
  // reference set). Same authenticated RLS context as the write (the event
  // owner passes `can_manage_theme_path` for its own tenant folder); cleanup
  // never throws — failures surface as structured warnings.
  const warnings = [...validation.warnings]
  const { data: savedRow } = await supabase
    .from('events')
    .select('theme_config')
    .eq('id', eventId)
    .single()

  const savedConfig = (savedRow?.theme_config ?? null) as unknown
  const refs: Record<string, unknown> = {}
  if (isPlainObject(savedConfig)) {
    for (const section of ['assets', 'typography'] as const) {
      const value = savedConfig[section]
      if (!isPlainObject(value)) continue
      for (const [key, v] of Object.entries(value)) {
        if (typeof v === 'string' && key.endsWith('_url')) refs[key] = v
      }
    }
  }
  const cleanup = await cleanupThemeAssets(supabase, { organizerId, eventId, savedAssets: refs })
  warnings.push(...cleanup.warnings)

  return { ok: true, warnings }
}

// ─────────────────────────────────────────────────────────────────────────────
// Category Actions
// ─────────────────────────────────────────────────────────────────────────────

export async function createCategory(eventId: string, formData: FormData) {
  const { supabase } = await requireAuth()

  const { data: event } = await supabase
    .from('events')
    .select('organizer_id')
    .eq('id', eventId)
    .single()

  if (!event) throw new Error('Event not found')

  const { error } = await supabase.from('race_categories').insert({
    event_id: eventId,
    organizer_id: event.organizer_id,
    ...parseCategoryForm(formData),
  })

  if (error) throw new Error(error.message)

  revalidatePath(`/organizer/events/${eventId}/categories`)
}

/** Shared FormData → race_categories column mapping for create/update. */
function parseCategoryForm(formData: FormData) {
  return {
    name: formData.get('name') as string,
    gender: (formData.get('gender') as string) || null,
    min_age: formData.get('min_age') ? parseInt(formData.get('min_age') as string) : null,
    max_age: formData.get('max_age') ? parseInt(formData.get('max_age') as string) : null,
    bib_prefix: (formData.get('bib_prefix') as string) || null,
    bib_start: formData.get('bib_start') ? parseInt(formData.get('bib_start') as string) : 1,
    max_slots: formData.get('max_slots') ? parseInt(formData.get('max_slots') as string) : null,
    price: formData.get('price') ? parseFloat(formData.get('price') as string) : 0,
  }
}

export async function updateCategory(
  categoryId: string,
  eventId: string,
  formData: FormData
) {
  const { supabase } = await requireAuth()

  const { error } = await supabase
    .from('race_categories')
    .update(parseCategoryForm(formData))
    .eq('id', categoryId)

  if (error) throw new Error(error.message)

  revalidatePath(`/organizer/events/${eventId}/categories`)
}

export async function deleteCategory(categoryId: string, eventId: string) {
  const { supabase } = await requireAuth()

  const { error } = await supabase
    .from('race_categories')
    .delete()
    .eq('id', categoryId)

  if (error) throw new Error(error.message)

  revalidatePath(`/organizer/events/${eventId}/categories`)
}

// ─────────────────────────────────────────────────────────────────────────────
// REPC Actions
// ─────────────────────────────────────────────────────────────────────────────

const SHIRT_SIZES = MERCH_SIZE_PRESETS

function parseInventoryQuantity(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || value.trim() === '') return 0

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return 0

  return parsed
}

export async function updateEventShirtInventory(eventId: string, formData: FormData) {
  const { supabase } = await requireAuth()

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, organizer_id')
    .eq('id', eventId)
    .single()

  if (eventError || !event) {
    throw new Error(eventError?.message || 'Event not found')
  }

  const { data: currentRows, error: rowsError } = await supabase
    .from('event_shirt_inventory')
    .select('size, claimed_qty')
    .eq('event_id', eventId)

  if (rowsError) throw new Error(rowsError.message)

  const claimedBySize = new Map(
    (currentRows ?? []).map((row: { size: string; claimed_qty: number | null }) => [
      row.size,
      row.claimed_qty ?? 0,
    ])
  )

  const rows = SHIRT_SIZES.map((size) => {
    const initialQty = parseInventoryQuantity(formData.get(`initial_qty_${size}`))
    const claimedQty = claimedBySize.get(size) ?? 0

    if (initialQty < claimedQty) {
      throw new Error(`${size} stock cannot be below ${claimedQty} already claimed shirts.`)
    }

    return {
      event_id: eventId,
      organizer_id: event.organizer_id,
      size,
      initial_qty: initialQty,
      claimed_qty: claimedQty,
    }
  })

  const { error: upsertError } = await supabase
    .from('event_shirt_inventory')
    .upsert(rows, { onConflict: 'event_id,size' })

  if (upsertError) throw new Error(upsertError.message)

  revalidatePath(`/organizer/events/${eventId}`)
  revalidatePath(`/organizer/events/${eventId}/repc`)
  revalidatePath(`/organizer/events/${eventId}/checkin`)
}

/** Common failure shape for REPC check-in results. */
function failResult(message: string, bibNumber: string | null): RepcCheckInResult {
  return {
    success: false,
    message,
    registrationId: null,
    bibNumber,
    runnerName: null,
    shirtSize: null,
    remainingQty: null,
    alreadyCheckedIn: false,
  }
}

type BibRegRow = { id?: string; runner_id: string | null; bib_number: string | null }

/**
 * BIB lookup with case-insensitive fallback: exact match first, then ilike.
 * Single source for the REPC check-in and photo-confirm flows.
 */
async function findRegistrationByBibLoose(
  supabase: SupabaseClient,
  eventId: string,
  bibNumber: string,
  select: string
): Promise<{ data: BibRegRow | null; error: PostgrestError | null }> {
  const exact = await supabase
    .from('registrations')
    .select(select)
    .eq('event_id', eventId)
    .eq('bib_number', bibNumber)
    .maybeSingle()

  if (exact.data || exact.error) {
    return { data: exact.data as BibRegRow | null, error: exact.error }
  }

  const loose = await supabase
    .from('registrations')
    .select(select)
    .eq('event_id', eventId)
    .ilike('bib_number', bibNumber)
    .maybeSingle()

  return { data: loose.data as BibRegRow | null, error: loose.error }
}

export async function checkInRegistrationByBib(
  eventId: string,
  bibNumber: string
): Promise<RepcCheckInResult> {
  const supabase = await createClient()
  const cleanedBibNumber = bibNumber.trim()

  if (!cleanedBibNumber) {
    return failResult('Enter a BIB number.', null)
  }

  const { data: registration, error: registrationError } = await findRegistrationByBibLoose(
    supabase,
    eventId,
    cleanedBibNumber,
    'runner_id, bib_number'
  )

  if (registrationError) {
    return failResult(registrationError.message, cleanedBibNumber)
  }

  if (!registration?.runner_id || !registration.bib_number) {
    return failResult('Registration not found.', cleanedBibNumber)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase.rpc(REPC_CHECK_IN_RPC, {
    p_event_id: eventId,
    p_runner_id: registration.runner_id,
    p_bib_number: registration.bib_number,
    p_is_proxy: false,
    p_consent_code: null,
    p_collected_by: user?.email ?? user?.id ?? null,
  })

  if (error) {
    console.error(`${REPC_CHECK_IN_RPC} RPC error:`, { message: error.message, eventId, bib: registration.bib_number })
    return failResult(error.message, registration.bib_number)
  }

  const result = normalizeRepcCheckInResult((data?.[0] ?? null) as RepcCheckInRpcRow | null)

  revalidatePath(`/organizer/events/${eventId}`)
  revalidatePath(`/organizer/events/${eventId}/registrations`)
  revalidatePath(`/organizer/events/${eventId}/repc`)
  revalidatePath(`/organizer/events/${eventId}/checkin`)

  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Photo Actions
// ─────────────────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Gate for the Django photo pipeline, which writes photo_tags with the
 * service-role key (RLS bypassed). The caller must own the event; the
 * organizer id comes from the verified session, never from the client.
 * Returns the only storage folder the caller may process — the same
 * `{uid}/{eventId}` folder the race-photos upload policy allows.
 */
async function requireEventPhotoOwner(eventId: string, batchId: string) {
  const { supabase, user } = await requireAuth()
  const organizerId = user.app_metadata?.organizer_id

  if (typeof organizerId !== 'string' || !organizerId) {
    throw new Error('Only organizers can run AI photo tagging.')
  }
  if (!UUID_RE.test(eventId) || !UUID_RE.test(batchId)) {
    throw new Error('Invalid event or batch id.')
  }

  const { data: event, error } = await supabase
    .from('events')
    .select('id, organizer_id')
    .eq('id', eventId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!event || event.organizer_id !== organizerId) {
    throw new Error('You can only run AI photo tagging for your own events.')
  }

  return { organizerId, userId: user.id, eventFolder: `${user.id}/${eventId}` }
}

/** True when `path` is `folder` itself or sits inside it, with no `..` hops. */
function isInsideFolder(path: string, folder: string) {
  const trimmed = path.replace(/\/+$/, '')
  if (trimmed.split('/').some((segment) => segment === '..' || segment === '.')) return false
  return trimmed === folder || trimmed.startsWith(`${folder}/`)
}

/**
 * Queue an uploaded batch for the background photo worker (FR-16).
 * Returns as soon as Django has queued it; progress lives in photo_batches.
 */
export async function triggerPhotoProcessing(
  eventId: string,
  storagePaths: string[],
  batchId = crypto.randomUUID()
): Promise<PhotoBatch> {
  const { organizerId, userId, eventFolder } = await requireEventPhotoOwner(eventId, batchId)

  if (
    !Array.isArray(storagePaths) ||
    storagePaths.length === 0 ||
    !storagePaths.every((path) => typeof path === 'string' && isInsideFolder(path, eventFolder))
  ) {
    throw new Error('Photos must be uploaded to this event before they can be tagged.')
  }

  const batch: PhotoBatch = await fetchDjangoApi('/ai/photos/process', {
    method: 'POST',
    body: JSON.stringify({
      batch_id: batchId,
      event_id: eventId,
      organizer_id: organizerId,
      created_by: userId,
      storage_paths: storagePaths,
    }),
  })

  revalidatePath(`/organizer/events/${eventId}/photos`)
  return batch
}

/** Queue every photo already uploaded under `prefix` as one reprocess batch. */
export async function triggerPhotoProcessingForPrefix(
  eventId: string,
  prefix: string,
  batchId = crypto.randomUUID()
): Promise<PhotoBatch> {
  const { organizerId, userId, eventFolder } = await requireEventPhotoOwner(eventId, batchId)

  if (typeof prefix !== 'string' || !isInsideFolder(prefix, eventFolder)) {
    throw new Error('You can only reprocess uploads for this event.')
  }

  const batch: PhotoBatch = await fetchDjangoApi('/ai/photos/process-prefix', {
    method: 'POST',
    body: JSON.stringify({
      batch_id: batchId,
      event_id: eventId,
      organizer_id: organizerId,
      created_by: userId,
      bucket: 'race-photos',
      prefix,
    }),
  })

  revalidatePath(`/organizer/events/${eventId}/photos`)
  return batch
}

export type ReviewPhotoActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
}

function getRequiredFormValue(formData: FormData, key: string) {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${key} is required`)
  }
  return value.trim()
}

async function findRegistrationForBib(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  bibNumber: string
) {
  const { data, error } = await findRegistrationByBibLoose(
    supabase,
    eventId,
    bibNumber,
    'id, runner_id, bib_number'
  )
  if (error) throw new Error(error.message)
  return data
}

export async function confirmReviewPhoto(
  _previousState: ReviewPhotoActionState,
  formData: FormData
): Promise<ReviewPhotoActionState> {
  const { supabase } = await requireAuth()

  try {
    const eventId = getRequiredFormValue(formData, 'eventId')
    const photoTagId = getRequiredFormValue(formData, 'photoTagId')
    const storagePath = getRequiredFormValue(formData, 'storagePath')
    const bibNumber = getRequiredFormValue(formData, 'bibNumber')

    const registration = await findRegistrationForBib(supabase, eventId, bibNumber)

    if (!registration) {
      return {
        status: 'error',
        message: `No registration found for BIB ${bibNumber} in this event.`,
      }
    }

    const { data: photoTag, error: photoError } = await supabase
      .from('photo_tags')
      .select('id, event_id, organizer_id, storage_path, batch_id')
      .eq('id', photoTagId)
      .eq('event_id', eventId)
      .eq('storage_path', storagePath)
      .single()

    if (photoError || !photoTag) {
      return { status: 'error', message: 'Photo tag not found for this event.' }
    }

    const { error: updateError } = await supabase
      .from('photo_tags')
      .update({
        bib_number: registration.bib_number,
        registration_id: registration.id,
        runner_id: registration.runner_id,
        status: 'confirmed',
      })
      .eq('id', photoTag.id)
      .eq('event_id', eventId)

    if (updateError) {
      return { status: 'error', message: updateError.message }
    }

    revalidatePath(`/organizer/events/${eventId}/photos`)
    return {
      status: 'success',
      message: `Confirmed BIB ${registration.bib_number}.`,
    }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Could not confirm this photo.',
    }
  }
}

export async function discardReviewPhoto(
  _previousState: ReviewPhotoActionState,
  formData: FormData
): Promise<ReviewPhotoActionState> {
  const { supabase } = await requireAuth()

  try {
    const eventId = getRequiredFormValue(formData, 'eventId')
    const photoTagId = getRequiredFormValue(formData, 'photoTagId')

    const { error } = await supabase
      .from('photo_tags')
      .update({
        status: 'discarded',
        registration_id: null,
        runner_id: null,
      })
      .eq('id', photoTagId)
      .eq('event_id', eventId)
      .eq('status', 'review')

    if (error) {
      return { status: 'error', message: error.message }
    }

    revalidatePath(`/organizer/events/${eventId}/photos`)
    return { status: 'success', message: 'Review tag rejected.' }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Could not reject this photo.',
    }
  }
}

export async function movePhotoTagToReview(
  _previousState: ReviewPhotoActionState,
  formData: FormData
): Promise<ReviewPhotoActionState> {
  const { supabase } = await requireAuth()

  try {
    const eventId = getRequiredFormValue(formData, 'eventId')
    const photoTagId = getRequiredFormValue(formData, 'photoTagId')

    const { error } = await supabase
      .from('photo_tags')
      .update({
        status: 'review',
        registration_id: null,
        runner_id: null,
      })
      .eq('id', photoTagId)
      .eq('event_id', eventId)
      .in('status', ['auto', 'confirmed'])

    if (error) {
      return { status: 'error', message: error.message }
    }

    revalidatePath(`/organizer/events/${eventId}/photos`)
    return { status: 'success', message: 'Tag moved back to review.' }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Could not move this tag to review.',
    }
  }
}

export async function requestRunnerPhotoReview(
  _previousState: ReviewPhotoActionState,
  formData: FormData
): Promise<ReviewPhotoActionState> {
  const { supabase } = await requireAuth()

  try {
    const eventId = getRequiredFormValue(formData, 'eventId')
    const photoTagId = getRequiredFormValue(formData, 'photoTagId')

    const { data, error } = await supabase.rpc('runner_request_photo_review', {
      p_event_id: eventId,
      p_photo_tag_id: photoTagId,
    })

    if (error) {
      return { status: 'error', message: error.message }
    }

    const result = data?.[0] as { success?: boolean; message?: string } | undefined

    if (!result?.success) {
      return {
        status: 'error',
        message: result?.message ?? 'Could not send this photo back to review.',
      }
    }

    revalidatePath(`/runner/events/${eventId}/gallery`)
    revalidatePath(`/organizer/events/${eventId}/photos`)
    return { status: 'success', message: result.message ?? 'Photo sent back to organizer review.' }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Could not send this photo back to review.',
    }
  }
}

export async function restoreRejectedPhoto(
  _previousState: ReviewPhotoActionState,
  formData: FormData
): Promise<ReviewPhotoActionState> {
  const { supabase } = await requireAuth()

  try {
    const eventId = getRequiredFormValue(formData, 'eventId')
    const storagePath = getRequiredFormValue(formData, 'storagePath')

    const { error } = await supabase
      .from('photo_tags')
      .update({ status: 'review' })
      .eq('event_id', eventId)
      .eq('storage_path', storagePath)
      .eq('status', 'discarded')

    if (error) {
      return { status: 'error', message: error.message }
    }

    revalidatePath(`/organizer/events/${eventId}/photos`)
    return { status: 'success', message: 'Rejected tags restored to review.' }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Could not restore this photo.',
    }
  }
}
