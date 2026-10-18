'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth/requireUser'
import { MERCH_IMAGE_BUCKET, type MerchOrderStatus } from '@/lib/merch'

// Results are returned rather than thrown: Next.js hides thrown error messages
// from Server Actions in production, and these messages are meant for the organizer.
export type MerchActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export type MerchVariantInput = {
  id?: string
  size: string | null
  color: string | null
  stock: number
}

export type MerchProductInput = {
  id?: string
  eventId: string
  name: string
  description: string | null
  price: number
  lowStockThreshold: number
  isActive: boolean
  imagePath: string | null
  variants: MerchVariantInput[]
}

function revalidateMerch() {
  revalidatePath('/organizer/merch')
  revalidatePath('/organizer/mobile/merch')
}

function friendlyDbError(error: { code?: string; message: string }, fallback?: string) {
  if (error.code === '23505') return 'Each variant must have a unique size and color.'
  if (error.code === '23503') {
    return fallback ?? 'This item is referenced by existing orders.'
  }
  return error.message
}

async function requireOrganizer() {
  const { supabase, user } = await requireAuth()
  const organizerId = user.app_metadata?.organizer_id as string | undefined
  return { supabase, organizerId }
}

function validateProduct(input: MerchProductInput): string | null {
  if (!input.name.trim()) return 'Product name is required.'
  if (!Number.isFinite(input.price) || input.price < 0) return 'Price must be 0 or more.'
  if (!Number.isInteger(input.lowStockThreshold) || input.lowStockThreshold < 0) {
    return 'Low-stock threshold must be a whole number, 0 or more.'
  }
  if (input.variants.length === 0) return 'Add at least one variant.'
  for (const variant of input.variants) {
    if (!Number.isInteger(variant.stock) || variant.stock < 0) {
      return 'Stock must be a whole number, 0 or more.'
    }
  }
  return null
}

