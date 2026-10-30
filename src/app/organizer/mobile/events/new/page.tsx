'use client'

import { NewEventForm } from '@/components/events/new-event-form'

export default function MobileNewEventPage() {
  // Mobile console: after creating, return to the mobile events list instead
  // of the desktop event-type-based REPC/categories redirect.
  return <NewEventForm redirectVirtual />
}
