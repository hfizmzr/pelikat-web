'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Settings, Trash2, Globe, EyeOff, XCircle, Loader2, Clock, Save } from 'lucide-react'
import { deleteEvent, updateEventStatus, updateEventDates } from '@/components/events/actions'

type EventStatus = 'draft' | 'published' | 'closed'

interface EventSettingsPanelProps {
  eventId: string
  currentStatus: EventStatus
  eventName: string
  regOpen: string | null
  regClose: string | null
}

const STATUS_OPTIONS: { value: EventStatus; label: string; icon: React.ReactNode; description: string }[] = [
  {
    value: 'draft',
    label: 'Draft',
    icon: <EyeOff className="h-4 w-4" />,
    description: 'Visible only to you. Runners cannot register.',
  },
  {
    value: 'published',
    label: 'Published',
    icon: <Globe className="h-4 w-4" />,
    description: 'Publicly visible. Runners can browse and register.',
  },
  {
    value: 'closed',
    label: 'Closed',
    icon: <XCircle className="h-4 w-4" />,
    description: 'Registration closed. Past results remain visible.',
  },
]

export function EventSettingsPanel({ eventId, currentStatus, eventName, regOpen, regClose }: EventSettingsPanelProps) {
  const [isPending, startTransition] = useTransition()
  const [isDeleting, startDeleting] = useTransition()
  const [open, setOpen] = useState(false)
  const [regOpenValue, setRegOpenValue] = useState(regOpen ?? '')
  const [regCloseValue, setRegCloseValue] = useState(regClose ?? '')
  const [savingDates, setSavingDates] = useState(false)

  const handleStatusChange = (newStatus: EventStatus) => {
    if (newStatus === currentStatus) return
    startTransition(async () => {
      await updateEventStatus(eventId, newStatus)
    })
  }

  const handleDelete = () => {
    startDeleting(async () => {
      await deleteEvent(eventId)
    })
  }

  const handleSaveDates = async () => {
    setSavingDates(true)
    await updateEventDates(eventId, {
      reg_open: regOpenValue || null,
      reg_close: regCloseValue || null,
    })
    setSavingDates(false)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </Button>
      </SheetTrigger>

      <SheetContent className="w-[400px] sm:w-[480px] p-6">
        <SheetHeader>
          <SheetTitle>Event Settings</SheetTitle>
          <SheetDescription>
            Manage settings for <span className="font-medium text-foreground">{eventName}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-8 space-y-6">
          {/* ── Status Section ─────────────────────────────── */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Event Status
            </h3>
            <div className="space-y-2">
              {STATUS_OPTIONS.map((option) => {
                const isActive = currentStatus === option.value
                return (
                  <button
                    type="button"
                    key={option.value}
                    onClick={() => handleStatusChange(option.value)}
                    disabled={isPending || isActive}
                    className={`w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                      isActive
                        ? 'border-primary bg-primary/10 cursor-default'
                        : 'border-border hover:border-primary/50 hover:bg-muted/50 cursor-pointer'
                    }`}
                  >
                    <div className={`mt-0.5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                      {option.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{option.label}</span>
                        {isActive && (
                          <Badge variant="default" className="text-xs py-0">Current</Badge>
                        )}
                        {isPending && !isActive && (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{option.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Registration Window ──────────────────────── */}
          <div className="space-y-3 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Registration Window
              </h3>
            </div>
            <div className="grid gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="reg-open" className="text-xs">Opens</Label>
                <Input
                  id="reg-open"
                  type="datetime-local"
                  value={regOpenValue}
                  onChange={(e) => setRegOpenValue(e.target.value)}
                  className="h-9 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  If set, runners cannot register before this date
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-close" className="text-xs">Closes</Label>
                <Input
                  id="reg-close"
                  type="datetime-local"
                  value={regCloseValue}
                  onChange={(e) => setRegCloseValue(e.target.value)}
                  className="h-9 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  If set, runners cannot register after this date
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSaveDates}
                disabled={savingDates}
              >
                {savingDates ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : (
                  <Save className="mr-2 h-3 w-3" />
                )}
                Save Dates
              </Button>
            </div>
          </div>
          <div className="space-y-3 pt-4 border-t border-border">
            <h3 className="text-sm font-semibold text-destructive uppercase tracking-wide">
              Danger Zone
            </h3>
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
              <div>
                <p className="text-sm font-medium">Delete Event</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Permanently delete this event and all related data (categories, registrations, photos).
                  This action cannot be undone.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={isDeleting}>
                    {isDeleting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Delete Event
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete &ldquo;{eventName}&rdquo;?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the event along with all race categories,
                      registrations, and photo records. This action <strong>cannot</strong> be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-destructive !text-white hover:bg-destructive/90"
                    >
                      Yes, delete event
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
