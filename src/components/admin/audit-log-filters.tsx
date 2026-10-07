'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'

interface AuditLogFiltersProps {
  onFilterChange: (filters: AuditLogFilters) => void
}

export interface AuditLogFilters {
  search: string
  actionType: string
  startDate: Date | undefined
  endDate: Date | undefined
}

const ACTION_TYPES = [
  { value: 'all', label: 'All Actions' },
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'login', label: 'Login' },
  { value: 'approve', label: 'Approve' },
  { value: 'reject', label: 'Reject' },
]

export function AuditLogFilters({ onFilterChange }: AuditLogFiltersProps) {
  const [search, setSearch] = useState('')
  const [actionType, setActionType] = useState('all')
  const [startDate, setStartDate] = useState<Date | undefined>()
  const [endDate, setEndDate] = useState<Date | undefined>()

  const emit = (overrides: Partial<AuditLogFilters>) => {
    onFilterChange({
      search,
      actionType,
      startDate,
      endDate,
      ...overrides,
    })
  }

  const handleReset = () => {
    setSearch('')
    setActionType('all')
    setStartDate(undefined)
    setEndDate(undefined)
    onFilterChange({ search: '', actionType: 'all', startDate: undefined, endDate: undefined })
  }

  const hasFilters = search || actionType !== 'all' || startDate || endDate

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <span className="material-symbols-outlined absolute left-3 top-2.5 text-[#958ea0] text-[18px] pointer-events-none">
          search
        </span>
        <Input
          placeholder="Search by action, actor, or target…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            emit({ search: e.target.value })
          }}
          className="pl-9 bg-[#201f22] border-[#494454]/40 text-[#e5e1e4] placeholder:text-[#958ea0] focus:ring-1 focus:ring-[#d0bcff] focus:border-[#d0bcff] rounded-lg text-[13px]"
        />
      </div>

      {/* Action type */}
      <Select
        value={actionType}
        onValueChange={(val) => {
          setActionType(val)
          emit({ actionType: val })
        }}
      >
        <SelectTrigger className="w-[150px] bg-[#201f22] border-[#494454]/40 text-[#e5e1e4] text-[13px] rounded-lg focus:ring-1 focus:ring-[#d0bcff]">
          <SelectValue placeholder="Action type" />
        </SelectTrigger>
        <SelectContent className="bg-[#201f22] border-[#494454]/40 text-[#e5e1e4]">
          {ACTION_TYPES.map((t) => (
            <SelectItem key={t.value} value={t.value} className="text-[13px] focus:bg-[#2a2a2c] focus:text-[#d0bcff]">
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Start date */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[13px] font-inter transition-colors',
              startDate
                ? 'bg-[#d0bcff]/10 border-[#d0bcff]/30 text-[#d0bcff]'
                : 'bg-[#201f22] border-[#494454]/40 text-[#958ea0] hover:text-[#e5e1e4]'
            )}
          >
            <span className="material-symbols-outlined text-[16px]">calendar_today</span>
            {startDate ? startDate.toLocaleDateString() : 'From'}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-[#201f22] border border-[#494454]/40 rounded-xl">
          <Calendar
            mode="single"
            selected={startDate}
            onSelect={(d) => { setStartDate(d); emit({ startDate: d }) }}
            className="text-[#e5e1e4]"
          />
        </PopoverContent>
      </Popover>

      {/* End date */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[13px] font-inter transition-colors',
              endDate
                ? 'bg-[#d0bcff]/10 border-[#d0bcff]/30 text-[#d0bcff]'
                : 'bg-[#201f22] border-[#494454]/40 text-[#958ea0] hover:text-[#e5e1e4]'
            )}
          >
            <span className="material-symbols-outlined text-[16px]">event</span>
            {endDate ? endDate.toLocaleDateString() : 'To'}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-[#201f22] border border-[#494454]/40 rounded-xl">
          <Calendar
            mode="single"
            selected={endDate}
            onSelect={(d) => { setEndDate(d); emit({ endDate: d }) }}
            className="text-[#e5e1e4]"
          />
        </PopoverContent>
      </Popover>

      {/* Clear filters */}
      {hasFilters && (
        <button
          onClick={handleReset}
          className="flex items-center gap-1 px-3 py-2 rounded-lg text-[13px] text-[#ffb4ab] bg-[#93000a]/10 border border-[#ffb4ab]/20 hover:bg-[#93000a]/20 transition-colors font-inter"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
          Clear
        </button>
      )}
    </div>
  )
}
