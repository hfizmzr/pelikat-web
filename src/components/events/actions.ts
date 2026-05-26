'use server'

import { createClient } from '@/lib/supabase/server'
import { fetchDjangoApi } from '@/lib/django'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// ─────────────────────────────────────────────────────────────────────────────
// Event Actions
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteEvent(eventId: string) {
  const supabase = await createClient()

  const { error } = await supabase.from('events').delete().eq('id', eventId)
  if (error) throw new Error(error.message)

  redirect('/organizer/events')
}

export async function updateEventStatus(
  eventId: string,
  status: 'draft' | 'published' | 'closed'
) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('events')
    .update({ status })
    .eq('id', eventId)

  if (error) throw new Error(error.message)

  revalidatePath(`/organizer/events/${eventId}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Category Actions
// ─────────────────────────────────────────────────────────────────────────────

export async function createCategory(eventId: string, formData: FormData) {
  const supabase = await createClient()

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
  const supabase = await createClient()

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
  const supabase = await createClient()

  const { error } = await supabase
    .from('race_categories')
    .delete()
    .eq('id', categoryId)

  if (error) throw new Error(error.message)

  revalidatePath(`/organizer/events/${eventId}/categories`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Photo Actions
// ─────────────────────────────────────────────────────────────────────────────

export async function triggerPhotoProcessing(
  eventId: string,
  organizerId: string,
  storagePaths: string[]
) {
  const batchId = crypto.randomUUID()

  try {
    await fetchDjangoApi('/ai/photos/process', {
      method: 'POST',
      body: JSON.stringify({
        batch_id: batchId,
        event_id: eventId,
        organizer_id: organizerId,
        storage_paths: storagePaths,
      }),
    })
  } catch (err) {
    // Django may not be running in dev — log and continue
    console.warn('Django photo processing unavailable:', err)
  }

  revalidatePath(`/organizer/events/${eventId}/photos`)
  return batchId
}
