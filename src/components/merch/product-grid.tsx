'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ProductFormDialog } from '@/components/merch/product-form-dialog'
import { deleteMerchProduct, setMerchProductActive } from '@/components/merch/actions'
import {
  formatRM,
  merchImageUrl,
  stockLevel,
  variantLabel,
  type MerchProduct,
  type StockLevel,
} from '@/lib/merch'

const LEVEL_CHIP: Record<StockLevel, string> = {
  out: 'border-[#ffb4ab]/40 text-[#ffb4ab] bg-[#ffb4ab]/10',
  low: 'border-[#f5c26b]/40 text-[#f5c26b] bg-[#f5c26b]/10',
  ok: 'border-[#494454] text-[#cbc3d7]',
}

type ProductGridProps = {
  products: MerchProduct[]
  eventId: string
  organizerId: string
}

export function ProductGrid({ products, eventId, organizerId }: ProductGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} eventId={eventId} organizerId={organizerId} />
      ))}
    </div>
  )
}

function ProductCard({
  product,
  eventId,
  organizerId,
}: {
  product: MerchProduct
  eventId: string
  organizerId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [deleteOpen, setDeleteOpen] = useState(false)

  const variants = product.merch_variants
  const totalStock = variants.reduce((sum, v) => sum + v.stock, 0)
  const alertCount = variants.filter((v) => stockLevel(v.stock, product.low_stock_threshold) !== 'ok').length
  const imageUrl = merchImageUrl(product.image_path)

  const toggleActive = () => {
    startTransition(async () => {
      const result = await setMerchProductActive(product.id, !product.is_active)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(product.is_active ? 'Hidden from store' : 'Visible in store')
      router.refresh()
    })
  }

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteMerchProduct(product.id)
      setDeleteOpen(false)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Product deleted')
      router.refresh()
    })
  }

  return (
    <div className="bg-[#1c1b1d] rounded-xl border border-[#23232b] overflow-hidden flex flex-col hover:border-[#4cd7f6]/30 transition-all">
      <div className="relative aspect-[16/9] bg-[#201f22] flex items-center justify-center">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="material-symbols-outlined text-[40px] text-[#494454]">apparel</span>
        )}
        <span
          className={`absolute top-3 right-3 text-[10px] leading-[14px] px-2 py-0.5 rounded-full font-semibold border backdrop-blur ${
            product.is_active
              ? 'text-[#4edea3] bg-[#131315]/70 border-[#4edea3]/30'
              : 'text-[#cbc3d7] bg-[#131315]/70 border-[#494454]'
          }`}
        >
          {product.is_active ? 'Active' : 'Hidden'}
        </span>
      </div>

      <div className="p-5 flex flex-col gap-4 flex-1">
        <div className="flex flex-col gap-1 min-w-0">
          <h3 className="text-[15px] leading-[20px] font-semibold text-[#e5e1e4] truncate">{product.name}</h3>
          {product.description && (
            <p className="text-[12px] leading-[16px] text-[#958ea0] line-clamp-2">{product.description}</p>
          )}
        </div>

        <div className="flex items-end justify-between">
          <div className="flex flex-col">
            <span className="text-[22px] leading-[28px] tracking-[-0.015em] font-semibold text-[#e5e1e4]">
              {formatRM(product.price)}
            </span>
            <span className="text-[11px] text-[#958ea0]">
              {variants.length} variant{variants.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[22px] leading-[28px] font-semibold text-[#e5e1e4]">{totalStock}</span>
            <div className={`text-[11px] ${alertCount > 0 ? 'text-[#f5c26b]' : 'text-[#958ea0]'}`}>
              {alertCount > 0 ? `${alertCount} low / sold out` : 'in stock'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {variants.map((v) => (
            <span
              key={v.id}
              className={`text-[11px] leading-[14px] px-2 py-1 rounded border ${LEVEL_CHIP[stockLevel(v.stock, product.low_stock_threshold)]}`}
            >
              {variantLabel(v)} · {v.stock}
            </span>
          ))}
        </div>

        <div className="mt-auto flex items-center gap-2 pt-3 border-t border-[#23232b]">
          <ProductFormDialog
            eventId={eventId}
            organizerId={organizerId}
            product={product}
            trigger={
              <button className="flex-1 h-10 bg-[#201f22] hover:bg-[#2a2a2c] text-[#e5e1e4] text-[12px] font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors border border-[#353437]">
                <Pencil className="h-4 w-4" /> Edit
              </button>
            }
          />
          <button
            onClick={toggleActive}
            disabled={isPending}
            title={product.is_active ? 'Hide from store' : 'Show in store'}
            aria-label={product.is_active ? 'Hide from store' : 'Show in store'}
            className="h-10 w-10 flex items-center justify-center text-[#958ea0] hover:text-[#e5e1e4] hover:bg-[#2a2a2c] rounded-lg transition-colors disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : product.is_active ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={() => setDeleteOpen(true)}
            disabled={isPending}
            title="Delete product"
            aria-label="Delete product"
            className="h-10 w-10 flex items-center justify-center text-[#958ea0] hover:text-[#ffb4ab] hover:bg-[#ffb4ab]/10 rounded-lg transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {product.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the product, its variants and image. Products that already have orders
              can&apos;t be deleted. Hide them from the store instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
              disabled={isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
