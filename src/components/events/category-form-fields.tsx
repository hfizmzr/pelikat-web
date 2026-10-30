'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type CategoryFormValues = {
  name?: string
  gender?: string | null
  min_age?: number | string | null
  max_age?: number | string | null
  bib_prefix?: string | null
  bib_start?: number | string | null
  max_slots?: number | string | null
  price?: number | string | null
}

/**
 * Shared field grid for the add/edit race-category dialogs. `idPrefix` keeps
 * Label htmlFor unique per dialog; `values` feeds the edit form (add omits it).
 */
export function CategoryFormFields({
  idPrefix,
  values,
  gender,
  onGenderChange,
  disabled,
}: {
  idPrefix: string
  values?: CategoryFormValues
  gender: string
  onGenderChange: (gender: string) => void
  disabled?: boolean
}) {
  const d = (base: string) => `${idPrefix}-${base}`

  return (
    <>
      {/* Name */}
      <div className="grid gap-1.5">
        <Label htmlFor={d('name')}>Category Name *</Label>
        <Input
          id={d('name')}
          name="name"
          placeholder="e.g. Open 10KM"
          defaultValue={values?.name}
          required
          disabled={disabled}
        />
      </div>

      {/* Gender + BIB Prefix */}
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <Label>Gender</Label>
          <Select value={gender} onValueChange={onGenderChange} disabled={disabled}>
            <SelectTrigger>
              <SelectValue placeholder="Open" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Mixed">Mixed / Open</SelectItem>
              <SelectItem value="M">Male</SelectItem>
              <SelectItem value="F">Female</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={d('bib-prefix')}>BIB Prefix</Label>
          <Input
            id={d('bib-prefix')}
            name="bib_prefix"
            placeholder={values ? undefined : 'e.g. A'}
            defaultValue={values?.bib_prefix ?? ''}
            maxLength={5}
            disabled={disabled}
          />
        </div>
      </div>

      {/* Age range */}
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor={d('min-age')}>Min Age</Label>
          <Input
            id={d('min-age')}
            name="min_age"
            type="number"
            min={0}
            max={120}
            placeholder={values ? undefined : 'e.g. 18'}
            defaultValue={values?.min_age ?? ''}
            disabled={disabled}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={d('max-age')}>Max Age</Label>
          <Input
            id={d('max-age')}
            name="max_age"
            type="number"
            min={0}
            max={120}
            placeholder={values ? undefined : 'e.g. 40'}
            defaultValue={values?.max_age ?? ''}
            disabled={disabled}
          />
        </div>
      </div>

      {/* Price + Max Slots + BIB Start */}
      <div className="grid grid-cols-3 gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor={d('price')}>Price (RM)</Label>
          <Input
            id={d('price')}
            name="price"
            type="number"
            min={0}
            step="0.01"
            placeholder={values ? undefined : '0.00'}
            defaultValue={values?.price ?? (values ? 0 : undefined)}
            disabled={disabled}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={d('max-slots')}>Max Slots</Label>
          <Input
            id={d('max-slots')}
            name="max_slots"
            type="number"
            min={1}
            placeholder="Unlimited"
            defaultValue={values?.max_slots ?? ''}
            disabled={disabled}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={d('bib-start')}>BIB Start</Label>
          <Input
            id={d('bib-start')}
            name="bib_start"
            type="number"
            min={1}
            defaultValue={values?.bib_start ?? (values ? 1 : undefined)}
            disabled={disabled}
          />
        </div>
      </div>
    </>
  )
}
