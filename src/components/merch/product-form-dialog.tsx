'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, Loader2, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import {
  MERCH_IMAGE_BUCKET,
  MERCH_SIZE_PRESETS,
  merchImageUrl,
  type MerchProduct,
} from '@/lib/merch'
import { saveMerchProduct, type MerchVariantInput } from '@/components/merch/actions'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

type VariantRow = {
  key: string
  id?: string
  size: string
  color: string
  stock: string
}

type ProductFormDialogProps = {
  eventId: string
  organizerId: string
  product?: MerchProduct
  trigger: React.ReactNode
}

function toRows(product?: MerchProduct): VariantRow[] {
  if (!product || product.merch_variants.length === 0) {
    return [{ key: crypto.randomUUID(), size: '', color: '', stock: '0' }]
  }
  return product.merch_variants.map((v) => ({
    key: v.id,
    id: v.id,
    size: v.size ?? '',
    color: v.color ?? '',
    stock: String(v.stock),
  }))
}

export function ProductFormDialog({ eventId, organizerId, product, trigger }: ProductFormDialogProps) {
  const router = useRouter()
  const isEdit = Boolean(product)
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [isActive, setIsActive] = useState(product?.is_active ?? true)
  const [variants, setVariants] = useState<VariantRow[]>(() => toRows(product))
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(merchImageUrl(product?.image_path ?? null))
  const [removeImage, setRemoveImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Release the local preview blob when it is replaced, cleared or the dialog unmounts
  useEffect(() => {
    if (!imagePreview?.startsWith('blob:')) return
    return () => URL.revokeObjectURL(imagePreview)
  }, [imagePreview])

  const resetState = () => {
    setError(null)
    setIsActive(product?.is_active ?? true)
    setVariants(toRows(product))
    setImageFile(null)
    setImagePreview(merchImageUrl(product?.image_path ?? null))
    setRemoveImage(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (isPending) return
    if (next) resetState()
    setOpen(next)
  }

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError('Image must be JPG, PNG or WebP.')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Image must be 5MB or smaller.')
      return
    }
    setError(null)
    setImageFile(file)
    setRemoveImage(false)
    setImagePreview(URL.createObjectURL(file))
  }

  const clearImage = () => {
    setImageFile(null)
    setImagePreview(null)
    setRemoveImage(true)
  }

  const updateVariant = (key: string, patch: Partial<VariantRow>) => {
    setVariants((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  const addVariant = (size = '') => {
    setVariants((rows) => {
      // Replace the untouched starter row instead of stacking an empty one
      if (rows.length === 1 && !rows[0].id && !rows[0].size && !rows[0].color && rows[0].stock === '0') {
        return [{ ...rows[0], size }]
      }
      return [...rows, { key: crypto.randomUUID(), size, color: '', stock: '0' }]
    })
  }

  const addSizeRun = () => {
    setVariants((rows) => {
      const existing = new Set(rows.map((r) => r.size.toUpperCase()))
      const kept = rows.filter((r) => r.id || r.size || r.color || r.stock !== '0')
      const added = MERCH_SIZE_PRESETS.filter((s) => !existing.has(s)).map((size) => ({
        key: crypto.randomUUID(),
        size,
        color: '',
        stock: '0',
      }))
      return [...kept, ...added]
    })
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    const variantInputs: MerchVariantInput[] = variants.map((row) => ({
      id: row.id,
      size: row.size || null,
      color: row.color || null,
      stock: Number.parseInt(row.stock || '0', 10),
    }))

    setError(null)
    startTransition(async () => {
      const supabase = createClient()
      let imagePath = removeImage ? null : (product?.image_path ?? null)
      let uploadedPath: string | null = null

      if (imageFile) {
        const ext = imageFile.name.split('.').pop()?.toLowerCase() || 'jpg'
        uploadedPath = `${organizerId}/${eventId}/${crypto.randomUUID()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from(MERCH_IMAGE_BUCKET)
          .upload(uploadedPath, imageFile, { contentType: imageFile.type })
        if (uploadError) {
          setError(`Image upload failed: ${uploadError.message}`)
          return
        }
        imagePath = uploadedPath
      }

      const result = await saveMerchProduct({
        id: product?.id,
        eventId,
        name: String(formData.get('name') ?? ''),
        description: String(formData.get('description') ?? ''),
        price: Number.parseFloat(String(formData.get('price') || '0')),
        lowStockThreshold: Number.parseInt(String(formData.get('low_stock_threshold') || '0'), 10),
        isActive,
        imagePath,
        variants: variantInputs,
      })

      if (!result.ok) {
        if (uploadedPath) await supabase.storage.from(MERCH_IMAGE_BUCKET).remove([uploadedPath])
        setError(result.error)
        return
      }

      toast.success(isEdit ? 'Product updated' : 'Product created')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Product' : 'Create Product'}</DialogTitle>
          <DialogDescription>
            Runners see active products in the event merch store. Fields marked * are required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-2">
          {/* Image + core fields */}
          <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
            <div className="flex flex-col gap-2">
              <Label>Image</Label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isPending}
                className="relative aspect-square w-full rounded-lg border border-dashed border-border bg-card overflow-hidden flex items-center justify-center text-muted-foreground hover:border-primary/50 transition-colors"
              >
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePreview} alt="Product preview" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex flex-col items-center gap-1 text-[12px]">
                    <ImagePlus className="h-6 w-6" />
                    Upload
                  </span>
                )}
              </button>
              {imagePreview && (
                <Button type="button" variant="ghost" size="sm" onClick={clearImage} disabled={isPending}>
                  <X className="h-4 w-4" /> Remove
                </Button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(',')}
                className="hidden"
                onChange={handleImageChange}
              />
            </div>

            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="merch-name">Name *</Label>
                <Input
                  id="merch-name"
                  name="name"
                  defaultValue={product?.name}
                  placeholder="e.g. Finisher Tee"
                  required
                  maxLength={120}
                  disabled={isPending}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="merch-description">Description</Label>
                <Textarea
                  id="merch-description"
                  name="description"
                  defaultValue={product?.description ?? ''}
                  placeholder="Material, fit, what's included…"
                  rows={3}
                  maxLength={1000}
                  disabled={isPending}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="merch-price">Price (RM) *</Label>
                  <Input
                    id="merch-price"
                    name="price"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={product?.price ?? ''}
                    placeholder="0.00"
                    required
                    disabled={isPending}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="merch-threshold">Low-stock alert at</Label>
                  <Input
                    id="merch-threshold"
                    name="low_stock_threshold"
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={product?.low_stock_threshold ?? 5}
                    disabled={isPending}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Variants */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Variants & stock *</Label>
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={addSizeRun} disabled={isPending}>
                  Add XS–XXL
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => addVariant()} disabled={isPending}>
                  <Plus className="h-4 w-4" /> Variant
                </Button>
              </div>
            </div>
            <p className="text-[12px] text-muted-foreground">
              Leave size and color empty for single-SKU items like tumblers.
            </p>

            <div className="space-y-2">
              <div className="hidden sm:grid grid-cols-[1fr_1fr_100px_40px] gap-2 text-[11px] text-muted-foreground px-1">
                <span>Size</span>
                <span>Color</span>
                <span>Stock</span>
                <span />
              </div>
              {variants.map((row) => (
                <div key={row.key} className="grid grid-cols-[1fr_1fr_80px_40px] sm:grid-cols-[1fr_1fr_100px_40px] gap-2">
                  <Input
                    aria-label="Size"
                    value={row.size}
                    onChange={(e) => updateVariant(row.key, { size: e.target.value })}
                    placeholder="One size"
                    maxLength={20}
                    list="merch-size-presets"
                    disabled={isPending}
                  />
                  <Input
                    aria-label="Color"
                    value={row.color}
                    onChange={(e) => updateVariant(row.key, { color: e.target.value })}
                    placeholder="—"
                    maxLength={30}
                    disabled={isPending}
                  />
                  <Input
                    aria-label="Stock"
                    type="number"
                    min={0}
                    step={1}
                    value={row.stock}
                    onChange={(e) => updateVariant(row.key, { stock: e.target.value })}
                    required
                    disabled={isPending}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove variant"
                    onClick={() => setVariants((rows) => rows.filter((r) => r.key !== row.key))}
                    disabled={isPending || variants.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <datalist id="merch-size-presets">
                {MERCH_SIZE_PRESETS.map((size) => (
                  <option key={size} value={size} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Visibility */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="merch-active">Visible in store</Label>
              <p className="text-[12px] text-muted-foreground">Inactive products are hidden from runners.</p>
            </div>
            <Switch id="merch-active" checked={isActive} onCheckedChange={setIsActive} disabled={isPending} />
          </div>

          {error && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Create Product'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
