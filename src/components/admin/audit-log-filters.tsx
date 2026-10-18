'use client'

import { Calendar as CalendarIcon, CalendarDays, Search, X } from "lucide-react"
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
        <Search className="absolute left-3 top-2.5 text-muted-foreground size-[18px] pointer-events-none" />
        <Input
          placeholder="Search by action, actor, or target…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            emit({ search: e.target.value })
          }}
          className="pl-9 bg-card border-border/40 text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:border-primary rounded-lg text-[13px]"
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
        <SelectTrigger className="w-[150px] bg-card border-border/40 text-foreground text-[13px] rounded-lg focus:ring-1 focus:ring-primary">
          <SelectValue placeholder="Action type" />
        </SelectTrigger>
        <SelectContent className="bg-card border-border/40 text-foreground">
          {ACTION_TYPES.map((t) => (
            <SelectItem key={t.value} value={t.value} className="text-[13px] focus:bg-accent focus:text-primary">
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
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-card border-border/40 text-muted-foreground hover:text-foreground'
            )}
          >
            <CalendarIcon className="size-[16px]" />
            {startDate ? startDate.toLocaleDateString() : 'From'}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-card border border-border/40 rounded-xl">
          <Calendar
            mode="single"
            selected={startDate}
            onSelect={(d) => { setStartDate(d); emit({ startDate: d }) }}
            className="text-foreground"
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
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-card border-border/40 text-muted-foreground hover:text-foreground'
            )}
          >
            <CalendarDays className="size-[16px]" />
            {endDate ? endDate.toLocaleDateString() : 'To'}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-card border border-border/40 rounded-xl">
          <Calendar
            mode="single"
            selected={endDate}
            onSelect={(d) => { setEndDate(d); emit({ endDate: d }) }}
            className="text-foreground"
          />
        </PopoverContent>
      </Popover>

      {/* Clear filters */}
      {hasFilters && (
        <button
          onClick={handleReset}
          className="flex items-center gap-1 px-3 py-2 rounded-lg text-[13px] text-red-500 dark:text-red-300 bg-red-800/10 border border-red-500/30 dark:border-red-300/20 hover:bg-red-800/20 transition-colors font-inter"
        >
          <X className="size-[16px]" />
          Clear
        </button>
      )}
    </div>
  )
}
