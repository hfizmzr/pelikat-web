'use server'

import { createClient } from '@/lib/supabase/server'
import { fetchDjangoApi } from '@/lib/django'
import {
  normalizeRepcCheckInResult,
  type RepcCheckInResult,
  type RepcCheckInRpcRow,
} from '@/lib/repc'
import { requireAuth } from '@/lib/auth/requireUser'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// ─────────────────────────────────────────────────────────────────────────────
// Registration Actions
// ─────────────────────────────────────────────────────────────────────────────

export async function confirmDummyPayment(registrationId: string) {
  const { supabase } = await requireAuth()

  const { error } = await supabase.rpc('confirm_dummy_payment', {
    p_registration_id: registrationId,
  })

  if (error) throw new Error(error.message)
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

  const { data: registration, error: regError } = await supabase
    .from('registrations')
    .select('id, organizer_id')
    .eq('id', registrationId)
    .single()

  if (regError || !registration) throw new Error('Registration not found')

  return fetchDjangoApi('/ai/qr/consent-code', {
    method: 'POST',
    body: JSON.stringify({ registration_id: registrationId }),
  })
}

export async function exportRegistrationsCsv(
  registrations: {
    bib_number: string
    checked_in: boolean
    payment_status: string
    runner_profiles: { full_name: string; phone: string } | null
    race_categories: { name: string } | null
  }[]
) {
  'use server'

  const { user } = await requireAuth()
  void user

  const headers = ['BIB', 'Name', 'Category', 'Phone', 'Payment', 'Checked In']
  const rows = registrations.map((reg) => [
    reg.bib_number,
    reg.runner_profiles?.full_name || '',
    reg.race_categories?.name || '',
    reg.runner_profiles?.phone || '',
    reg.payment_status,
    reg.checked_in ? 'Yes' : 'No',
  ])

  const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`
  return [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n')
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
    name: formData.get('name') as string,
    gender: (formData.get('gender') as string) || null,
    min_age: formData.get('min_age') ? parseInt(formData.get('min_age') as string) : null,
    max_age: formData.get('max_age') ? parseInt(formData.get('max_age') as string) : null,
    bib_prefix: (formData.get('bib_prefix') as string) || null,
    bib_start: formData.get('bib_start') ? parseInt(formData.get('bib_start') as string) : 1,
    max_slots: formData.get('max_slots') ? parseInt(formData.get('max_slots') as string) : null,
    price: formData.get('price') ? parseFloat(formData.get('price') as string) : 0,
  })

  if (error) throw new Error(error.message)

  revalidatePath(`/organizer/events/${eventId}/categories`)
}

export async function updateCategory(
  categoryId: string,
  eventId: string,
  formData: FormData
) {
  const { supabase } = await requireAuth()

  const { error } = await supabase
    .from('race_categories')
    .update({
      name: formData.get('name') as string,
      gender: (formData.get('gender') as string) || null,
      min_age: formData.get('min_age') ? parseInt(formData.get('min_age') as string) : null,
      max_age: formData.get('max_age') ? parseInt(formData.get('max_age') as string) : null,
      bib_prefix: (formData.get('bib_prefix') as string) || null,
      bib_start: formData.get('bib_start') ? parseInt(formData.get('bib_start') as string) : 1,
      max_slots: formData.get('max_slots') ? parseInt(formData.get('max_slots') as string) : null,
      price: formData.get('price') ? parseFloat(formData.get('price') as string) : 0,
    })
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

const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const

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

export async function checkInRegistrationByBib(
  eventId: string,
  bibNumber: string
): Promise<RepcCheckInResult> {
  const supabase = await createClient()
  const cleanedBibNumber = bibNumber.trim()

  if (!cleanedBibNumber) {
    return {
      success: false,
      message: 'Enter a BIB number.',
      registrationId: null,
      bibNumber: null,
      runnerName: null,
      shirtSize: null,
      remainingQty: null,
      alreadyCheckedIn: false,
    }
  }

  let { data: registration, error: registrationError } = await supabase
    .from('registrations')
    .select('runner_id, bib_number')
    .eq('event_id', eventId)
    .eq('bib_number', cleanedBibNumber)
    .maybeSingle()

  if (!registration && !registrationError) {
    const fallback = await supabase
      .from('registrations')
      .select('runner_id, bib_number')
      .eq('event_id', eventId)
      .ilike('bib_number', cleanedBibNumber)
      .maybeSingle()

    registration = fallback.data
    registrationError = fallback.error
  }

  if (registrationError) {
    return {
      success: false,
      message: registrationError.message,
      registrationId: null,
      bibNumber: cleanedBibNumber,
      runnerName: null,
      shirtSize: null,
      remainingQty: null,
      alreadyCheckedIn: false,
    }
  }

  if (!registration?.runner_id || !registration.bib_number) {
    return {
      success: false,
      message: 'Registration not found.',
      registrationId: null,
      bibNumber: cleanedBibNumber,
      runnerName: null,
      shirtSize: null,
      remainingQty: null,
      alreadyCheckedIn: false,
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase.rpc('repc_check_in_registration', {
    p_event_id: eventId,
    p_runner_id: registration.runner_id,
    p_bib_number: registration.bib_number,
    p_is_proxy: false,
    p_consent_code: null,
    p_collected_by: user?.email ?? user?.id ?? null,
  })

  if (error) {
    console.error('repc_check_in_registration RPC error:', { message: error.message, eventId, bib: registration.bib_number })
    return {
      success: false,
      message: error.message,
      registrationId: null,
      bibNumber: registration.bib_number,
      runnerName: null,
      shirtSize: null,
      remainingQty: null,
      alreadyCheckedIn: false,
    }
  }

  revalidatePath(`/organizer/events/${eventId}`)
  revalidatePath(`/organizer/events/${eventId}/registrations`)
  revalidatePath(`/organizer/events/${eventId}/repc`)
  revalidatePath(`/organizer/events/${eventId}/checkin`)

  return normalizeRepcCheckInResult((data?.[0] ?? null) as RepcCheckInRpcRow | null)
}

// ─────────────────────────────────────────────────────────────────────────────
// Photo Actions
// ─────────────────────────────────────────────────────────────────────────────

export async function triggerPhotoProcessing(
  eventId: string,
  organizerId: string,
  storagePaths: string[],
  batchId = crypto.randomUUID()
) {
  await requireAuth()

  await fetchDjangoApi('/ai/photos/process', {
    method: 'POST',
    body: JSON.stringify({
      batch_id: batchId,
      event_id: eventId,
      organizer_id: organizerId,
      storage_paths: storagePaths,
    }),
  })

  revalidatePath(`/organizer/events/${eventId}/photos`)
  return batchId
}

export async function triggerPhotoProcessingForPrefix(
  eventId: string,
  organizerId: string,
  prefix: string,
  batchId = crypto.randomUUID()
) {
  await requireAuth()

  await fetchDjangoApi('/ai/photos/process-prefix', {
    method: 'POST',
    body: JSON.stringify({
      batch_id: batchId,
      event_id: eventId,
      organizer_id: organizerId,
      bucket: 'race-photos',
      prefix,
    }),
  })

  revalidatePath(`/organizer/events/${eventId}/photos`)
  return batchId
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
  let { data: registration, error: registrationError } = await supabase
    .from('registrations')
    .select('id, runner_id, bib_number')
    .eq('event_id', eventId)
    .eq('bib_number', bibNumber)
    .maybeSingle()

  if (!registration && !registrationError) {
    const fallback = await supabase
      .from('registrations')
      .select('id, runner_id, bib_number')
      .eq('event_id', eventId)
      .ilike('bib_number', bibNumber)
      .maybeSingle()

    registration = fallback.data
    registrationError = fallback.error
  }

  if (registrationError) throw new Error(registrationError.message)
  return registration
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