function normalizeVariant(variant: MerchVariantInput) {
  return {
    size: variant.size?.trim() || null,
    color: variant.color?.trim() || null,
    stock: variant.stock,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Products (FR-37) & stock (FR-38)
// ─────────────────────────────────────────────────────────────────────────────

export async function saveMerchProduct(
  input: MerchProductInput
): Promise<MerchActionResult<{ id: string }>> {
  const { supabase, organizerId } = await requireOrganizer()
  if (!organizerId) return { ok: false, error: 'Organizer account required.' }

  const validationError = validateProduct(input)
  if (validationError) return { ok: false, error: validationError }

  const productFields = {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    price: Math.round(input.price * 100) / 100,
    low_stock_threshold: input.lowStockThreshold,
    is_active: input.isActive,
    image_path: input.imagePath,
    updated_at: new Date().toISOString(),
  }

  // ── Create ────────────────────────────────────────────────────────────────
  if (!input.id) {
    const { data: product, error } = await supabase
      .from('merch_products')
      .insert({ ...productFields, event_id: input.eventId, organizer_id: organizerId })
      .select('id')
      .single()

    if (error || !product) return { ok: false, error: error?.message ?? 'Could not create product.' }

    const { error: variantError } = await supabase
      .from('merch_variants')
      .insert(input.variants.map((v) => ({ ...normalizeVariant(v), product_id: product.id })))

    if (variantError) {
      await supabase.from('merch_products').delete().eq('id', product.id)
      return { ok: false, error: friendlyDbError(variantError) }
    }

    revalidateMerch()
    return { ok: true, data: { id: product.id } }
  }

  // ── Update ────────────────────────────────────────────────────────────────
  const { data: existing, error: fetchError } = await supabase
    .from('merch_products')
    .select('id, image_path, merch_variants(id)')
    .eq('id', input.id)
    .single()

  if (fetchError || !existing) return { ok: false, error: 'Product not found.' }

  const keptIds = new Set(input.variants.filter((v) => v.id).map((v) => v.id))
  const removedIds = (existing.merch_variants ?? [])
    .map((v: { id: string }) => v.id)
    .filter((id: string) => !keptIds.has(id))

  // Remove first so a re-added size/color does not clash with the unique index
  if (removedIds.length > 0) {
    const { error } = await supabase.from('merch_variants').delete().in('id', removedIds)
    if (error) {
      return {
        ok: false,
        error: friendlyDbError(
          error,
          'A variant you removed already has orders. Set its stock to 0 instead.'
        ),
      }
    }
  }

  for (const variant of input.variants.filter((v) => v.id)) {
    const { data: updated, error } = await supabase
      .from('merch_variants')
      .update(normalizeVariant(variant))
      .eq('id', variant.id!)
      .eq('product_id', input.id)
      .select('id')
    if (error) return { ok: false, error: friendlyDbError(error) }
    if (!updated?.length) return { ok: false, error: 'Variant not found. Refresh and try again.' }
  }

  const newVariants = input.variants.filter((v) => !v.id)
  if (newVariants.length > 0) {
    const { error } = await supabase
      .from('merch_variants')
      .insert(newVariants.map((v) => ({ ...normalizeVariant(v), product_id: input.id })))
    if (error) return { ok: false, error: friendlyDbError(error) }
  }

  const { data: updatedProduct, error: updateError } = await supabase
    .from('merch_products')
    .update(productFields)
    .eq('id', input.id)
    .select('id')

  if (updateError) return { ok: false, error: updateError.message }
  if (!updatedProduct?.length) return { ok: false, error: 'Product not found.' }

  if (existing.image_path && existing.image_path !== input.imagePath) {
    await supabase.storage.from(MERCH_IMAGE_BUCKET).remove([existing.image_path])
  }

  revalidateMerch()
  return { ok: true, data: { id: input.id } }
}

export async function deleteMerchProduct(productId: string): Promise<MerchActionResult> {
  const { supabase } = await requireOrganizer()

  const { data: product } = await supabase
    .from('merch_products')
    .select('image_path')
    .eq('id', productId)
    .single()

  if (!product) return { ok: false, error: 'Product not found.' }

  const { error } = await supabase.from('merch_products').delete().eq('id', productId)
  if (error) {
    return {
      ok: false,
      error: friendlyDbError(error, 'This product already has orders. Deactivate it instead.'),
    }
  }

  if (product.image_path) {
    await supabase.storage.from(MERCH_IMAGE_BUCKET).remove([product.image_path])
  }

  revalidateMerch()
  return { ok: true, data: undefined }
}

export async function setMerchProductActive(
  productId: string,
  isActive: boolean
): Promise<MerchActionResult> {
  const { supabase } = await requireOrganizer()

  const { data, error } = await supabase
    .from('merch_products')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', productId)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: 'Product not found.' }

  revalidateMerch()
  return { ok: true, data: undefined }
}

export async function updateMerchVariantStock(
  updates: { id: string; stock: number }[]
): Promise<MerchActionResult> {
  const { supabase } = await requireOrganizer()

  for (const { id, stock } of updates) {
    if (!Number.isInteger(stock) || stock < 0) {
      return { ok: false, error: 'Stock must be a whole number, 0 or more.' }
    }
    const { data, error } = await supabase
      .from('merch_variants')
      .update({ stock })
      .eq('id', id)
      .select('id')
    if (error) return { ok: false, error: error.message }
    if (!data?.length) return { ok: false, error: 'Variant not found. Refresh and try again.' }
  }

  revalidateMerch()
  return { ok: true, data: undefined }
}

// ─────────────────────────────────────────────────────────────────────────────
// Orders (FR-40)
// ─────────────────────────────────────────────────────────────────────────────

export async function updateMerchOrderStatus(
  orderIds: string[],
  status: MerchOrderStatus
): Promise<MerchActionResult<{ updated: number; skipped: number }>> {
  const { supabase } = await requireOrganizer()
  if (orderIds.length === 0) return { ok: false, error: 'No orders selected.' }

  const { data, error } = await supabase.rpc('merch_update_order_status', {
    p_order_ids: orderIds,
    p_status: status,
  })

  if (error) return { ok: false, error: error.message }

  const updated = Number(data ?? 0)
  revalidateMerch()
  return { ok: true, data: { updated, skipped: orderIds.length - updated } }
}
