'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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

/**
 * Client shell for the organizer event page Tabs (server page passes the
 * tab contents as serializable nodes). Exists so the Theme tab can have a
 * DIRTY-STATE BADGE on its trigger and a leave confirmation (AlertDialog,
 * plan Task 13) before a tab switch discards the unsaved draft — a server
 * component cannot intercept Radix tab switches.
 */

const ThemeDirtyContext = createContext<{ report: (dirty: boolean) => void } | null>(null)

/** The Theme editor reports unsaved-draft state up to the tabs shell. */
export function useThemeDirtyReporter(): ((dirty: boolean) => void) | null {
  const ctx = useContext(ThemeDirtyContext)
  return ctx?.report ?? null
}

export function EventPageTabs({
  overview,
  registrations,
  categories,
  theme,
}: {
  overview: ReactNode
  registrations: ReactNode
  categories: ReactNode
  theme: ReactNode
}) {
  const [value, setValue] = useState('overview')
  const [dirty, setDirty] = useState(false)
  const [leaveTo, setLeaveTo] = useState<string | null>(null)

  // Real navigation (route links, tab close) with an unsaved draft —
  // browser-native confirm; in-app tab switches use the AlertDialog below.
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  return (
    <ThemeDirtyContext.Provider value={{ report: setDirty }}>
      <Tabs
        value={value}
        onValueChange={(v) => {
          // While the theme draft is dirty, any switch away would unmount
          // (and lose) it — confirm first. Dirty implies the theme tab is
          // active: the editor resets the flag on unmount.
          if (dirty) setLeaveTo(v)
          else setValue(v)
        }}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="registrations">Registrations</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="theme">
            Theme
            {dirty && (
              <span
                aria-hidden
                data-dirty-badge
                className="h-1.5 w-1.5 rounded-full bg-primary"
              />
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {overview}
        </TabsContent>
        <TabsContent value="registrations" className="space-y-4">
          {registrations}
        </TabsContent>
        <TabsContent value="categories" className="space-y-4">
          {categories}
        </TabsContent>
        <TabsContent value="theme" className="space-y-4">
          {theme}
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={leaveTo !== null}
        onOpenChange={(open) => {
          if (!open) setLeaveTo(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave with unsaved theme changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your theme edits have not been saved. Switching tabs now will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay on Theme</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = leaveTo
                setLeaveTo(null)
                setDirty(false)
                if (target) setValue(target)
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ThemeDirtyContext.Provider>
  )
}
