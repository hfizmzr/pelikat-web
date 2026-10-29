# Archived SDD ledgers & evidence — event-themes P1–P4 (consolidated 2026-10-30)

Provenance: contents below are preserved verbatim from the following source workspaces (now deleted):
`.superpowers/sdd/2026-10-28-event-themes-p1/`, `.superpowers/sdd/2026-10-29-event-themes-p2/`, `.superpowers/sdd/2026-10-29-event-themes-p3/`, `.superpowers/sdd/2026-10-29-event-themes-p4/`

---

# SECTION: 2026-10-28-event-themes-p1

## .superpowers/sdd/2026-10-28-event-themes-p1

### .superpowers/sdd/2026-10-28-event-themes-p1/crauto-fix2-report.md

# CR-auto fix wave 2 — T4 trailing-dash slug base repair (080)

Branch: `feat/event-themes-p1` · Commit range: `becd500..6600128` · HEAD: `6600128ac0c2818aaf8ed7f3755ffdb2b70635dc`
File: `supabase/migrations/080_fix_slug_base_trailing_dash.sql` (SQL-only; no TS touched)

## Bug (CodeRabbit Major, T4)
077's `event_slug_base` ran `left(…, 55)` AFTER trimming dashes → base could end in
`-` when char 55 is `-`; the appended `-<8hex>` suffix produced `--`, rejected by
`events_slug_format` CHECK (`^[a-z0-9]+(-[a-z0-9]+)*-[0-9a-f]{8}$`) → backfill /
`events_published_needs_slug` auto-slug abort.

## Why a new migration (not editing 077)
077 is already cloud-applied (041-style history). Editing it in place would make repo
history lie about the cloud state. 080 uses `create or replace function
public.event_slug_base(...)` — the same signature, so it REPLACES the body in place on
cloud too. Both the 077 backfill formula and the `enforce_published_slug` trigger call
this one function (`select … event_slug_base(new.name)` in 077 §5), so they are repaired
by the replacement. Down-section: commented no-op per repo style (dropping the repaired
function would only restore the buggy 077 body).

## Validation 1 — clean replay
`supabase db reset`: migrations 001→080 applied in order
(`Applying migration 080_fix_slug_base_trailing_dash.sql… Finished supabase db reset on
branch feat/event-themes-p1.`), seed loaded. Run twice (re-run after header edit) — clean both times.

## Validation 2 — psql matrix (raw output, local Docker :54322)

```
            label            |                          base                           | base_len | no_trailing_dash | total_le_64
-----------------------------+---------------------------------------------------------+----------+------------------+-------------
 char55 dash (52a - bcdefgh) | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bc |       55 | t                | t
 55 x then more              | xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx |       55 | t                | t
 degenerate ---abc---        | abc                                                     |        3 | t                | t
 all dashes degenerate       | event                                                   |        5 | t                | t
 unicode/mixed long          | run-bca-10k-dition-2026                                 |       23 | t                | t
 repeating a- pattern        | ab-ab-ab-ab-ab-ab-ab-ab-ab-ab-ab-ab-ab-ab-ab-ab-ab-ab-a |       55 | t                | t
(6 rows)

                               slug                               | fmt_ok
------------------------------------------------------------------+--------
 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bc-098f6bcd | t
 xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-098f6bcd | t
 abc-098f6bcd                                                     | t
 event-098f6bcd                                                   | t
 run-bca-10k-dition-2026-098f6bcd                                 | t
 ab-ab-ab-ab-ab-ab-ab-ab-ab-ab-ab-ab-ab-ab-ab-ab-ab-ab-a-098f6bcd | t
(6 rows)
```

Every base has no trailing dash, total slug ≤ 64, and the full slug matches the CHECK regex.
Failed probe cases (noted): `events.events` has no `start_date`/`capacity` columns (schema
has `event_date`, no capacity on events) — first trigger insert attempt used wrong column
names and errored before any write; corrected insert below.

Live trigger path (published event with char55-dash name, rolled back after):

```
                               slug
------------------------------------------------------------------
 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bc-0fc6c976
(1 row)
INSERT 0 1
```
Slug derived by the trigger contains no `--` and passes `events_slug_format`.

## Validation 3 — seeded slugs unchanged + idempotence

```
 seeded_slugged_events
-----------------------
                    10

                  id                  |                   slug
--------------------------------------+-------------------------------------------
 d0e5e000-…-029 | 100k-new-year-virtual-challenge-37a44344  (… 10 rows, all re-derivation-stable)

 UPDATE 10
 still_present | slug_unchanged
---------------+----------------
            10 |             10
```

Re-running the 077 backfill UPDATE logic for all 10 seeded events produced 10 identical
slugs, no 23505. Confirms the fix only affects derivative behavior for pathological
names; existing derivations are stable.

## Validation 3b — replay-safety (cr finding triage)
`cr --prompt-only --type uncommitted` raised one major finding: a fresh replay could
abort at 077 before 080 if a preexisting row had a trailing-dash base. Established that
the supported path excludes such rows: at 077 time the only preexisting events come from
the in-repo seed; reproducing the buggy 077 body as a temp function over all seed names:

```
 rows_with_buggy_trailing_dash: 0
 total_seed_events: 10
```

Documented in the 080 header (doc-level fix per SQL-only constraint). Re-review with
`cr --fresh`: **0 findings**.

## Gates (pelikat-web)
- `pnpm exec tsc --noEmit` → 0 errors (exit 0, empty output)
- `pnpm exec vitest run` → **Test Files 38 passed (38), Tests 418 passed (418)**
- `npm run lint` → 0 errors, 20 warnings (pre-existing), exit 0
- `cr --prompt-only --type uncommitted --fresh` → 0 findings (initial run's 1 major triaged as doc-level note, above)
- Second `supabase db reset` after header edit → clean

## Commit
`fix(db): slug base trailing-dash repair via 080 (CHECK reject on 55-char boundary)`
Pushed to `origin feat/event-themes-p1`: `5434251..6600128`
(worktree rule: commit was made in pelikat-web's own repo/branch; report left to controller)


### .superpowers/sdd/2026-10-28-event-themes-p1/final-diff.md

diff --git a/.gitignore b/.gitignore
index 45f4241..0cc9d40 100644
--- a/.gitignore
+++ b/.gitignore
@@ -57,13 +57,16 @@ public/swe-worker*
 
 .opencode
 everything-claude-code/
 .pnpm-store
 
 # Codex local MCP configs/secrets
 .codex/config.toml
 .codex/*.local.toml
 .codex/.credentials.json
 
+# Supabase CLI branch artifacts (local churn since Task 1)
+supabase/.branches/
+
 /docs
 graphify-out/
 .mcp.json
diff --git a/src/app/event-theme.css b/src/app/event-theme.css
new file mode 100644
index 0000000..456cedc
--- /dev/null
+++ b/src/app/event-theme.css
@@ -0,0 +1,43 @@
+/*
+ * Event Themes P1 — whitelist stylesheet (spec §5.3).
+ *
+ * HARD BOUNDARY: maps ONLY the 7 brand tokens (via the private --et-*
+ * intermediates emitted by buildStyleVars) plus the heading font rule.
+ * Platform tokens outside this list are structurally unreachable inside
+ * .event-theme — the core design system cannot break even if JSONB
+ * validation is bypassed. Do not add mappings here; the test
+ * tests/theme/css.test.ts asserts this file stays whitelisted.
+ *
+ * Platform tokens live in globals.css (:root/.dark); they inherit into
+ * .event-theme untouched. Only the 7 brand tokens are remapped.
+ */
+.event-theme {
+  --primary: var(--et-primary);
+  --primary-foreground: var(--et-primary-fg);
+  --secondary: var(--et-secondary);
+  --secondary-foreground: var(--et-secondary-fg);
+  --accent: var(--et-accent);
+  --accent-foreground: var(--et-accent-fg);
+  --ring: var(--et-ring);
+}
+
+.dark .event-theme {
+  --primary: var(--et-primary-dark);
+  --primary-foreground: var(--et-primary-fg-dark);
+  --secondary: var(--et-secondary-dark);
+  --secondary-foreground: var(--et-secondary-fg-dark);
+  --accent: var(--et-accent-dark);
+  --accent-foreground: var(--et-accent-fg-dark);
+  --ring: var(--et-ring-dark);
+}
+
+/* Themed headings: the var (when set by buildStyleVars) already carries the
+   full stack ending in Geist; unset → platform sans (= Geist). */
+.event-theme h1,
+.event-theme h2,
+.event-theme h3,
+.event-theme h4,
+.event-theme h5,
+.event-theme h6 {
+  font-family: var(--et-font-heading, var(--font-sans));
+}
diff --git a/src/app/globals.css b/src/app/globals.css
index 86f9f80..2eb8ab2 100644
--- a/src/app/globals.css
+++ b/src/app/globals.css
@@ -1,12 +1,13 @@
 @import 'tailwindcss';
 @import 'tw-animate-css';
+@import './event-theme.css';
 
 
 @custom-variant dark (&:where(.dark *));
 @custom-variant light (&:where(.light *));
 
 /* Light Theme (default) */
 :root, .light {
   --background: oklch(0.985 0 0);
   --foreground: oklch(0.145 0 0);
   --card: oklch(0.985 0 0);
diff --git a/src/app/organizer/events/[id]/page.tsx b/src/app/organizer/events/[id]/page.tsx
index baab365..cabbdab 100644
--- a/src/app/organizer/events/[id]/page.tsx
+++ b/src/app/organizer/events/[id]/page.tsx
@@ -1,20 +1,22 @@
 import { createClient } from '@/lib/supabase/server'
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
 import { Button } from '@/components/ui/button'
 import { Badge } from '@/components/ui/badge'
-import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
 import { Calendar, MapPin, Users, Clock, ArrowLeft, Shirt, BarChart3, ClipboardList } from 'lucide-react'
 import Link from 'next/link'
 import { notFound } from 'next/navigation'
 import { EventSettingsPanel } from '@/components/events/event-settings-panel'
+import { EventPageTabs } from '@/components/events/event-tabs'
+import { ThemeEditor } from '@/components/theme/theme-editor'
 import { getSafeRunnerProfiles } from '@/lib/runner-profiles-safe'
+import type { ThemeTokens } from '@/lib/theme/types'
 import type { Metadata } from 'next'
 
 export const metadata: Metadata = {
   title: 'Event Details - Pelikat',
   description: 'Manage event details and registrations',
 }
 
 type RaceCategory = {
   id: string
   name: string | null
@@ -45,20 +47,23 @@ const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline'> = {
 type EventDetail = {
   id: string
   name: string
   description: string | null
   event_date: string
   location: string | null
   status: EventStatus
   reg_open: string | null
   reg_close: string | null
   results_published: boolean | null
+  organizer_id: string | null
+  theme_preset_id: string | null
+  theme_config: unknown
   race_categories: RaceCategory[] | null
   registrations: Registration[] | null
 }
 
 export default async function OrganizerEventDetailPage({
   params,
 }: {
   params: Promise<{ id: string }>
 }) {
   const [{ id }, supabase] = await Promise.all([
@@ -91,20 +96,33 @@ export default async function OrganizerEventDetailPage({
     registrations: ((event.registrations ?? []) as unknown as { runner_id?: string | null }[]).map((reg) => ({
       ...reg,
       runner_profiles: profileById.get((reg as { runner_id?: string }).runner_id ?? '') ?? null,
     })),
   }
 
   const eventDetail = eventWithProfiles as EventDetail
   const raceCategories = eventDetail.race_categories ?? []
   const registrations = eventDetail.registrations ?? []
 
+  // Theme tab inputs: system preset gallery (public read per 076 RLS) and
+  // caller ownership (read-only tab for non-owners — spec §8.6).
+  const [{ data: presets }, { data: { user } }] = await Promise.all([
+    supabase
+      .from('theme_presets')
+      .select('id, name, tokens')
+      .eq('kind', 'system')
+      .order('name'),
+    supabase.auth.getUser(),
+  ])
+  const myOrganizerId = user?.app_metadata?.organizer_id
+  const canEdit = typeof myOrganizerId === 'string' && eventDetail.organizer_id === myOrganizerId
+
   const stats = {
     totalRegistrations: registrations.length,
     checkedIn: registrations.filter((registration) => registration.checked_in).length,
     categories: raceCategories.length,
   }
 
   const statusVariant = STATUS_VARIANTS
 
   return (
     <div className="space-y-6">
@@ -178,106 +196,101 @@ export default async function OrganizerEventDetailPage({
         <Card className="border-border">
           <CardHeader className="pb-2">
             <CardTitle className="text-sm font-medium">Revenue</CardTitle>
           </CardHeader>
           <CardContent>
             <div className="text-2xl font-bold">$0</div>
           </CardContent>
         </Card>
       </div>
 
-      <Tabs defaultValue="overview" className="space-y-4">
-        <TabsList>
-          <TabsTrigger value="overview">Overview</TabsTrigger>
-          <TabsTrigger value="registrations">Registrations</TabsTrigger>
-          <TabsTrigger value="categories">Categories</TabsTrigger>
-        </TabsList>
-
-        <TabsContent value="overview" className="space-y-4">
-          <Card className="border-border">
-            <CardHeader>
-              <CardTitle>Event Description</CardTitle>
-            </CardHeader>
-            <CardContent>
-              <p className="text-muted-foreground">
-                {eventDetail.description || 'No description provided'}
-              </p>
-            </CardContent>
-          </Card>
-
-          <div className="grid gap-4 md:grid-cols-2">
+      <EventPageTabs
+        overview={
+          <>
             <Card className="border-border">
               <CardHeader>
-                <CardTitle>Quick Actions</CardTitle>
+                <CardTitle>Event Description</CardTitle>
               </CardHeader>
-              <CardContent className="space-y-2">
-                <Button variant="outline" className="w-full justify-start" asChild>
-                  <Link href={`/organizer/events/${eventDetail.id}/registrations`}>
-                    <ClipboardList className="mr-2 h-4 w-4" />
-                    Registrations &amp; Guests
-                  </Link>
-                </Button>
-                <Link href={`/organizer/events/${eventDetail.id}/checkin`} className="block">
-                  <Button variant="outline" className="w-full justify-start">
-                    <Users className="mr-2 h-4 w-4" />
-                    Check-in Dashboard
-                  </Button>
-                </Link>
-                <Link href={`/organizer/events/${eventDetail.id}/repc`} className="block">
-                  <Button variant="outline" className="w-full justify-start">
-                    <Shirt className="mr-2 h-4 w-4" />
-                    REPC Inventory
-                  </Button>
-                </Link>
-                <Link href={`/organizer/events/${eventDetail.id}/photos`} className="block">
-                  <Button variant="outline" className="w-full justify-start">
-                    <Clock className="mr-2 h-4 w-4" />
-                    Photo Management
-                  </Button>
-                </Link>
-                <Link href={`/organizer/events/${eventDetail.id}/leaderboard`} className="block">
-                  <Button variant="outline" className="w-full justify-start">
-                    <Users className="mr-2 h-4 w-4" />
-                    Leaderboard
-                  </Button>
-                </Link>
+              <CardContent>
+                <p className="text-muted-foreground">
+                  {eventDetail.description || 'No description provided'}
+                </p>
               </CardContent>
             </Card>
 
-            <Card className="border-border">
-              <CardHeader>
-                <CardTitle>Race Categories</CardTitle>
-              </CardHeader>
-              <CardContent>
-                {raceCategories.length > 0 ? (
-                  <div className="space-y-2">
-                    {raceCategories.map((cat) => (
-                      <div key={cat.id} className="flex items-center justify-between">
-                        <span className="text-sm">{cat.name}</span>
-                        <Badge variant="outline">{cat.gender || "Open"}</Badge>
-                      </div>
-                    ))}
-                  </div>
-                ) : (
-                  <div className="text-center py-4">
-                    <p className="text-sm text-muted-foreground mb-3">No categories yet</p>
-                    <Link href={`/organizer/events/${eventDetail.id}/categories`}>
-                      <Button size="sm" variant="outline">Manage Categories</Button>
+            <div className="grid gap-4 md:grid-cols-2">
+              <Card className="border-border">
+                <CardHeader>
+                  <CardTitle>Quick Actions</CardTitle>
+                </CardHeader>
+                <CardContent className="space-y-2">
+                  <Button variant="outline" className="w-full justify-start" asChild>
+                    <Link href={`/organizer/events/${eventDetail.id}/registrations`}>
+                      <ClipboardList className="mr-2 h-4 w-4" />
+                      Registrations &amp; Guests
                     </Link>
-                  </div>
-                )}
-              </CardContent>
-            </Card>
-          </div>
-        </TabsContent>
+                  </Button>
+                  <Link href={`/organizer/events/${eventDetail.id}/checkin`} className="block">
+                    <Button variant="outline" className="w-full justify-start">
+                      <Users className="mr-2 h-4 w-4" />
+                      Check-in Dashboard
+                    </Button>
+                  </Link>
+                  <Link href={`/organizer/events/${eventDetail.id}/repc`} className="block">
+                    <Button variant="outline" className="w-full justify-start">
+                      <Shirt className="mr-2 h-4 w-4" />
+                      REPC Inventory
+                    </Button>
+                  </Link>
+                  <Link href={`/organizer/events/${eventDetail.id}/photos`} className="block">
+                    <Button variant="outline" className="w-full justify-start">
+                      <Clock className="mr-2 h-4 w-4" />
+                      Photo Management
+                    </Button>
+                  </Link>
+                  <Link href={`/organizer/events/${eventDetail.id}/leaderboard`} className="block">
+                    <Button variant="outline" className="w-full justify-start">
+                      <Users className="mr-2 h-4 w-4" />
+                      Leaderboard
+                    </Button>
+                  </Link>
+                </CardContent>
+              </Card>
 
-        <TabsContent value="registrations" className="space-y-4">
+              <Card className="border-border">
+                <CardHeader>
+                  <CardTitle>Race Categories</CardTitle>
+                </CardHeader>
+                <CardContent>
+                  {raceCategories.length > 0 ? (
+                    <div className="space-y-2">
+                      {raceCategories.map((cat) => (
+                        <div key={cat.id} className="flex items-center justify-between">
+                          <span className="text-sm">{cat.name}</span>
+                          <Badge variant="outline">{cat.gender || "Open"}</Badge>
+                        </div>
+                      ))}
+                    </div>
+                  ) : (
+                    <div className="text-center py-4">
+                      <p className="text-sm text-muted-foreground mb-3">No categories yet</p>
+                      <Link href={`/organizer/events/${eventDetail.id}/categories`}>
+                        <Button size="sm" variant="outline">Manage Categories</Button>
+                      </Link>
+                    </div>
+                  )}
+                </CardContent>
+              </Card>
+            </div>
+          </>
+        }
+        registrations={
           <Card className="border-border">
             <CardHeader>
               <CardTitle>Registrations</CardTitle>
               <CardDescription>All runner registrations for this event</CardDescription>
             </CardHeader>
             <CardContent>
               {registrations.length > 0 ? (
                 <div className="space-y-4">
                   {registrations.slice(0, 10).map((reg) => (
                     <div key={reg.id} className="flex items-center justify-between border-b pb-2">
@@ -296,23 +309,22 @@ export default async function OrganizerEventDetailPage({
                         </Badge>
                       </div>
                     </div>
                   ))}
                 </div>
               ) : (
                 <p className="text-muted-foreground">No registrations yet</p>
               )}
             </CardContent>
           </Card>
-        </TabsContent>
-
-        <TabsContent value="categories" className="space-y-4">
+        }
+        categories={
           <Card className="border-border">
             <CardHeader className="flex flex-row items-start justify-between">
               <div>
                 <CardTitle>Race Categories</CardTitle>
                 <CardDescription>Manage race categories for this event</CardDescription>
               </div>
               <Link href={`/organizer/events/${eventDetail.id}/categories`}>
                 <Button size="sm" variant="outline">Manage All</Button>
               </Link>
             </CardHeader>
@@ -337,15 +349,30 @@ export default async function OrganizerEventDetailPage({
               ) : (
                 <div className="text-center py-8">
                   <p className="text-muted-foreground mb-4">No categories yet</p>
                   <Link href={`/organizer/events/${eventDetail.id}/categories`}>
                     <Button>Add Category</Button>
                   </Link>
                 </div>
               )}
             </CardContent>
           </Card>
-        </TabsContent>
-      </Tabs>
+        }
+        theme={
+          <ThemeEditor
+            eventId={eventDetail.id}
+            canEdit={canEdit}
+            savedPresetId={eventDetail.theme_preset_id ?? null}
+            // theme_config is hand-craftable JSONB — the editor seeds
+            // defensively (non-object shapes degrade to an empty draft).
+            savedConfig={(eventDetail.theme_config ?? null) as ThemeTokens | null}
+            presets={(presets ?? []).map((preset) => ({
+              id: preset.id,
+              name: preset.name,
+              tokens: preset.tokens as ThemeTokens,
+            }))}
+          />
+        }
+      />
     </div>
   )
 }
diff --git a/src/app/runner/events/[id]/page.tsx b/src/app/runner/events/[id]/page.tsx
index bedf4ae..e2b0433 100644
--- a/src/app/runner/events/[id]/page.tsx
+++ b/src/app/runner/events/[id]/page.tsx
@@ -1,18 +1,19 @@
 import { ArrowLeft, CircleCheck, CreditCard, Footprints, Images, MapPin, QrCode, ShoppingBag, Trophy } from "lucide-react"
 import { createClient } from '@/lib/supabase/server'
 import { isConfirmedStatus } from '@/lib/registration-status'
 import Link from 'next/link'
 import { notFound } from 'next/navigation'
 import { RunnerRegistrationActions } from '@/components/events/runner-registration-actions'
 import { CancelRegistrationButton } from '@/components/events/cancel-registration-button'
 import { VirtualCertificateButton } from '@/components/gamification/virtual-certificate-button'
+import { EventThemeScope } from '@/components/theme/event-theme-scope'
 import type { Metadata } from 'next'
 
 export const metadata: Metadata = {
   title: 'Event Details - Pelikat',
   description: 'View event details and register for races',
 }
 
 interface RaceCategory {
   id: string
   name: string
@@ -65,235 +66,237 @@ export default async function RunnerEventDetailPage({
   // Virtual run progress: logged distance for this event vs target
   const { data: myLogs } = isVirtual && isRegistered
     ? await supabase.from('run_logs').select('distance_km').eq('event_id', id).eq('runner_id', profile?.id)
     : { data: null }
   const loggedKm = (myLogs ?? []).reduce((acc, l) => acc + Number(l.distance_km || 0), 0)
   const targetKm = Number(event.target_distance_km || 0)
   const raceCategories = (event.race_categories ?? []) as RaceCategory[]
   const eventDate = new Date(event.event_date)
 
   return (
-    <div className="flex flex-col w-full min-h-full bg-background">
-      {/* Sticky Header */}
-      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-muted">
-        <div className="flex items-center h-14 px-4 pt-safe">
-          <Link href="/runner/events" className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground active:bg-card transition-colors -ml-2">
-            <ArrowLeft className="size-[24px]" />
-          </Link>
-          <h1 className="flex-1 text-[16px] font-bold text-foreground text-center mr-8 truncate">
-            {event.name}
-          </h1>
-        </div>
-      </header>
+    <EventThemeScope event={event}>
+      <div className="flex flex-col w-full min-h-full bg-background">
+        {/* Sticky Header */}
+        <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-muted">
+          <div className="flex items-center h-14 px-4 pt-safe">
+            <Link href="/runner/events" className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground active:bg-card transition-colors -ml-2">
+              <ArrowLeft className="size-[24px]" />
+            </Link>
+            <h1 className="flex-1 text-[16px] font-bold text-foreground text-center mr-8 truncate">
+              {event.name}
+            </h1>
+          </div>
+        </header>
 
-      {/* Hero Banner Placeholder */}
-      <div className="w-full h-48 bg-muted relative">
-        <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent opacity-90" />
-        <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between">
-          <div className="flex flex-col">
-            <div className="flex items-center gap-2 mb-2">
-              <span className="px-2 py-1 w-max rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
-                {event.status}
-              </span>
-              {isVirtual && (
-                <span className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-success/10 text-success border border-success/20">
-                  Virtual Run
+        {/* Hero Banner Placeholder */}
+        <div className="w-full h-48 bg-muted relative">
+          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent opacity-90" />
+          <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between">
+            <div className="flex flex-col">
+              <div className="flex items-center gap-2 mb-2">
+                <span className="px-2 py-1 w-max rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
+                  {event.status}
                 </span>
-              )}
+                {isVirtual && (
+                  <span className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-success/10 text-success border border-success/20">
+                    Virtual Run
+                  </span>
+                )}
+              </div>
+              <h2 className="text-[24px] font-bold text-foreground leading-tight drop-shadow-md">
+                {event.name}
+              </h2>
             </div>
-            <h2 className="text-[24px] font-bold text-foreground leading-tight drop-shadow-md">
-              {event.name}
-            </h2>
           </div>
         </div>
-      </div>
 
-      <div className="flex flex-col px-5 py-6 gap-6">
+        <div className="flex flex-col px-5 py-6 gap-6">
         
-        {/* Date & Location */}
-        <section className="flex flex-col gap-4">
-          <div className="flex items-center gap-4 bg-card p-4 rounded-2xl border border-border/60">
-            <div className="w-12 h-12 bg-accent/50 rounded-xl flex flex-col items-center justify-center">
-              <span className="text-[10px] font-bold text-red-500 dark:text-red-300 uppercase">{eventDate.toLocaleDateString('en-MY', { month: 'short' })}</span>
-              <span className="text-[16px] font-extrabold text-foreground leading-none">{eventDate.getDate()}</span>
-            </div>
-            <div className="flex flex-col">
-              <span className="text-[14px] font-bold text-foreground">
-                {eventDate.toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric' })}
-              </span>
-              <span className="text-[12px] text-muted-foreground">Starts at 6:00 AM</span>
-            </div>
-          </div>
-          
-          {event.location && (
+          {/* Date & Location */}
+          <section className="flex flex-col gap-4">
             <div className="flex items-center gap-4 bg-card p-4 rounded-2xl border border-border/60">
-              <div className="w-12 h-12 bg-accent/50 rounded-xl flex items-center justify-center">
-                <MapPin className="size-[20px] text-primary" />
+              <div className="w-12 h-12 bg-accent/50 rounded-xl flex flex-col items-center justify-center">
+                <span className="text-[10px] font-bold text-red-500 dark:text-red-300 uppercase">{eventDate.toLocaleDateString('en-MY', { month: 'short' })}</span>
+                <span className="text-[16px] font-extrabold text-foreground leading-none">{eventDate.getDate()}</span>
               </div>
               <div className="flex flex-col">
-                <span className="text-[14px] font-bold text-foreground">Event Location</span>
-                <span className="text-[12px] text-muted-foreground">{event.location}</span>
+                <span className="text-[14px] font-bold text-foreground">
+                  {eventDate.toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric' })}
+                </span>
+                <span className="text-[12px] text-muted-foreground">Starts at 6:00 AM</span>
               </div>
             </div>
-          )}
-        </section>
+          
+            {event.location && (
+              <div className="flex items-center gap-4 bg-card p-4 rounded-2xl border border-border/60">
+                <div className="w-12 h-12 bg-accent/50 rounded-xl flex items-center justify-center">
+                  <MapPin className="size-[20px] text-primary" />
+                </div>
+                <div className="flex flex-col">
+                  <span className="text-[14px] font-bold text-foreground">Event Location</span>
+                  <span className="text-[12px] text-muted-foreground">{event.location}</span>
+                </div>
+              </div>
+            )}
+          </section>
 
-        {/* About */}
-        <section className="flex flex-col gap-2">
-          <h3 className="text-[16px] font-bold text-foreground">About the Race</h3>
-          <p className="text-[13px] text-muted-foreground leading-relaxed">
-            {event.description || 'No description available for this event.'}
-          </p>
-          <div className="flex items-center gap-2 mt-2">
-            <span className="text-[12px] text-muted-foreground">Organized by:</span>
-            <span className="text-[12px] font-bold text-foreground">{event.organizers?.name || 'Unknown Organizer'}</span>
-          </div>
-        </section>
+          {/* About */}
+          <section className="flex flex-col gap-2">
+            <h3 className="text-[16px] font-bold text-foreground">About the Race</h3>
+            <p className="text-[13px] text-muted-foreground leading-relaxed">
+              {event.description || 'No description available for this event.'}
+            </p>
+            <div className="flex items-center gap-2 mt-2">
+              <span className="text-[12px] text-muted-foreground">Organized by:</span>
+              <span className="text-[12px] font-bold text-foreground">{event.organizers?.name || 'Unknown Organizer'}</span>
+            </div>
+          </section>
 
-        {/* Registration Section */}
-        <section className="mt-4 pt-6 border-t border-border/60 flex flex-col gap-4">
-          <h3 className="text-[16px] font-bold text-foreground">My Registration</h3>
+          {/* Registration Section */}
+          <section className="mt-4 pt-6 border-t border-border/60 flex flex-col gap-4">
+            <h3 className="text-[16px] font-bold text-foreground">My Registration</h3>
           
-          {isRegistered ? (
-            <div className="flex flex-col gap-4">
-              <div className="p-5 rounded-2xl bg-success/10 border border-success/20 flex flex-col gap-4 relative overflow-hidden">
-                <div className="absolute right-0 top-0 w-32 h-32 bg-success/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
-                <div className="flex items-center gap-3">
-                  <CircleCheck className="size-[24px] text-success" />
-                  <div className="flex flex-col">
-                    <span className="text-[14px] font-bold text-success">You&apos;re Registered!</span>
-                    <span className="text-[11px] text-success/80">See you at the start line.</span>
-                  </div>
-                </div>
-                
-                <div className="grid grid-cols-2 gap-4 mt-2">
-                  {!isVirtual && (
+            {isRegistered ? (
+              <div className="flex flex-col gap-4">
+                <div className="p-5 rounded-2xl bg-success/10 border border-success/20 flex flex-col gap-4 relative overflow-hidden">
+                  <div className="absolute right-0 top-0 w-32 h-32 bg-success/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
+                  <div className="flex items-center gap-3">
+                    <CircleCheck className="size-[24px] text-success" />
                     <div className="flex flex-col">
-                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">BIB Number</span>
-                      <span className="text-[16px] font-mono font-bold text-foreground">{registration.bib_number || 'TBA'}</span>
+                      <span className="text-[14px] font-bold text-success">You&apos;re Registered!</span>
+                      <span className="text-[11px] text-success/80">See you at the start line.</span>
                     </div>
-                  )}
-                  <div className="flex flex-col">
-                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Category</span>
-                    <span className="text-[14px] font-bold text-foreground truncate">{registration.race_categories?.name}</span>
                   </div>
-                  {isVirtual && targetKm > 0 && (
-                    <div className="flex flex-col col-span-2 pt-3 border-t border-success/20">
-                      <div className="flex justify-between items-center mb-1.5">
-                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Progress</span>
-                        <span className="text-[11px] font-bold text-success">
-                          {loggedKm.toFixed(1)} / {targetKm} km
-                        </span>
+                
+                  <div className="grid grid-cols-2 gap-4 mt-2">
+                    {!isVirtual && (
+                      <div className="flex flex-col">
+                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">BIB Number</span>
+                        <span className="text-[16px] font-mono font-bold text-foreground">{registration.bib_number || 'TBA'}</span>
                       </div>
-                      <div className="h-2 rounded-full bg-muted overflow-hidden">
-                        <div
-                          className="h-full rounded-full bg-success"
-                          style={{ width: `${Math.min(100, Math.round((loggedKm / targetKm) * 100))}%` }}
-                        />
+                    )}
+                    <div className="flex flex-col">
+                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Category</span>
+                      <span className="text-[14px] font-bold text-foreground truncate">{registration.race_categories?.name}</span>
+                    </div>
+                    {isVirtual && targetKm > 0 && (
+                      <div className="flex flex-col col-span-2 pt-3 border-t border-success/20">
+                        <div className="flex justify-between items-center mb-1.5">
+                          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Progress</span>
+                          <span className="text-[11px] font-bold text-success">
+                            {loggedKm.toFixed(1)} / {targetKm} km
+                          </span>
+                        </div>
+                        <div className="h-2 rounded-full bg-muted overflow-hidden">
+                          <div
+                            className="h-full rounded-full bg-success"
+                            style={{ width: `${Math.min(100, Math.round((loggedKm / targetKm) * 100))}%` }}
+                          />
+                        </div>
                       </div>
+                    )}
+                    <div className="flex justify-between items-center pt-3 border-t border-success/20 col-span-2">
+                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Payment Status</span>
+                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-muted text-foreground">
+                        {registration.payment_status?.toUpperCase()}
+                      </span>
                     </div>
-                  )}
-                  <div className="flex justify-between items-center pt-3 border-t border-success/20 col-span-2">
-                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Payment Status</span>
-                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-muted text-foreground">
-                      {registration.payment_status?.toUpperCase()}
-                    </span>
                   </div>
                 </div>
-              </div>
 
-              <div className="flex flex-col gap-3 mt-2">
-                {!isVirtual && (
-                  <Link
-                    href={`/runner/events/${event.id}/bib`}
-                    className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
-                  >
-                    <QrCode className="size-[18px]" />
-                    View Digital BIB Pass
-                  </Link>
-                )}
+                <div className="flex flex-col gap-3 mt-2">
+                  {!isVirtual && (
+                    <Link
+                      href={`/runner/events/${event.id}/bib`}
+                      className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
+                    >
+                      <QrCode className="size-[18px]" />
+                      View Digital BIB Pass
+                    </Link>
+                  )}
 
-                {!isConfirmedStatus(registration.payment_status) && (
+                  {!isConfirmedStatus(registration.payment_status) && (
+                    <Link
+                      href={`/runner/events/${event.id}/payment`}
+                      className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
+                    >
+                      <CreditCard className="size-[18px]" />
+                      Complete Payment
+                    </Link>
+                  )}
                   <Link
-                    href={`/runner/events/${event.id}/payment`}
-                    className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
+                    href={`/runner/events/${event.id}/merch`}
+                    className="w-full py-3.5 rounded-xl bg-accent text-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                   >
-                    <CreditCard className="size-[18px]" />
-                    Complete Payment
+                    <ShoppingBag className="size-[18px]" />
+                    Event Merch
                   </Link>
-                )}
-                <Link
-                  href={`/runner/events/${event.id}/merch`}
-                  className="w-full py-3.5 rounded-xl bg-accent text-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
-                >
-                  <ShoppingBag className="size-[18px]" />
-                  Event Merch
-                </Link>
 
-                {isVirtual && targetKm > 0 && loggedKm >= targetKm && (
-                  <VirtualCertificateButton eventId={event.id} />
-                )}
+                  {isVirtual && targetKm > 0 && loggedKm >= targetKm && (
+                    <VirtualCertificateButton eventId={event.id} />
+                  )}
 
-                {isVirtual && (
-                  <Link
-                    href={`/runner/run-log?event=${event.id}`}
-                    className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
-                  >
-                    <Footprints className="size-[18px]" />
-                    Log a Run
-                  </Link>
-                )}
+                  {isVirtual && (
+                    <Link
+                      href={`/runner/run-log?event=${event.id}`}
+                      className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
+                    >
+                      <Footprints className="size-[18px]" />
+                      Log a Run
+                    </Link>
+                  )}
+
+                  {!isVirtual && (
+                    <Link
+                      href={`/runner/events/${event.id}/gallery`}
+                      className="w-full py-3.5 rounded-xl bg-accent text-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
+                    >
+                      <Images className="size-[18px]" />
+                      Event Photos
+                    </Link>
+                  )}
 
-                {!isVirtual && (
                   <Link
-                    href={`/runner/events/${event.id}/gallery`}
+                    href={`/runner/leaderboard?event_id=${event.id}`}
                     className="w-full py-3.5 rounded-xl bg-accent text-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                   >
-                    <Images className="size-[18px]" />
-                    Event Photos
+                    <Trophy className="size-[18px]" />
+                    Event Leaderboard
                   </Link>
-                )}
-
-                <Link
-                  href={`/runner/leaderboard?event_id=${event.id}`}
-                  className="w-full py-3.5 rounded-xl bg-accent text-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
-                >
-                  <Trophy className="size-[18px]" />
-                  Event Leaderboard
-                </Link>
 
-                {!registration.checked_in && (
-                  <div className="mt-4 pt-4 border-t border-border/40">
-                    <CancelRegistrationButton eventId={event.id} />
-                  </div>
-                )}
+                  {!registration.checked_in && (
+                    <div className="mt-4 pt-4 border-t border-border/40">
+                      <CancelRegistrationButton eventId={event.id} />
+                    </div>
+                  )}
+                </div>
               </div>
-            </div>
-          ) : (
-            <RunnerRegistrationActions
-              eventId={event.id}
-              categories={raceCategories}
-              hasRunnerProfile={!!profile}
-              runner={{
-                name: profile?.full_name ?? null,
-                email: user?.email ?? null,
-                tShirtSize: profile?.t_shirt_size ?? null,
-                emergencyContactName: profile?.emergency_contact_name ?? null,
-                emergencyContactPhone: profile?.emergency_contact_phone ?? null,
-                dob: profile?.dob ?? null,
-                gender: profile?.gender ?? null,
-                phone: profile?.phone ?? null,
-                icOnFile: !!(profile?.ic_encrypted || profile?.ic_document_path),
-              }}
-              eventSummary={{
-                name: event.name,
-                date: eventDate.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
-                location: event.location,
-              }}
-            />
-          )}
-        </section>
+            ) : (
+              <RunnerRegistrationActions
+                eventId={event.id}
+                categories={raceCategories}
+                hasRunnerProfile={!!profile}
+                runner={{
+                  name: profile?.full_name ?? null,
+                  email: user?.email ?? null,
+                  tShirtSize: profile?.t_shirt_size ?? null,
+                  emergencyContactName: profile?.emergency_contact_name ?? null,
+                  emergencyContactPhone: profile?.emergency_contact_phone ?? null,
+                  dob: profile?.dob ?? null,
+                  gender: profile?.gender ?? null,
+                  phone: profile?.phone ?? null,
+                  icOnFile: !!(profile?.ic_encrypted || profile?.ic_document_path),
+                }}
+                eventSummary={{
+                  name: event.name,
+                  date: eventDate.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
+                  location: event.location,
+                }}
+              />
+            )}
+          </section>
 
+        </div>
       </div>
-    </div>
+    </EventThemeScope>
   )
 }
diff --git a/src/app/runner/leaderboard/page.tsx b/src/app/runner/leaderboard/page.tsx
index b045b23..f2596a6 100644
--- a/src/app/runner/leaderboard/page.tsx
+++ b/src/app/runner/leaderboard/page.tsx
@@ -1,13 +1,15 @@
 import { ArrowLeft, Hourglass, Trophy } from "lucide-react"
 import { createClient } from '@/lib/supabase/server'
 import { LiveLeaderboard, type LeaderboardEntry } from '@/components/gamification/live-leaderboard'
+import { EventThemeScope } from '@/components/theme/event-theme-scope'
+import { scopedLeaderboardEventId } from './scope'
 import { LeaderboardFilters } from './filters'
 import { ExportCSV } from './export-csv'
 import Link from 'next/link'
 import type { Metadata } from 'next'
 
 export const metadata: Metadata = {
   title: 'Leaderboard - Pelikat',
   description: 'Virtual run rankings across all events',
 }
 
@@ -48,20 +50,40 @@ export default async function RunnerLeaderboardPage({
           .order('name')
       : Promise.resolve({ data: [] }),
   ])
 
   // FR-69: results are hidden until the organizer publishes them
   const publishedIds = (events ?? []).filter((e) => e.results_published).map((e) => e.id)
   const resultsLocked = event_id && event_id !== 'all'
     ? !(events ?? []).some((e) => e.id === event_id && e.results_published)
     : publishedIds.length === 0
 
+  // Theme scope (spec §5.3): only when event_id targets one published event.
+  // The events list (already fetched for the filters) is the publication source
+  // of truth; the themed row is fetched separately so the mixed view — and the
+  // always-run events query — never carries theme_config payload.
+  const scopedId = scopedLeaderboardEventId(event_id, events)
+  const scopedEvent = scopedId
+    ? (
+        await supabase
+          .from('events')
+          .select('id, theme_preset_id, theme_config')
+          .eq('id', scopedId)
+          .maybeSingle()
+      ).data
+    : null
+  if (scopedId && !scopedEvent) {
+    // Fetch failed (RLS/network/no row) — degrade to the neutral scope, but
+    // leave a trace instead of swallowing the error silently (Task 12 carry).
+    console.warn(`[leaderboard] themed event fetch failed for ${scopedId}`)
+  }
+
   let leaderboard: LeaderboardEntry[] | null = null
   if (!resultsLocked) {
     let query = supabase.from('leaderboard_virtual').select('*').limit(50)
 
     if (event_id && event_id !== 'all') {
       query = query.eq('event_id', event_id)
     } else if (publishedIds.length > 0) {
       query = query.in('event_id', publishedIds)
     }
     if (gender && gender !== 'all') {
@@ -70,21 +92,21 @@ export default async function RunnerLeaderboardPage({
       query = query.eq('gender', g)
     }
     if (category_id && category_id !== 'all') {
       query = query.eq('category_id', category_id)
     }
 
     leaderboard = (await query.order('rank', { ascending: true })).data
   }
 
 
-  return (
+  const content = (
     <div className="flex flex-col w-full min-h-full bg-background">
       {/* Sticky Header */}
       <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-muted">
         <div className="flex items-center h-14 px-4 pt-safe">
           <Link href="/runner" className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground active:bg-card transition-colors -ml-2">
             <ArrowLeft className="size-[24px]" />
           </Link>
           <div className="flex-1 flex flex-col items-center mr-8 truncate">
             <h1 className="text-[16px] font-bold text-foreground leading-tight">
               Leaderboard
@@ -136,11 +158,17 @@ export default async function RunnerLeaderboardPage({
               gender: gender && gender !== 'all' ? (gender === 'male' ? 'M' : gender === 'female' ? 'F' : gender) : undefined,
               category_id: category_id && category_id !== 'all' ? category_id : undefined,
             }}
             publishedIds={publishedIds}
           />
         )}
 
       </div>
     </div>
   )
+
+  // Single published event → themed scope (spec §5.3); mixed views render
+  // content unwrapped — same pattern as the runner event page (Task 11).
+  return scopedEvent ? (
+    <EventThemeScope event={scopedEvent}>{content}</EventThemeScope>
+  ) : content
 }
diff --git a/src/app/runner/leaderboard/scope.ts b/src/app/runner/leaderboard/scope.ts
new file mode 100644
index 0000000..05076fe
--- /dev/null
+++ b/src/app/runner/leaderboard/scope.ts
@@ -0,0 +1,18 @@
+/**
+ * Leaderboard theme-scope decision (spec §5.3): the leaderboard inherits an
+ * event theme ONLY when `event_id` targets ONE published event — mixed-event
+ * rankings (no event_id / 'all') and missing/unpublished events stay neutral.
+ * Pure so the page's scope decision is unit-testable (Task 12 Step 1).
+ *
+ * The results-published check here intentionally mirrors the page's
+ * `resultsLocked` derivation (page.tsx) — same events rows, two consumers:
+ * `resultsLocked` hides the rankings, this scopes the theme. Keep them in
+ * sync if the publication source ever changes.
+ */
+export function scopedLeaderboardEventId(
+  eventId: string | undefined,
+  events: { id: string; results_published: boolean }[] | null | undefined,
+): string | null {
+  if (!eventId || eventId === 'all') return null
+  return (events ?? []).some((e) => e.id === eventId && e.results_published) ? eventId : null
+}
diff --git a/src/components/events/actions.ts b/src/components/events/actions.ts
index 42fc1dd..0e1a9dc 100644
--- a/src/components/events/actions.ts
+++ b/src/components/events/actions.ts
@@ -9,20 +9,22 @@ import { isConfirmedStatus } from '@/lib/registration-status'
 // module; a barreled re-export of another module's action throws a build
 // error), so call sites import them from their defining module directly.
 import {
   REPC_CHECK_IN_RPC,
   normalizeRepcCheckInResult,
   type RepcCheckInResult,
   type RepcCheckInRpcRow,
 } from '@/lib/repc'
 import { requireAuth } from '@/lib/auth/requireUser'
 import { getOrganizerSubscriptionPrice } from '@/lib/subscription'
+import { validateThemeConfig } from '@/lib/theme/validate'
+import type { ThemeTokens } from '@/lib/theme/types'
 import { revalidatePath } from 'next/cache'
 import { redirect } from 'next/navigation'
 
 // ─────────────────────────────────────────────────────────────────────────────
 // Registration Actions
 // ─────────────────────────────────────────────────────────────────────────────
 
 // ── HitPay checkout (server-side funnel via Django) ──────────────────────────
 // The browser never sees the HitPay API. Amount and reference come from
 // the server; confirmation happens only through the signed webhook in
@@ -346,20 +348,100 @@ export async function updateEventDates(
   const { error } = await supabase
     .from('events')
     .update(updates)
     .eq('id', eventId)
 
   if (error) throw new Error(error.message)
 
   revalidatePath(`/organizer/events/${eventId}`)
 }
 
+// ─────────────────────────────────────────────────────────────────────────────
+// Theme Actions (Event Themes P1 — Task 13)
+// ─────────────────────────────────────────────────────────────────────────────
+
+export type SaveEventThemeResult =
+  | { ok: true; warnings: string[] }
+  | { ok: false; error: string }
+
+/**
+ * Write an event's theme (both columns: `theme_preset_id` + `theme_config`).
+ *
+ * Server-side guarantees (carried requirements):
+ *  - ownership: the 077 anti-IDOR trigger bypasses postgres/service_role and
+ *    the BFF path has no DB-level ownership check — the event must belong to
+ *    the caller's organizer BEFORE anything is written;
+ *  - preset reference: system OR owned by the caller's organizer (same
+ *    trigger-bypass rationale, defense in depth);
+ *  - validation: validateThemeConfig re-runs HERE — client validation is UX
+ *    only (Task 9). Hard-blocks on `errors` (only the primary <3:1 rule);
+ *    warnings ride along as structured strings (render as text children).
+ *
+ * Reset semantics (Task 3/9 carries): per-key reset = the draft omits the
+ * key (JSON nulls are rejected at every level); full reset = null/null.
+ */
+export async function saveEventTheme(
+  eventId: string,
+  input: { theme_preset_id: string | null; theme_config: ThemeTokens | null }
+): Promise<SaveEventThemeResult> {
+  const { supabase, user } = await requireAuth()
+
+  const organizerId = user.app_metadata?.organizer_id
+  if (!organizerId) return { ok: false, error: 'Organizer profile not found' }
+
+  const { data: event } = await supabase
+    .from('events')
+    .select('id, organizer_id')
+    .eq('id', eventId)
+    .single()
+
+  if (!event || event.organizer_id !== organizerId) {
+    return { ok: false, error: 'You can only theme events you organize.' }
+  }
+
+  const presetId = input.theme_preset_id || null
+  if (presetId !== null) {
+    const { data: preset } = await supabase
+      .from('theme_presets')
+      .select('id, kind, organizer_id')
+      .eq('id', presetId)
+      .maybeSingle()
+
+    const permitted =
+      preset != null &&
+      ((preset.kind === 'system' && preset.organizer_id === null) ||
+        (preset.kind === 'organizer' && preset.organizer_id === organizerId))
+
+    if (!permitted) return { ok: false, error: 'Unknown or not permitted theme preset.' }
+  }
+
+  const validation = validateThemeConfig(input.theme_config)
+  if (!validation.ok) {
+    return { ok: false, error: validation.errors.join(' · ') }
+  }
+
+  const { error } = await supabase
+    .from('events')
+    .update({ theme_preset_id: presetId, theme_config: input.theme_config })
+    .eq('id', eventId)
+
+  if (error) return { ok: false, error: error.message }
+
+  // Organizer view + every themed runner consumer (runner event page and the
+  // single-event leaderboard, Task 12).
+  revalidatePath(`/organizer/events/${eventId}`)
+  revalidatePath(`/runner/events/${eventId}`)
+  revalidatePath('/runner/leaderboard')
+
+  return { ok: true, warnings: validation.warnings }
+}
+
 // ─────────────────────────────────────────────────────────────────────────────
 // Category Actions
 // ─────────────────────────────────────────────────────────────────────────────
 
 export async function createCategory(eventId: string, formData: FormData) {
   const { supabase } = await requireAuth()
 
   const { data: event } = await supabase
     .from('events')
     .select('organizer_id')
diff --git a/src/components/events/event-tabs.tsx b/src/components/events/event-tabs.tsx
new file mode 100644
index 0000000..271c0cd
--- /dev/null
+++ b/src/components/events/event-tabs.tsx
@@ -0,0 +1,134 @@
+'use client'
+
+import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
+import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
+import {
+  AlertDialog,
+  AlertDialogAction,
+  AlertDialogCancel,
+  AlertDialogContent,
+  AlertDialogDescription,
+  AlertDialogFooter,
+  AlertDialogHeader,
+  AlertDialogTitle,
+} from '@/components/ui/alert-dialog'
+
+/**
+ * Client shell for the organizer event page Tabs (server page passes the
+ * tab contents as serializable nodes). Exists so the Theme tab can have a
+ * DIRTY-STATE BADGE on its trigger and a leave confirmation (AlertDialog,
+ * plan Task 13) before a tab switch discards the unsaved draft — a server
+ * component cannot intercept Radix tab switches.
+ */
+
+const ThemeDirtyContext = createContext<{ report: (dirty: boolean) => void } | null>(null)
+
+/** The Theme editor reports unsaved-draft state up to the tabs shell. */
+export function useThemeDirtyReporter(): ((dirty: boolean) => void) | null {
+  const ctx = useContext(ThemeDirtyContext)
+  return ctx?.report ?? null
+}
+
+export function EventPageTabs({
+  overview,
+  registrations,
+  categories,
+  theme,
+}: {
+  overview: ReactNode
+  registrations: ReactNode
+  categories: ReactNode
+  theme: ReactNode
+}) {
+  const [value, setValue] = useState('overview')
+  const [dirty, setDirty] = useState(false)
+  const [leaveTo, setLeaveTo] = useState<string | null>(null)
+
+  // Real navigation (route links, tab close) with an unsaved draft —
+  // browser-native confirm; in-app tab switches use the AlertDialog below.
+  // `returnValue = ''` is required for Chrome's dialog and some Safari
+  // versions ignore preventDefault() alone (Task 14 hardening).
+  useEffect(() => {
+    if (!dirty) return
+    const handler = (e: BeforeUnloadEvent) => {
+      e.preventDefault()
+      e.returnValue = ''
+    }
+    window.addEventListener('beforeunload', handler)
+    return () => window.removeEventListener('beforeunload', handler)
+  }, [dirty])
+
+  return (
+    <ThemeDirtyContext.Provider value={{ report: setDirty }}>
+      <Tabs
+        value={value}
+        onValueChange={(v) => {
+          // While the theme draft is dirty, any switch away would unmount
+          // (and lose) it — confirm first. Dirty implies the theme tab is
+          // active: the editor resets the flag on unmount.
+          if (dirty) setLeaveTo(v)
+          else setValue(v)
+        }}
+        className="space-y-4"
+      >
+        <TabsList>
+          <TabsTrigger value="overview">Overview</TabsTrigger>
+          <TabsTrigger value="registrations">Registrations</TabsTrigger>
+          <TabsTrigger value="categories">Categories</TabsTrigger>
+          <TabsTrigger value="theme">
+            Theme
+            {dirty && (
+              <span
+                aria-hidden
+                data-dirty-badge
+                className="h-1.5 w-1.5 rounded-full bg-primary"
+              />
+            )}
+          </TabsTrigger>
+        </TabsList>
+
+        <TabsContent value="overview" className="space-y-4">
+          {overview}
+        </TabsContent>
+        <TabsContent value="registrations" className="space-y-4">
+          {registrations}
+        </TabsContent>
+        <TabsContent value="categories" className="space-y-4">
+          {categories}
+        </TabsContent>
+        <TabsContent value="theme" className="space-y-4">
+          {theme}
+        </TabsContent>
+      </Tabs>
+
+      <AlertDialog
+        open={leaveTo !== null}
+        onOpenChange={(open) => {
+          if (!open) setLeaveTo(null)
+        }}
+      >
+        <AlertDialogContent>
+          <AlertDialogHeader>
+            <AlertDialogTitle>Leave with unsaved theme changes?</AlertDialogTitle>
+            <AlertDialogDescription>
+              Your theme edits have not been saved. Switching tabs now will discard them.
+            </AlertDialogDescription>
+          </AlertDialogHeader>
+          <AlertDialogFooter>
+            <AlertDialogCancel>Stay on Theme</AlertDialogCancel>
+            <AlertDialogAction
+              onClick={() => {
+                const target = leaveTo
+                setLeaveTo(null)
+                setDirty(false)
+                if (target) setValue(target)
+              }}
+            >
+              Discard changes
+            </AlertDialogAction>
+          </AlertDialogFooter>
+        </AlertDialogContent>
+      </AlertDialog>
+    </ThemeDirtyContext.Provider>
+  )
+}
diff --git a/src/components/theme/event-theme-scope.tsx b/src/components/theme/event-theme-scope.tsx
new file mode 100644
index 0000000..d16683f
--- /dev/null
+++ b/src/components/theme/event-theme-scope.tsx
@@ -0,0 +1,58 @@
+/**
+ * EventThemeScope — server component, spec §5.3 (two-tier injection, zero FOUC).
+ *
+ * Resolves the event theme server-side and renders the themed scope as a
+ * wrapper div carrying ALL `--et-*` vars INLINE (tier 1) — values are correct
+ * at first paint, pre-hydration; next-themes `.dark` toggling re-resolves via
+ * pure CSS (`src/app/event-theme.css`, tier 2).
+ *
+ * The per-event heading @font-face (resolver-built: allowlisted URL,
+ * system-generated `ET-{prefix}-Heading` family) is injected as a <style>
+ * inside the scope — spec §5.4's resolver-built fallback. Scope dies with
+ * navigation, so the face dies with it.
+ *
+ * Unthemed events render children unwrapped: zero DOM, zero queries.
+ */
+import type { ReactNode } from 'react'
+import { createClient } from '@/lib/supabase/server'
+import { getResolvedTheme, type EventThemeInput } from '@/lib/theme/resolve'
+import { buildStyleVars, buildFontFace } from '@/lib/theme/css'
+
+/** Event row subset the scope consumes — `id` drives the font family + var bindings. */
+type EventWithTheme = EventThemeInput & { id: string }
+
+function isPlainObject(v: unknown): v is Record<string, unknown> {
+  return typeof v === 'object' && v !== null && !Array.isArray(v)
+}
+
+/** No-theme predicate: no preset reference AND no (non-empty) override config. */
+function hasTheme(event: EventWithTheme): boolean {
+  if (typeof event.theme_preset_id === 'string' && event.theme_preset_id.length > 0) return true
+  return isPlainObject(event.theme_config) && Object.keys(event.theme_config).length > 0
+}
+
+export async function EventThemeScope({
+  event,
+  children,
+}: {
+  event: EventWithTheme
+  children: ReactNode
+}) {
+  if (!hasTheme(event)) return <>{children}</>
+
+  // getResolvedTheme never throws — any failure degrades to the platform
+  // theme (spec §5.5), so the wrapper always carries valid oklch vars.
+  const supabase = await createClient()
+  const resolved = await getResolvedTheme(supabase, event)
+
+  // BINDING (Task 10 review carry): event.id is REQUIRED in both calls —
+  // without it the font vars/family never emit.
+  const fontFace = resolved.fonts.heading ? buildFontFace(event.id, resolved.fonts.heading) : ''
+
+  return (
+    <div className="event-theme" style={buildStyleVars(resolved, event.id)}>
+      {fontFace !== '' && <style dangerouslySetInnerHTML={{ __html: fontFace }} />}
+      {children}
+    </div>
+  )
+}
diff --git a/src/components/theme/mini-theme-preview.tsx b/src/components/theme/mini-theme-preview.tsx
new file mode 100644
index 0000000..5233bae
--- /dev/null
+++ b/src/components/theme/mini-theme-preview.tsx
@@ -0,0 +1,63 @@
+'use client'
+
+import { buildStyleVars } from '@/lib/theme/css'
+import type { ResolvedTheme } from '@/lib/theme/types'
+import { cn } from '@/lib/utils'
+
+/**
+ * MiniThemePreview — spec §8: preset gallery cards AND the editor's live
+ * preview render through the SAME `.event-theme` engine as the runner pages
+ * (EventThemeScope). No token mappings outside the stylesheet whitelist —
+ * the mock consumes themed tokens via Tailwind classes (`text-primary`,
+ * `bg-primary text-primary-foreground`, …) which resolve to the mapped vars.
+ *
+ * Pure CSS vars — no image generation, no client theme logic.
+ */
+export function MiniThemePreview({
+  resolved,
+  eventId,
+  className,
+}: {
+  resolved: ResolvedTheme
+  /** Two-arg form (Task 10 BINDING carry): the themed font family is bound
+   * per event id; P1 fonts are unset so no var emits today, but passing the
+   * real id keeps the preview font-correct when P2 lands. */
+  eventId?: string
+  className?: string
+}) {
+  return (
+    <div
+      className={cn('event-theme rounded-lg border bg-background p-3', className)}
+      style={buildStyleVars(resolved, eventId)}
+    >
+      {/* Themed event-card mock */}
+      <div className="space-y-2 rounded-md border bg-card p-3">
+        <p className="text-sm font-bold text-primary">Riverside Run 2026</p>
+        <div className="flex items-center gap-1.5">
+          <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
+            42.5K
+          </span>
+          <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
+            Open
+          </span>
+        </div>
+        <span className="block w-full rounded-md bg-primary px-3 py-1.5 text-center text-sm font-medium text-primary-foreground">
+          Register
+        </span>
+      </div>
+      {/* Themed leaderboard-row mock */}
+      <div className="mt-2 flex items-center gap-2 rounded-md border bg-card px-3 py-2">
+        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
+          1
+        </span>
+        <span className="flex-1 truncate text-sm">Runner name</span>
+        <span className="text-xs tabular-nums text-muted-foreground">00:42:07</span>
+      </div>
+      {/* Vocabulary live preview — resolved labels (fallbacks filled) as plain text children */}
+      <p className="mt-2 truncate text-xs text-muted-foreground">
+        {resolved.labels.checkpoint_label} · {resolved.labels.medal_label} ·{' '}
+        {resolved.labels.bib_label} #1234
+      </p>
+    </div>
+  )
+}
diff --git a/src/components/theme/theme-editor.tsx b/src/components/theme/theme-editor.tsx
new file mode 100644
index 0000000..ddb10c5
--- /dev/null
+++ b/src/components/theme/theme-editor.tsx
@@ -0,0 +1,454 @@
+'use client'
+
+import { useEffect, useMemo, useState } from 'react'
+import { Button } from '@/components/ui/button'
+import { Input } from '@/components/ui/input'
+import { Label } from '@/components/ui/label'
+import { Badge } from '@/components/ui/badge'
+import { Loader2, Moon, Paintbrush, RotateCcw, Save, Sun } from 'lucide-react'
+import { saveEventTheme } from '@/components/events/actions'
+import { useThemeDirtyReporter } from '@/components/events/event-tabs'
+import { MiniThemePreview } from '@/components/theme/mini-theme-preview'
+import { validateThemeConfig } from '@/lib/theme/validate'
+import { deriveTheme } from '@/lib/theme/resolve'
+import { normalizeThemeDraft, seedThemeDraft, themeDraftEquals } from '@/lib/theme/draft'
+import {
+  LABEL_KEYS,
+  LABEL_MAX,
+  fallbackLabel,
+  labelPreview,
+  sanitizeLabel,
+} from '@/lib/theme/labels'
+import { PLATFORM_BG_HEX, contrastRatio, hexToOklch, oklchToString } from '@/lib/theme/color'
+import type { LabelKey, ThemeTokens } from '@/lib/theme/types'
+import { cn } from '@/lib/utils'
+
+export type ThemePresetOption = {
+  id: string
+  name: string
+  tokens: ThemeTokens
+}
+
+const COLOR_ROLES = ['primary', 'secondary', 'accent', 'ring'] as const
+type ColorRole = (typeof COLOR_ROLES)[number]
+
+const ROLE_LABELS: Record<ColorRole, string> = {
+  primary: 'Primary',
+  secondary: 'Secondary',
+  accent: 'Accent',
+  ring: 'Ring',
+}
+
+// Same strict HEX contract the tokens use (validate.ts / 076).
+const HEX_RE = /^#[0-9a-fA-F]{6}$/
+
+/**
+ * Theme tab (spec §8, plan Task 13): preset gallery + custom color pickers +
+ * vocabulary fields with a live preview — everything renders through the same
+ * `.event-theme` engine as the runner pages. The WCAG gate UX: Save is
+ * hard-blocked only on the validateThemeConfig `errors` (the primary <3:1
+ * rule); secondary/accent/ring warn-and-degrade.
+ */
+export function ThemeEditor({
+  eventId,
+  canEdit,
+  savedPresetId,
+  savedConfig,
+  presets,
+}: {
+  eventId: string
+  canEdit: boolean
+  savedPresetId: string | null
+  savedConfig: ThemeTokens | null
+  presets: ThemePresetOption[]
+}) {
+  const [selectedPresetId, setSelectedPresetId] = useState(savedPresetId)
+  const [draft, setDraft] = useState<ThemeTokens>(() => seedThemeDraft(savedConfig))
+  const [baseline, setBaseline] = useState(() => ({
+    presetId: savedPresetId,
+    config: normalizeThemeDraft(seedThemeDraft(savedConfig)),
+  }))
+  const [saving, setSaving] = useState(false)
+  const [actionError, setActionError] = useState<string | null>(null)
+  const [saveWarnings, setSaveWarnings] = useState<string[]>([])
+  const [dark, setDark] = useState(false)
+
+  const payload = useMemo(() => normalizeThemeDraft(draft), [draft])
+  const validation = useMemo(() => validateThemeConfig(payload), [payload])
+  const dirty =
+    !themeDraftEquals(payload, baseline.config) || selectedPresetId !== baseline.presetId
+
+  const selectedPreset = presets.find((p) => p.id === selectedPresetId) ?? null
+  const previewResolved = useMemo(
+    () => deriveTheme(selectedPreset?.tokens ?? {}, payload, selectedPresetId),
+    [selectedPreset, payload, selectedPresetId],
+  )
+
+  // Dirty-state badge on the tab + leave confirmation (EventPageTabs shell).
+  const reportDirty = useThemeDirtyReporter()
+  useEffect(() => {
+    reportDirty?.(dirty)
+    return () => reportDirty?.(false)
+  }, [dirty, reportDirty])
+
+  function setColor(role: ColorRole, hex: string) {
+    setDraft((d) => ({ ...d, colors: { ...(d.colors ?? {}), [role]: hex } }))
+  }
+
+  // Per-key reset = OMIT the key (carried requirement): the preset value (or
+  // the platform default, for Custom) flows through the merge instead.
+  function resetColor(role: ColorRole) {
+    setDraft((d) => {
+      const colors = { ...(d.colors ?? {}) }
+      delete colors[role]
+      const next = { ...d }
+      if (Object.keys(colors).length > 0) next.colors = colors
+      else delete next.colors
+      return next as ThemeTokens
+    })
+  }
+
+  function setVocab(key: LabelKey, raw: string) {
+    const clean = sanitizeLabel(raw)
+    setDraft((d) => {
+      const vocabulary = { ...(d.vocabulary ?? {}) }
+      if (clean.length === 0) delete vocabulary[key]
+      else vocabulary[key] = clean
+      const next = { ...d }
+      if (Object.keys(vocabulary).length > 0) next.vocabulary = vocabulary
+      else delete next.vocabulary
+      return next as ThemeTokens
+    })
+  }
+
+  async function handleSave() {
+    if (!canEdit || saving || !validation.ok || !dirty) return
+    setSaving(true)
+    setActionError(null)
+    setSaveWarnings([])
+    try {
+      const result = await saveEventTheme(eventId, {
+        theme_preset_id: selectedPresetId,
+        theme_config: payload,
+      })
+      if (result.ok) {
+        setBaseline({ presetId: selectedPresetId, config: payload })
+        setSaveWarnings(result.warnings)
+      } else {
+        setActionError(result.error)
+      }
+    } catch {
+      setActionError('Could not save the theme. Please try again.')
+    } finally {
+      setSaving(false)
+    }
+  }
+
+  return (
+    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
+      <div className="space-y-6">
+        {!canEdit && (
+          <p className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
+            You can only theme events you organize — this tab is read-only.
+          </p>
+        )}
+
+        {/* ── Preset gallery (cards rendered through the same .event-theme engine) ── */}
+        <section className="space-y-3">
+          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
+            Preset
+          </h3>
+          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
+            {presets.map((preset) => (
+              <button
+                key={preset.id}
+                type="button"
+                disabled={!canEdit}
+                onClick={() => setSelectedPresetId(preset.id)}
+                aria-pressed={selectedPresetId === preset.id}
+                className={cn(
+                  'rounded-lg border p-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
+                  selectedPresetId === preset.id
+                    ? 'border-primary ring-2 ring-ring/50'
+                    : 'hover:border-primary/50',
+                )}
+              >
+                <MiniThemePreview resolved={deriveTheme(preset.tokens, null, preset.id)} eventId={eventId} />
+                <p className="mt-1.5 truncate text-xs font-medium">{preset.name}</p>
+              </button>
+            ))}
+            <button
+              type="button"
+              disabled={!canEdit}
+              onClick={() => setSelectedPresetId(null)}
+              aria-pressed={selectedPresetId === null}
+              className={cn(
+                'flex min-h-[80px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-2 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-60',
+                selectedPresetId === null
+                  ? 'border-primary ring-2 ring-ring/50'
+                  : 'hover:border-primary/50',
+              )}
+            >
+              <Paintbrush className="h-4 w-4 text-muted-foreground" />
+              <span className="text-xs font-medium">Custom</span>
+              <span className="text-xs text-muted-foreground">Platform + your overrides</span>
+            </button>
+          </div>
+        </section>
+
+        {/* ── Colors: native picker + HEX, live oklch chip, WCAG meter, per-row reset ── */}
+        <section className="space-y-3">
+          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
+            Colors
+          </h3>
+          <div className="space-y-2">
+            {COLOR_ROLES.map((role) => (
+              <ColorRow
+                key={role}
+                role={role}
+                value={effectiveColor(draft, selectedPreset, role)}
+                overridden={isOverridden(draft, role)}
+                canEdit={canEdit}
+                onChange={(hex) => setColor(role, hex)}
+                onReset={() => resetColor(role)}
+              />
+            ))}
+          </div>
+        </section>
+
+        {/* ── Vocabulary: six inputs, live 40-char cap + sanitized on input ── */}
+        <section className="space-y-3">
+          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
+            Vocabulary
+          </h3>
+          <div className="grid gap-3 sm:grid-cols-2">
+            {LABEL_KEYS.map((key) => {
+              const labelKey = key as LabelKey
+              const override = draft.vocabulary?.[labelKey]
+              const presetValue = selectedPreset?.tokens?.vocabulary?.[labelKey]
+              const effective =
+                override ??
+                (typeof presetValue === 'string' ? presetValue : fallbackLabel(labelKey))
+              return (
+                <div key={key} className="space-y-1">
+                  <div className="flex items-center justify-between">
+                    <Label htmlFor={`vocab-${key}`} className="text-xs">
+                      {fallbackLabel(labelKey)}
+                    </Label>
+                    <span className="text-xs text-muted-foreground">
+                      {(override ?? '').length}/{LABEL_MAX}
+                    </span>
+                  </div>
+                  <div className="flex gap-1.5">
+                    <Input
+                      id={`vocab-${key}`}
+                      value={override ?? ''}
+                      maxLength={LABEL_MAX}
+                      disabled={!canEdit}
+                      placeholder={typeof presetValue === 'string' ? presetValue : fallbackLabel(labelKey)}
+                      onChange={(e) => setVocab(labelKey, e.target.value)}
+                      className="h-8 text-sm"
+                    />
+                    {override !== undefined && (
+                      <Button
+                        type="button"
+                        variant="ghost"
+                        size="icon"
+                        disabled={!canEdit}
+                        aria-label={`Reset ${fallbackLabel(labelKey)}`}
+                        onClick={() => setVocab(labelKey, '')}
+                      >
+                        <RotateCcw className="h-3 w-3" />
+                      </Button>
+                    )}
+                  </div>
+                  <p className="text-xs text-muted-foreground">{labelPreview(effective)}</p>
+                </div>
+              )
+            })}
+          </div>
+        </section>
+      </div>
+
+      {/* ── Sticky live preview + save bar ─────────────────────────────── */}
+      <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
+        <div className="flex items-center justify-between">
+          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
+            Live preview
+          </h3>
+          <Button
+            type="button"
+            variant="ghost"
+            size="icon"
+            aria-label="Toggle dark mode preview"
+            onClick={() => setDark((v) => !v)}
+          >
+            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
+          </Button>
+        </div>
+        {/* `.dark` ancestor + .event-theme descendant = pure-CSS dark re-resolution */}
+        <div className={dark ? 'dark' : undefined}>
+          <MiniThemePreview resolved={previewResolved} eventId={eventId} />
+        </div>
+
+        {canEdit && (
+          <div className="space-y-2 rounded-lg border border-border p-3">
+            <div className="flex items-center justify-between">
+              <span className="text-sm font-medium">Save</span>
+              {dirty && <Badge variant="secondary">Unsaved changes</Badge>}
+            </div>
+            {validation.errors.map((error) => (
+              <p key={error} className="text-xs text-destructive">
+                {error}
+              </p>
+            ))}
+            {[...new Set([...validation.warnings, ...saveWarnings])].map((warning) => (
+              <p key={warning} className="text-xs text-amber-600 dark:text-amber-400">
+                {warning}
+              </p>
+            ))}
+            {actionError && <p className="text-xs text-destructive">{actionError}</p>}
+            <Button
+              type="button"
+              onClick={handleSave}
+              disabled={saving || !validation.ok || !dirty}
+              className="w-full"
+            >
+              {saving ? (
+                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
+              ) : (
+                <Save className="mr-2 h-4 w-4" />
+              )}
+              Save theme
+            </Button>
+          </div>
+        )}
+      </div>
+    </div>
+  )
+}
+
+function isOverridden(draft: ThemeTokens, role: ColorRole): boolean {
+  return typeof draft.colors?.[role] === 'string'
+}
+
+function effectiveColor(
+  draft: ThemeTokens,
+  preset: ThemePresetOption | null,
+  role: ColorRole,
+): string {
+  const override = draft.colors?.[role]
+  if (typeof override === 'string') return override
+  const presetValue = preset?.tokens?.colors?.[role]
+  return typeof presetValue === 'string' ? presetValue : ''
+}
+
+/**
+ * One color row: native picker + HEX field (valid full HEX commits to the
+ * draft mid-typing; invalid input stays local until it is valid or reverted),
+ * live oklch chip, WCAG meter, per-row reset.
+ */
+function ColorRow({
+  role,
+  value,
+  overridden,
+  canEdit,
+  onChange,
+  onReset,
+}: {
+  role: ColorRole
+  value: string
+  overridden: boolean
+  canEdit: boolean
+  onChange: (hex: string) => void
+  onReset: () => void
+}) {
+  const [text, setText] = useState(value)
+  // Follow preset switches / resets: adjust-on-prop-change during render (the
+  // React-documented pattern — avoids a cascading-render effect).
+  const [lastValue, setLastValue] = useState(value)
+  if (value !== lastValue) {
+    setLastValue(value)
+    setText(value)
+  }
+
+  const valid = HEX_RE.test(text)
+  const ratio = valid ? contrastRatio(text, PLATFORM_BG_HEX) : null
+
+  // Mirror of validate.ts's contrastGate verdicts (validate.ts stays the
+  // save-gate authority — this is per-row presentation only).
+  const verdict =
+    ratio === null
+      ? null
+      : ratio < 3
+        ? role === 'primary'
+          ? 'blocked'
+          : 'degrades'
+        : 'pass'
+
+  return (
+    <div className="flex items-center gap-2 rounded-lg border border-border p-2.5">
+      <span
+        aria-hidden
+        className="h-8 w-8 shrink-0 rounded-md border border-border"
+        style={valid ? { backgroundColor: text } : undefined}
+      />
+      <div className="min-w-0 flex-1 space-y-0.5">
+        <div className="flex items-center gap-2">
+          <Label className="text-xs">{ROLE_LABELS[role]}</Label>
+          {valid && (
+            <span className="font-mono text-xs text-muted-foreground">{oklchToString(hexToOklch(text))}</span>
+          )}
+        </div>
+        <p className="text-xs text-muted-foreground">
+          {ratio === null
+            ? 'Enter a 6-digit HEX color'
+            : `${ratio.toFixed(2)}:1 vs platform background${
+                verdict === 'pass'
+                  ? ' — pass'
+                  : verdict === 'blocked'
+                    ? ' — save blocked'
+                    : ' — will degrade to platform color'
+              } · dark mode auto (derived)`}
+        </p>
+      </div>
+      <input
+        type="color"
+        aria-label={`${ROLE_LABELS[role]} color picker`}
+        value={valid ? text : '#000000'}
+        disabled={!canEdit}
+        onChange={(e) => {
+          setText(e.target.value)
+          onChange(e.target.value)
+        }}
+        className="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
+      />
+      <Input
+        aria-label={`${ROLE_LABELS[role]} hex value`}
+        value={text}
+        maxLength={7}
+        disabled={!canEdit}
+        placeholder="Platform"
+        onChange={(e) => {
+          const next = e.target.value
+          setText(next)
+          if (HEX_RE.test(next)) onChange(next)
+        }}
+        onBlur={() => setText(value)} // revert invalid/partial input
+        className="h-8 w-24 font-mono text-xs"
+      />
+      {overridden && (
+        <Button
+          type="button"
+          variant="ghost"
+          size="icon"
+          disabled={!canEdit}
+          aria-label={`Reset ${ROLE_LABELS[role]} to preset`}
+          onClick={onReset}
+        >
+          <RotateCcw className="h-3 w-3" />
+        </Button>
+      )}
+    </div>
+  )
+}
diff --git a/src/lib/theme/color.ts b/src/lib/theme/color.ts
new file mode 100644
index 0000000..d632830
--- /dev/null
+++ b/src/lib/theme/color.ts
@@ -0,0 +1,143 @@
+/**
+ * Vendored color math for Event Themes — zero-dependency (spec §5.2, design doc v2.1).
+ *
+ * Implements the standard sRGB → linear → OKLab → OKLCH formulas (Björn Ottosson,
+ * public domain — same constants as culori / CSS Color 4) and WCAG 2.1 sRGB
+ * relative luminance / contrast. No npm deps, no inverse OKLCH→sRGB (unneeded:
+ * dark variants are emitted directly as `oklch()` strings).
+ *
+ * Every function degrades to a safe fallback on malformed input and never throws
+ * (spec §5.5.4 "resolve never throws") — warnings are the caller's (resolve.ts) job.
+ */
+
+type Oklch = { l: number; c: number; h: number }
+
+/** Strict token contract: `^#[0-9a-fA-F]{6}$` (Global Constraints); `#` optional at runtime. */
+const HEX_RE = /^#?([0-9a-fA-F]{6})$/
+
+/** `#rrggbb` → [r, g, b] 0–255 (cert payload). Malformed input → [0, 0, 0]. */
+export function hexToRgb255(hex: string): [number, number, number] {
+  return parseHex(hex) ?? [0, 0, 0]
+}
+
+/** `#rrggbb` → [r, g, b] 0–255, or null when malformed. */
+function parseHex(hex: unknown): [number, number, number] | null {
+  if (typeof hex !== 'string') return null
+  const m = HEX_RE.exec(hex.trim())
+  if (!m) return null
+  const n = parseInt(m[1], 16)
+  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
+}
+
+/**
+ * sRGB transfer function. Two thresholds by spec:
+ * - 0.04045 (standard sRGB/CSS) for the OKLCH path — parity with standard formulas.
+ * - 0.03928 (WCAG 2.1 text) for relative luminance.
+ * Difference is numerically negligible but we honor each spec verbatim.
+ */
+function toLinear(v: number, threshold: number): number {
+  return v <= threshold ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
+}
+
+function linearFromHex(hex: unknown, threshold: number): [number, number, number] | null {
+  const rgb = parseHex(hex)
+  if (!rgb) return null
+  return [
+    toLinear(rgb[0] / 255, threshold),
+    toLinear(rgb[1] / 255, threshold),
+    toLinear(rgb[2] / 255, threshold),
+  ]
+}
+
+/** HEX → OKLCH. Malformed input → `{ l: 0, c: 0, h: 0 }` (black). */
+export function hexToOklch(hex: string): { l: number; c: number; h: number } {
+  const lin = linearFromHex(hex, 0.04045)
+  if (!lin) return { l: 0, c: 0, h: 0 }
+  const [r, g, b] = lin
+
+  // linear sRGB → LMS (OKLab M1)
+  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
+  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
+  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
+
+  const l_ = Math.cbrt(l)
+  const m_ = Math.cbrt(m)
+  const s_ = Math.cbrt(s)
+
+  // LMS' → OKLab (M2)
+  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
+  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
+  const b2 = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
+
+  const c = Math.sqrt(a * a + b2 * b2)
+  let h = (Math.atan2(b2, a) * 180) / Math.PI
+  if (h < 0) h += 360
+  return { l: L, c, h }
+}
+
+/** `{l, c, h}` → `oklch(L C H)` (l/c 3 decimals, h 1 decimal, trailing zeros trimmed). */
+export function oklchToString(o: Oklch): string {
+  return `oklch(${round(o.l, 3)} ${round(o.c, 3)} ${round(o.h, 1)})`
+}
+
+function round(v: number, digits: number): number {
+  return Number(v.toFixed(digits))
+}
+
+/** WCAG 2.1 sRGB relative luminance (threshold 0.03928). Malformed input → 0. */
+export function relativeLuminance(hex: string): number {
+  const lin = linearFromHex(hex, 0.03928)
+  if (!lin) return 0
+  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
+}
+
+/** WCAG 2.1 contrast ratio, order-independent. Malformed input → 1 (no contrast). */
+export function contrastRatio(a: string, b: string): number {
+  if (!parseHex(a) || !parseHex(b)) return 1
+  const la = relativeLuminance(a)
+  const lb = relativeLuminance(b)
+  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
+  return (hi + 0.05) / (lo + 0.05)
+}
+
+// ── Platform background — ONE shared decision for both 3:1 gates ─────────
+// The platform light --background is oklch(0.985 0 0) (globals.css :root), a
+// neutral gray whose sRGB hex is exactly #fafafa (Y = 0.985³ → 250/255). WCAG
+// math here is HEX-only, so the save-gate (validate.ts) and the resolve
+// degrade-precheck both measure against this single constant. (The earlier
+// resolve-side proxy #f4f4f4 drifted by ΔY = 0.051 and flipped verdicts in the
+// 3.0–3.06:1 band — e.g. #909090 blocked at save, kept at render. Do not
+// reintroduce a second constant; globals.css is the source of truth.)
+export const PLATFORM_BG_HEX = '#fafafa'
+
+const WHITE = '#ffffff'
+const DARK_FOREGROUND = 'oklch(0.145 0 0)'
+
+/**
+ * First foreground reaching ≥4.5:1 against `fill`: `#ffffff`, else the platform
+ * dark foreground `oklch(0.145 0 0)`. Guarantees a co-injected `-foreground`
+ * companion (no white-on-yellow). Malformed fill → dark foreground.
+ */
+export function pickForeground(fill: string): string {
+  if (parseHex(fill) && contrastRatio(fill, WHITE) >= 4.5) return WHITE
+  return DARK_FOREGROUND
+}
+
+// Platform dark heuristic (spec §5.2 / globals.css light→dark): same hue,
+// L clamped to [0.68, 0.82], chroma ×0.85 capped at 0.20.
+const DARK_L_MIN = 0.68
+const DARK_L_MAX = 0.82
+const DARK_CHROMA_FACTOR = 0.85
+const DARK_CHROMA_CAP = 0.2
+
+/**
+ * HEX → dark-variant `oklch()` string (same hue, L clamp [0.68, 0.82],
+ * chroma ×0.85 cap 0.20). Malformed input → neutral `oklch(0.68 0 0)`.
+ */
+export function deriveDarkVariant(hex: string): string {
+  const o = hexToOklch(hex)
+  if (!parseHex(hex)) return oklchToString({ l: DARK_L_MIN, c: 0, h: 0 })
+  const l = Math.min(Math.max(o.l, DARK_L_MIN), DARK_L_MAX)
+  const c = Math.min(o.c * DARK_CHROMA_FACTOR, DARK_CHROMA_CAP)
+  return oklchToString({ l, c, h: o.h })
+}
diff --git a/src/lib/theme/css.ts b/src/lib/theme/css.ts
new file mode 100644
index 0000000..ab67a8b
--- /dev/null
+++ b/src/lib/theme/css.ts
@@ -0,0 +1,116 @@
+/**
+ * Inline style-var + @font-face builders — spec §5.3 (two-tier injection) and
+ * §5.4 (typography allowlist).
+ *
+ * buildStyleVars emits the PRIVATE intermediates (`--et-*`) for the scope div;
+ * the static stylesheet (src/app/event-theme.css) maps them onto the Tailwind
+ * theme vars inside `.event-theme`. The stylesheet whitelist is the hard
+ * boundary (spec §5.3) — this module only produces values, and ONLY for the
+ * whitelisted tokens (no --background/--foreground pairs: they are
+ * structurally unreachable).
+ *
+ * Dark slots are opaque `oklch()` STRINGS from resolve.ts — passed through
+ * verbatim, never re-parsed (Task 6 carried requirement).
+ */
+import type { CSSProperties } from 'react'
+import type { BrandSlot, ResolvedTheme } from './types'
+
+/** The four themed roles, in injection order. */
+const ROLES = ['primary', 'secondary', 'accent', 'ring'] as const
+
+/**
+ * @param resolved — output of resolve.ts (never throws upstream).
+ * @param eventId — event uuid. Required for font vars: the themed font family
+ *   is system-generated per event (`ET-{eventIdPrefix}-Heading`, spec §5.4),
+ *   so the single-arg signature from the plan cannot emit them. Optional and
+ *   call-compatible; color vars never depend on it.
+ */
+export function buildStyleVars(resolved: ResolvedTheme, eventId?: string): CSSProperties {
+  const vars: Record<string, string> = {}
+  for (const role of ROLES) {
+    const slot: BrandSlot = resolved[role]
+    vars[`--et-${role}`] = slot.light
+    vars[`--et-${role}-dark`] = slot.dark
+    vars[`--et-${role}-fg`] = slot.fgLight
+    vars[`--et-${role}-fg-dark`] = slot.fgDark
+  }
+  if (eventId) {
+    const prefix = eventIdPrefix(eventId)
+    // Full fallback stack travels in the var — the static rule stays a single
+    // var() deep, and the stack always ends in Geist (spec §5.4). The body
+    // face is not registered in P1 (heading-only @font-face), so an unset
+    // family falls through to Geist = platform behavior until P2.
+    if (resolved.fonts.heading) vars['--et-font-heading'] = `${headingFamily(eventId)}, var(--font-geist)`
+    if (resolved.fonts.body) vars['--et-font-body'] = `ET-${prefix}-Body, var(--font-geist)`
+  }
+  // Custom properties are not in React's closed CSSProperties type; the cast
+  // is the standard pattern for CSS-variable style objects.
+  return vars as CSSProperties
+}
+
+/** `9b2f4c1e-abcd-…` → `9b2f4c1e` — the uuid's first segment, alnum-only. */
+function eventIdPrefix(eventId: string): string {
+  return eventId.split('-')[0]?.replace(/[^A-Za-z0-9]/g, '') || 'Event'
+}
+
+function headingFamily(eventId: string): string {
+  return `ET-${eventIdPrefix(eventId)}-Heading`
+}
+
+// Font URL allowlist — spec §5.4, enforced HERE (app layer). The DB-layer
+// charset check is bypassable via `https://host/../x` (Task 1 review pin);
+// URL normalization + the .woff2 check below close that path.
+const FONT_STATIC_HOST = 'fonts.gstatic.com'
+
+function platformStorageHost(): string | null {
+  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
+  if (!raw) return null
+  try {
+    return new URL(raw).host
+  } catch {
+    return null
+  }
+}
+
+/**
+ * Validate a font URL against the §5.4 allowlist: https only, host is the
+ * platform storage origin (Supabase) or fonts.gstatic.com, path ends
+ * `.woff2`, no dot-dot path segments. Returns the normalized URL or null
+ * (caller degrades to Geist — never throws, spec §5.5).
+ */
+function allowedFontUrl(raw: string): URL | null {
+  // Traversal guard runs on the RAW string: URL normalization silently
+  // resolves `..` away, which is exactly the DB-layer bypass this boundary
+  // replaces (Task 1 review pin). Covers raw and percent-encoded segments on
+  // BOTH sides of the dot-dot run — including the fully-encoded `%2e%2e%2f`
+  // and the `x%2f..%2fy` leader form (Task 14 hardening).
+  if (/(?:^|\/|%2f|\?)(?:\.|%2e){2}(?:\/|%2f|\?|#|$)/i.test(raw)) return null
+  let url: URL
+  try {
+    url = new URL(raw)
+  } catch {
+    return null
+  }
+  if (url.protocol !== 'https:') return null
+  if (url.host !== FONT_STATIC_HOST && url.host !== platformStorageHost()) return null
+  if (!url.pathname.toLowerCase().endsWith('.woff2')) return null
+  return url
+}
+
+/**
+ * Build the `@font-face` block for a themed heading font, or '' when the URL
+ * fails the allowlist (no face injected → headings fall back to Geist).
+ * Family name is system-generated from the event id — never user input.
+ */
+export function buildFontFace(eventId: string, fontUrl: string): string {
+  const url = allowedFontUrl(fontUrl)
+  if (!url) return ''
+  return [
+    '@font-face {',
+    `  font-family: ${headingFamily(eventId)};`,
+    `  src: url("${url.href}") format("woff2");`,
+    '  font-display: swap;',
+    '}',
+    '',
+  ].join('\n')
+}
diff --git a/src/lib/theme/draft.ts b/src/lib/theme/draft.ts
new file mode 100644
index 0000000..951cd01
--- /dev/null
+++ b/src/lib/theme/draft.ts
@@ -0,0 +1,88 @@
+/**
+ * Theme-editor draft state (Task 13, spec §8). Isomorphic pure helpers over
+ * the `events.theme_config`-shaped override draft.
+ *
+ * Reset semantics (carried requirements, Tasks 3/9):
+ *  - per-key reset = OMIT the key — explicit JSON nulls are rejected at every
+ *    nesting level (validate.ts mirror + 076 validator), so the editor never
+ *    produces them;
+ *  - a draft with nothing left normalizes to null = full reset (the action
+ *    writes `theme_config: null`, SQL NULL).
+ */
+import { LABEL_KEYS } from './labels'
+import type { ThemeTokens } from './types'
+
+const SECTION_KEYS = ['colors', 'typography', 'assets', 'vocabulary'] as const
+
+// Canonical key order for the sections the P1 editor edits (colors +
+// vocabulary). jsonb row order is not stable; rebuilding in this order keeps
+// equality checks stable. Same list as validate.ts/resolve.ts (kept local,
+// mirroring the codebase's per-module self-containment).
+const COLOR_KEYS = ['primary', 'secondary', 'accent', 'background', 'foreground', 'ring'] as const
+
+function isPlainObject(v: unknown): v is Record<string, unknown> {
+  return typeof v === 'object' && v !== null && !Array.isArray(v)
+}
+
+/**
+ * DB row (untrusted JSONB shape) → a safe editable draft. Non-object sections
+ * (including explicit section nulls) are omitted — they are reset-to-platform
+ * per merge semantics, and carrying them would trip the write validator.
+ */
+export function seedThemeDraft(config: unknown): ThemeTokens {
+  if (!isPlainObject(config)) return {}
+  const out: Record<string, unknown> = {}
+
+  const colors = config.colors
+  if (isPlainObject(colors)) {
+    const c: Record<string, unknown> = {}
+    for (const k of COLOR_KEYS) if (k in colors) c[k] = colors[k]
+    if (Object.keys(c).length > 0) out.colors = c
+  }
+
+  const vocabulary = config.vocabulary
+  if (isPlainObject(vocabulary)) {
+    const v: Record<string, unknown> = {}
+    for (const k of LABEL_KEYS) if (k in vocabulary) v[k] = vocabulary[k]
+    if (Object.keys(v).length > 0) out.vocabulary = v
+  }
+
+  // Sections the P1 editor doesn't manage (P2 assets/typography) pass through
+  // verbatim so a later phase's data survives an earlier-phase edit.
+  for (const section of ['typography', 'assets'] as const) {
+    const value = config[section]
+    if (isPlainObject(value) && Object.keys(value).length > 0) out[section] = { ...value }
+  }
+
+  return out as ThemeTokens
+}
+
+/**
+ * Draft → the exact payload to persist: null leaves/sections omitted, empty
+ * sections dropped, empty draft → null (full reset). Never emits JSON nulls.
+ */
+export function normalizeThemeDraft(draft: ThemeTokens | null): ThemeTokens | null {
+  if (draft === null || !isPlainObject(draft)) return null
+  const out: Record<string, unknown> = {}
+  for (const section of SECTION_KEYS) {
+    const value = draft[section]
+    if (!isPlainObject(value)) continue
+    const clean: Record<string, unknown> = {}
+    for (const [k, v] of Object.entries(value)) if (v !== null) clean[k] = v
+    if (Object.keys(clean).length > 0) out[section] = clean
+  }
+  return Object.keys(out).length > 0 ? (out as ThemeTokens) : null
+}
+
+/** Stable, key-order-independent comparison of two drafts (normalized). */
+export function themeDraftEquals(a: ThemeTokens | null, b: ThemeTokens | null): boolean {
+  return stableStringify(normalizeThemeDraft(a)) === stableStringify(normalizeThemeDraft(b))
+}
+
+function stableStringify(v: unknown): string {
+  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
+  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
+  const obj = v as Record<string, unknown>
+  const keys = Object.keys(obj).sort()
+  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
+}
diff --git a/src/lib/theme/labels.ts b/src/lib/theme/labels.ts
new file mode 100644
index 0000000..fb52207
--- /dev/null
+++ b/src/lib/theme/labels.ts
@@ -0,0 +1,75 @@
+/**
+ * Vocabulary labels — spec §5.2: sanitization + platform fallback map +
+ * preview templates. Single source of label truth for runner pages, the cert
+ * payload, and the vocab editor.
+ *
+ * Output is ALWAYS plain strings: consumers render labels as React text
+ * children only — never dangerouslySetInnerHTML (Global Constraints).
+ */
+import type { LabelKey } from './types'
+
+/** The six fixed vocabulary keys (Global Constraints; DB cap 64, UI cap 40). */
+export const LABEL_KEYS = [
+  'bib_label',
+  'checkpoint_label',
+  'medal_label',
+  'run_label',
+  'participant_label',
+  'certificate_label',
+] as const
+
+/** Platform fallbacks — bib is included so presets like Batik Heritage
+ * (bib_label absent by design) still resolve a full label map. */
+const FALLBACKS: Record<LabelKey, string> = {
+  bib_label: 'Bib Number',
+  checkpoint_label: 'Checkpoint',
+  medal_label: 'Medal',
+  run_label: 'Run',
+  participant_label: 'Participant',
+  certificate_label: 'Certificate',
+}
+
+/** UI cap (Global Constraints) — DB allows 64, the UI shows 40. Exported for
+ * the Task 13 editor's live 40-char cap (reviewer-approved carry). */
+export const LABEL_MAX = 40
+
+/**
+ * Trim, collapse whitespace, strip HTML markup + stray angle brackets +
+ * C0 control characters, cap at 40 chars. Never throws; degenerate input
+ * sanitizes to '' (caller applies the fallback).
+ */
+export function sanitizeLabel(input: string): string {
+  return input
+    .replace(/<[^>]*>/g, '') // well-formed <…> markup (incl. <b>Scroll</b>)
+    .replace(/[<>]/g, '') // stray unclosed brackets
+    .replace(/\s+/g, ' ') // collapse whitespace runs (tabs/newlines → space)
+    .replace(/[\u0000-\u001F]/g, '') // remaining C0 controls
+    .trim()
+    .slice(0, LABEL_MAX)
+}
+
+/** Platform fallback for a key; unknown keys → '' (ignored). */
+export function fallbackLabel(key: string): string {
+  return (LABEL_KEYS as readonly string[]).includes(key)
+    ? FALLBACKS[key as LabelKey]
+    : ''
+}
+
+/**
+ * Raw vocabulary (partial, untrusted shapes tolerated at runtime) → the full
+ * 6-key label map: sanitized values win, empty/missing → platform fallback.
+ */
+export function resolveLabels(raw: Record<string, string> | null): Record<LabelKey, string> {
+  const out = {} as Record<LabelKey, string>
+  for (const key of LABEL_KEYS) {
+    const value = raw?.[key]
+    const clean = typeof value === 'string' ? sanitizeLabel(value) : ''
+    out[key] = clean.length > 0 ? clean : fallbackLabel(key)
+  }
+  return out
+}
+
+/** Preview template for the vocab editor (spec §5.2, e.g. "Your Bib Number #1234"). */
+export function labelPreview(label: string): string {
+  return `Your ${label} #1234`
+}
diff --git a/src/lib/theme/resolve.ts b/src/lib/theme/resolve.ts
new file mode 100644
index 0000000..d044bfe
--- /dev/null
+++ b/src/lib/theme/resolve.ts
@@ -0,0 +1,332 @@
+/**
+ * Theme resolver — spec §5 flow: preset.tokens ⊕ event.theme_config → merge
+ * (known-keys, plain-object guard, null→drop) → HEX validation → contrast
+ * precheck → dark derivation → ResolvedTheme.
+ *
+ * Resolve NEVER throws (spec §5.5): any failure — missing preset, malformed
+ * theme_config, unexpected errors — degrades to the platform theme with
+ * recorded warnings. The stylesheet whitelist (Task 10) stays the hard
+ * boundary; this module only decides token values.
+ */
+import type { SupabaseClient } from '@supabase/supabase-js'
+import {
+  hexToOklch,
+  oklchToString,
+  contrastRatio,
+  pickForeground,
+  deriveDarkVariant,
+  PLATFORM_BG_HEX,
+} from './color'
+import { LABEL_KEYS, resolveLabels } from './labels'
+import type { BrandSlot, ResolvedTheme, ThemeTokens } from './types'
+
+// Stored-token HEX contract (Global Constraints / spec §4.3: ^#[0-9a-fA-F]{6}$).
+// color.ts's own regex is looser (`#` optional) and private; resolve validates
+// the stored contract verbatim.
+const HEX_RE = /^#[0-9a-fA-F]{6}$/
+
+// Platform dark foreground — assigned DIRECTLY to fgDark for themed slots.
+// Carried requirement (Task 6 review): never call pickForeground on an oklch
+// string — parseHex is HEX-only, so it would "fail" and silently return this
+// same dark fg, masking real bugs. Direct assignment keeps that failure
+// impossible; dark variants (L ∈ [0.68, 0.82]) always measure ≥ ~6.9:1
+// against it, so the companion is safe by construction.
+const DARK_FG = 'oklch(0.145 0 0)'
+
+const COLOR_KEYS = ['primary', 'secondary', 'accent', 'background', 'foreground', 'ring'] as const
+const TYPOGRAPHY_KEYS = ['heading_font_url', 'body_font_url'] as const
+const ASSET_KEYS = ['banner_url', 'logo_url', 'badge_icon_url', 'certificate_background_url'] as const
+const META_KEYS = ['version'] as const
+const SECTION_KEYS = ['colors', 'typography', 'assets', 'vocabulary', 'meta'] as const
+
+// Platform tokens — mirror src/app/globals.css (:root / .dark). Keep in sync.
+const PLATFORM_SLOTS: Record<'primary' | 'secondary' | 'accent' | 'ring', BrandSlot> = {
+  primary: {
+    light: 'oklch(0.51 0.16 190)',
+    dark: 'oklch(0.75 0.13 190)',
+    fgLight: 'oklch(1 0 0)',
+    fgDark: 'oklch(0.15 0.04 190)',
+  },
+  secondary: {
+    light: 'oklch(0.92 0 0)',
+    dark: 'oklch(0.16 0 0)',
+    fgLight: 'oklch(0.145 0 0)',
+    fgDark: 'oklch(0.985 0 0)',
+  },
+  accent: {
+    light: 'oklch(0.92 0 0)',
+    dark: 'oklch(0.28 0.03 190)',
+    fgLight: 'oklch(0.145 0 0)',
+    fgDark: 'oklch(0.985 0 0)',
+  },
+  ring: {
+    light: 'oklch(0.51 0.16 190)',
+    dark: 'oklch(0.75 0.13 190)',
+    fgLight: 'oklch(1 0 0)',
+    fgDark: 'oklch(0.15 0.04 190)',
+  },
+}
+
+// Resolve-time label fallbacks + sanitization live in labels.ts (Task 8) —
+// single source of label truth for resolve, runner pages, and the cert payload.
+
+function isPlainObject(v: unknown): v is Record<string, unknown> {
+  return typeof v === 'object' && v !== null && !Array.isArray(v)
+}
+
+/** Allowlist projection: copies only known keys from a plain object. */
+function knownSection(src: unknown, keys: readonly string[]): Record<string, unknown> {
+  const out: Record<string, unknown> = {}
+  if (!isPlainObject(src)) return out
+  for (const k of keys) if (k in src) out[k] = src[k]
+  return out
+}
+
+function subKeysFor(section: (typeof SECTION_KEYS)[number]): readonly string[] {
+  switch (section) {
+    case 'colors':
+      return COLOR_KEYS
+    case 'typography':
+      return TYPOGRAPHY_KEYS
+    case 'assets':
+      return ASSET_KEYS
+    case 'vocabulary':
+      // labels.ts owns the key list (single source of label truth).
+      return LABEL_KEYS
+    case 'meta':
+      return META_KEYS
+  }
+}
+
+/**
+ * Deep merge of preset tokens ⊕ event override — event wins on leaf
+ * conflicts, unknown keys dropped silently, non-object sections dropped,
+ * `null` leaves/sections dropped (→ platform default downstream, spec §4.3
+ * `jsonb_strip_nulls` semantics). Never throws on malformed input.
+ */
+export function mergeThemeConfig(preset: ThemeTokens, override: ThemeTokens | null): ThemeTokens {
+  // Allowlist both sides up front — unknown keys (and `__proto__`-style JSONB
+  // hand-crafts) can never reach the output object.
+  const base = knownSection(preset, SECTION_KEYS)
+  const over = override === null ? {} : knownSection(override, SECTION_KEYS)
+  const merged: Record<string, unknown> = {}
+  for (const section of SECTION_KEYS) {
+    // Section-level null in the override = reset-to-platform for the whole
+    // section (spec §4.3 jsonb_strip_nulls semantics). Read-side leniency
+    // only: 076's write validator rejects explicit JSON nulls (jsonb_typeof
+    // 'null' is neither 'object' nor 'string' — verified against the live
+    // 076 function), so such rows can only exist hand-crafted; merge degrades
+    // them to platform instead of throwing.
+    if (over[section] === null) continue
+    const keys = subKeysFor(section)
+    const out: Record<string, unknown> = knownSection(base[section], keys)
+    const b = knownSection(over[section], keys)
+    for (const k of keys) {
+      if (!(k in b)) continue
+      if (b[k] === null) delete out[k]
+      else out[k] = b[k]
+    }
+    if (Object.keys(out).length > 0) merged[section] = out
+  }
+  return merged as ThemeTokens
+}
+
+/** Event-row subset consumed by getResolvedTheme (Task 11 extends the select). */
+export type EventThemeInput = {
+  theme_preset_id?: string | null
+  theme_config?: unknown
+}
+
+function brandSlot(hex: string): BrandSlot {
+  return {
+    light: oklchToString(hexToOklch(hex)),
+    dark: deriveDarkVariant(hex),
+    fgLight: pickForeground(hex),
+    // See DARK_FG comment — direct assignment, never pickForeground(oklch).
+    fgDark: DARK_FG,
+  }
+}
+
+function platformTheme(warnings: string[]): ResolvedTheme {
+  return {
+    primary: PLATFORM_SLOTS.primary,
+    secondary: PLATFORM_SLOTS.secondary,
+    accent: PLATFORM_SLOTS.accent,
+    ring: PLATFORM_SLOTS.ring,
+    background: { light: null, dark: null },
+    foreground: { light: null, dark: null },
+    fonts: { heading: null, body: null },
+    labels: resolveLabels(null),
+    warnings,
+    source: { presetId: null, overriddenKeys: [] },
+  }
+}
+
+/**
+ * Resolve the event theme. Load preset → merge → validate → derive.
+ * Never throws: any failure degrades to the platform theme + warnings.
+ */
+export async function getResolvedTheme(
+  supabase: SupabaseClient,
+  eventRow: EventThemeInput,
+): Promise<ResolvedTheme> {
+  try {
+    return await resolveTheme(supabase, eventRow)
+  } catch (err) {
+    return platformTheme([`theme resolution failed unexpectedly: ${String(err)}`])
+  }
+}
+
+/**
+ * Pure derivation half of the resolver — preset tokens ⊕ override config →
+ * ResolvedTheme, NO database access. Isomorphic: getResolvedTheme wraps it
+ * with the preset load (below); the editor's live preview (Task 13) calls it
+ * directly with client-side draft state. Never throws on malformed input —
+ * garbage degrades to platform defaults with warnings (spec §5.5).
+ */
+export function deriveTheme(
+  presetTokens: ThemeTokens,
+  rawConfig: ThemeTokens | null,
+  presetId: string | null,
+): ResolvedTheme {
+  const warnings: string[] = []
+  const overridden: string[] = []
+
+  // theme_config is hand-craftable JSONB — never trust its shape (Review
+  // Focus #3). Merge runs on allowlisted projections only.
+  let config: ThemeTokens | null = rawConfig
+  if (rawConfig !== null && !isPlainObject(rawConfig)) {
+    warnings.push('theme_config: not an object — ignored')
+    config = null
+  }
+
+  const merged = mergeThemeConfig(presetTokens, config)
+  const colors = merged.colors ?? {}
+
+  // Surviving override leaves — source.overriddenKeys records keys the EVENT
+  // set (post-merge, pre-validation); degraded keys still drop out because
+  // marking only happens when a value actually takes effect below.
+  const overrideLeaves = new Set<string>()
+  if (config !== null) {
+    const over = knownSection(config, SECTION_KEYS)
+    for (const section of SECTION_KEYS) {
+      if (over[section] === null) continue
+      const b = knownSection(over[section], subKeysFor(section))
+      for (const k of subKeysFor(section)) if (k in b && b[k] !== null) overrideLeaves.add(`${section}.${k}`)
+    }
+  }
+  function markOverridden(path: string): void {
+    if (overrideLeaves.has(path)) overridden.push(path)
+  }
+
+  function themedColor(role: 'primary' | 'secondary' | 'accent' | 'ring'): BrandSlot {
+    const raw = colors[role]
+    if (typeof raw !== 'string' || !HEX_RE.test(raw)) {
+      // Absent (or null-dropped) → platform default silently; present but
+      // malformed → platform default + warning.
+      if (raw !== undefined) warnings.push(`colors.${role}: invalid HEX — using platform color`)
+      return PLATFORM_SLOTS[role]
+    }
+    // Contrast precheck (spec §5.5 semantics): primary/secondary/accent
+    // <3:1 vs the platform background degrade to platform (a bypassed
+    // #FFD700-class fill renders nothing readable); ring only warns.
+    // PLATFORM_BG_HEX is color.ts's shared constant — the SAME decision the
+    // validate.ts save-gate applies (Task 7 carried requirement). Dark
+    // variants (L ∈ [0.68, 0.82]) trivially clear 3:1 against the dark
+    // background (oklch(0.07 0 0)), so light-mode is the only side gated.
+    const ratio = contrastRatio(raw, PLATFORM_BG_HEX)
+    if (ratio < 3 && role !== 'ring') {
+      warnings.push(`colors.${role}: contrast ${ratio.toFixed(2)}:1 vs platform background < 3:1 — using platform color`)
+      return PLATFORM_SLOTS[role]
+    }
+    if (ratio < 3) {
+      warnings.push(`colors.ring: contrast ${ratio.toFixed(2)}:1 vs platform background < 3:1 (recommended)`)
+    }
+    markOverridden(`colors.${role}`)
+    return brandSlot(raw)
+  }
+
+  function tint(key: 'background' | 'foreground'): { light: string | null; dark: string | null } {
+    const raw = colors[key]
+    if (typeof raw !== 'string' || !HEX_RE.test(raw)) {
+      if (raw !== undefined) warnings.push(`colors.${key}: invalid HEX — using platform ${key}`)
+      return { light: null, dark: null }
+    }
+    markOverridden(`colors.${key}`)
+    // Dark tint derivation doesn't exist in color.ts (its clamp targets light-
+    // mode brand fills); dark stays platform until background theming ships.
+    return { light: oklchToString(hexToOklch(raw)), dark: null }
+  }
+
+  function font(key: 'heading_font_url' | 'body_font_url'): string | null {
+    const typography = merged.typography ?? {}
+    const raw = typography[key]
+    if (raw === undefined) return null
+    // Spec §5.4 allowlist is enforced in full at save (validate.ts); resolve
+    // applies the https-only floor. Origin + .woff2 narrowing at the
+    // buildFontFace consumer (Task 10).
+    if (typeof raw !== 'string' || !raw.startsWith('https://')) {
+      warnings.push(`typography.${key}: must be an https URL — using platform font`)
+      return null
+    }
+    markOverridden(`typography.${key}`)
+    return raw
+  }
+
+  // Labels: sanitize + fallback via labels.ts (single source of truth).
+  // raw values are safe even unsanitized — labels render as React text
+  // children only — but resolve output is always clean plain strings.
+  const vocab = (merged.vocabulary ?? null) as Record<string, string> | null
+  const labels = resolveLabels(vocab)
+  for (const key of LABEL_KEYS) {
+    if (typeof vocab?.[key] === 'string') markOverridden(`vocabulary.${key}`)
+  }
+
+  return {
+    primary: themedColor('primary'),
+    secondary: themedColor('secondary'),
+    accent: themedColor('accent'),
+    ring: themedColor('ring'),
+    background: tint('background'),
+    foreground: tint('foreground'),
+    fonts: { heading: font('heading_font_url'), body: font('body_font_url') },
+    labels,
+    warnings,
+    source: { presetId, overriddenKeys: overridden },
+  }
+}
+
+async function resolveTheme(supabase: SupabaseClient, eventRow: EventThemeInput): Promise<ResolvedTheme> {
+  const loadWarnings: string[] = []
+
+  const presetId =
+    typeof eventRow.theme_preset_id === 'string' && eventRow.theme_preset_id.length > 0
+      ? eventRow.theme_preset_id
+      : null
+  let presetTokens: ThemeTokens = {}
+  let loadedId: string | null = null
+  if (presetId !== null) {
+    try {
+      const { data, error } = await supabase
+        .from('theme_presets')
+        .select('id, tokens')
+        .eq('id', presetId)
+        .maybeSingle()
+      if (error || !isPlainObject(data)) {
+        loadWarnings.push(`theme preset ${presetId} not found — using platform theme`)
+      } else {
+        loadedId = typeof data.id === 'string' ? data.id : null
+        // data is the DB row { id, tokens } — project the tokens blob through
+        // the same known-keys guard (malformed preset tokens degrade, never throw).
+        presetTokens = mergeThemeConfig(data.tokens as ThemeTokens, null)
+      }
+    } catch (err) {
+      loadWarnings.push(`theme preset ${presetId} lookup failed (${String(err)}) — using platform theme`)
+    }
+  }
+
+  // config shape-guards + warnings live inside deriveTheme; the theme_config
+  // value is handed over raw (garbage → platform + warning, never a throw).
+  const derived = deriveTheme(presetTokens, (eventRow.theme_config ?? null) as ThemeTokens | null, loadedId)
+  return { ...derived, warnings: [...loadWarnings, ...derived.warnings] }
+}
diff --git a/src/lib/theme/types.ts b/src/lib/theme/types.ts
new file mode 100644
index 0000000..e7b2c13
--- /dev/null
+++ b/src/lib/theme/types.ts
@@ -0,0 +1,84 @@
+/**
+ * Event Themes TS contract — spec §4.2 (token JSONB) + §5.1 (ResolvedTheme).
+ *
+ * ResolvedTheme is computed at request time by resolve.ts, never persisted.
+ */
+
+/**
+ §4.2 vocabulary — the six fixed keys (Global Constraints). labels.ts (Task 8)
+ owns the runtime LABEL_KEYS list / sanitization; this is the type-level shape.
+ */
+export type LabelKey =
+  | 'bib_label'
+  | 'checkpoint_label'
+  | 'medal_label'
+  | 'run_label'
+  | 'participant_label'
+  | 'certificate_label'
+
+/**
+ * §4.2 token contract (JSONB, `meta.version: 1`).
+ *
+ * The DB validator (`validate_theme_tokens(tokens, true)`, Task 1) enforces
+ * the strict write-time shape: required `primary`/`secondary`/`accent` HEX,
+ * https-only URLs, 64-char labels, unknown-key rejection. Every field is
+ * optional here because `mergeThemeConfig` must be able to express partial
+ * overrides and null-dropped keys faithfully (null → key removed → platform
+ * default downstream, spec §4.3).
+ */
+export type ThemeTokens = {
+  colors?: {
+    primary?: string
+    secondary?: string
+    accent?: string
+    background?: string
+    foreground?: string
+    ring?: string
+  }
+  typography?: {
+    heading_font_url?: string
+    body_font_url?: string
+  }
+  assets?: {
+    banner_url?: string
+    logo_url?: string
+    badge_icon_url?: string
+    certificate_background_url?: string
+  }
+  vocabulary?: Partial<Record<LabelKey, string>>
+  meta?: { version?: number }
+}
+
+/**
+ * One themed role in both color modes (spec §5.1). All values are opaque
+ * `oklch()` strings: `light` is converted from the validated HEX, `dark` comes
+ * from `deriveDarkVariant` (no inverse OKLCH→HEX exists), `fgLight` from
+ * `pickForeground` on the HEX, `fgDark` assigned directly — see resolve.ts.
+ */
+export type BrandSlot = {
+  light: string
+  dark: string
+  fgLight: string
+  fgDark: string
+}
+
+/**
+ * §5.1 — resolved theme consumed by buildStyleVars (Task 10) and
+ * EventThemeScope (Task 11). Computed, never persisted.
+ */
+export type ResolvedTheme = {
+  primary: BrandSlot
+  secondary: BrandSlot
+  accent: BrandSlot
+  ring: BrandSlot
+  /** Optional override slots; null → platform token for that mode. */
+  background: { light: string | null; dark: string | null }
+  foreground: { light: string | null; dark: string | null }
+  /** Font URLs (https) or null → platform font. */
+  fonts: { heading: string | null; body: string | null }
+  /** Fully resolved — platform defaults filled. */
+  labels: Record<LabelKey, string>
+  /** Structured degradation log — resolve never throws (spec §5.5). */
+  warnings: string[]
+  source: { presetId: string | null; overriddenKeys: string[] }
+}
diff --git a/src/lib/theme/validate.ts b/src/lib/theme/validate.ts
new file mode 100644
index 0000000..cf6df65
--- /dev/null
+++ b/src/lib/theme/validate.ts
@@ -0,0 +1,250 @@
+/**
+ * Theme config validation — spec §5.5.1 (save-time WCAG gate) + client-side
+ * mirror of the 076 DB validator `validate_theme_tokens(tokens, false)`
+ * (non-strict mode — matches the `events.theme_config` CHECK in 077:
+ * `theme_config is null or validate_theme_tokens(theme_config, false)`).
+ *
+ * Division of labor:
+ * - `errors` → the DB would reject the write (`ok: false`); the editor
+ *   hard-blocks and the saveEventTheme action (Task 13) re-checks server-side.
+ * - `warnings` → WCAG warn-and-degrade (§5.5, §13 ④): the write is accepted;
+ *   resolve.ts degrades at render. The ONLY hard block is `primary` <3:1 vs
+ *   the platform background.
+ *
+ * Never throws (spec §5.5.4): unserializable/malformed input surfaces as
+ * structured errors.
+ */
+import { contrastRatio, hexToOklch, PLATFORM_BG_HEX } from './color'
+import { LABEL_KEYS } from './labels'
+
+// Stored-token HEX contract (Global Constraints / spec §4.3: ^#[0-9a-fA-F]{6}$).
+// Same strict regex resolve.ts validates; color.ts's runtime regex is looser
+// (`#` optional) and private.
+const HEX_RE = /^#[0-9a-fA-F]{6}$/
+
+// 64 KB JSON cap (spec §4.3). The DB measures octet_length(jsonb::text) —
+// a few % apart from JSON.stringify's bytes at the exact boundary; the DB
+// stays authoritative on write, this is the UX pre-gate.
+const MAX_JSON_BYTES = 65536
+
+// §5.5.1 tint windows for the optional colors.background slot (oklch L):
+// light [0.93, 0.995] / dark [0.05, 0.12] — else warn + ignore.
+const TINT_L_LIGHT: [number, number] = [0.93, 0.995]
+const TINT_L_DARK: [number, number] = [0.05, 0.12]
+
+export type ThemeValidation = { ok: boolean; errors: string[]; warnings: string[] }
+
+const TOP_KEYS = ['colors', 'typography', 'assets', 'vocabulary', 'meta']
+const COLOR_KEYS = ['primary', 'secondary', 'accent', 'background', 'foreground', 'ring']
+const TYPOGRAPHY_KEYS = ['heading_font_url', 'body_font_url']
+const ASSET_KEYS = ['banner_url', 'logo_url', 'badge_icon_url', 'certificate_background_url']
+const ASSET_PATH_RE = /^[A-Za-z0-9/_.-]+$/
+
+function isPlainObject(v: unknown): v is Record<string, unknown> {
+  return typeof v === 'object' && v !== null && !Array.isArray(v)
+}
+
+/** Serialized byte length, or null when unserializable (cyclic and friends). */
+function jsonBytes(config: unknown): number | null {
+  try {
+    const json = JSON.stringify(config)
+    if (json === undefined) return null
+    return new TextEncoder().encode(json).length
+  } catch {
+    return null
+  }
+}
+
+/** §5.5 WCAG gate — the SAME platform-background decision as resolve.ts's
+ * precheck (color.ts PLATFORM_BG_HEX). Light-mode only: dark variants
+ * (L ∈ [0.68, 0.82]) trivially clear 3:1 against the dark background. */
+function contrastGate(hexes: Record<string, string>, errors: string[], warnings: string[]): void {
+  const primary = hexes.primary
+  if (primary !== undefined) {
+    const ratio = contrastRatio(primary, PLATFORM_BG_HEX)
+    if (ratio < 3) {
+      // The only hard block (spec §5.5, locked §13 ④).
+      errors.push(`colors.primary: contrast ${ratio.toFixed(2)}:1 vs platform background < 3:1 — save blocked`)
+    }
+  }
+  for (const role of ['secondary', 'accent'] as const) {
+    const hex = hexes[role]
+    if (hex === undefined) continue
+    const ratio = contrastRatio(hex, PLATFORM_BG_HEX)
+    if (ratio < 3) {
+      warnings.push(
+        `colors.${role}: contrast ${ratio.toFixed(2)}:1 vs platform background < 3:1 — will degrade to platform color`,
+      )
+    }
+  }
+  const ring = hexes.ring
+  if (ring !== undefined) {
+    const ratio = contrastRatio(ring, PLATFORM_BG_HEX)
+    if (ratio < 3) {
+      warnings.push(`colors.ring: contrast ${ratio.toFixed(2)}:1 vs platform background < 3:1 (recommended)`)
+    }
+  }
+}
+
+/** §5.5.1: the optional background slot is accepted only as a tint — oklch
+ * L ∈ [0.93, 0.995] light / [0.05, 0.12] dark — else warn + ignore. */
+function tintGate(hexes: Record<string, string>, warnings: string[]): void {
+  const background = hexes.background
+  if (background === undefined) return
+  const l = hexToOklch(background).l
+  const inTint =
+    (l >= TINT_L_LIGHT[0] && l <= TINT_L_LIGHT[1]) || (l >= TINT_L_DARK[0] && l <= TINT_L_DARK[1])
+  if (!inTint) {
+    warnings.push(
+      `colors.background: oklch L ${l.toFixed(3)} outside tint windows [0.93, 0.995] light / [0.05, 0.12] dark — will be ignored`,
+    )
+  }
+}
+
+/** 076 asset rule: relative bucket paths ([A-Za-z0-9/_.-]+, no '..') or https
+ * URLs. ':' is off-charset, so javascript:/http: URIs fail the path branch. */
+function assetValueOk(value: string): boolean {
+  if (value.startsWith('https://')) return true
+  return !value.includes('..') && ASSET_PATH_RE.test(value)
+}
+
+/**
+ * Validate an `events.theme_config`-shaped payload. Collects ALL problems
+ * (never first-fail) so the editor can show everything at once. Accepts
+ * partial configs; `null`/`undefined` = "no config" (valid per the 077
+ * CHECK's own `theme_config is null or …` clause).
+ */
+export function validateThemeConfig(config: unknown): ThemeValidation {
+  const errors: string[] = []
+  const warnings: string[] = []
+
+  if (config === null || config === undefined) {
+    return { ok: true, errors, warnings }
+  }
+
+  if (!isPlainObject(config)) {
+    errors.push('theme_config: must be a JSON object')
+    return { ok: false, errors, warnings }
+  }
+
+  const bytes = jsonBytes(config)
+  if (bytes === null) {
+    errors.push('theme_config: not serializable as JSON')
+    return { ok: false, errors, warnings }
+  }
+  if (bytes > MAX_JSON_BYTES) {
+    errors.push(`theme_config: ${(bytes / 1024).toFixed(1)} KB exceeds the 64 KB JSON cap`)
+    return { ok: false, errors, warnings }
+  }
+
+  for (const key of Object.keys(config)) {
+    if (!TOP_KEYS.includes(key)) errors.push(`theme_config.${key}: unknown key — rejected`)
+  }
+
+  // meta: {"version": 1} exactly when present (DB: only 'version' allowed,
+  // value must equal the JSON number 1 — string "1" rejected).
+  const meta = config.meta
+  if (meta !== undefined) {
+    if (!isPlainObject(meta)) {
+      errors.push('meta: must be an object {"version": 1}')
+    } else {
+      for (const key of Object.keys(meta)) {
+        if (key !== 'version') errors.push(`meta.${key}: unknown key — only "version" is allowed`)
+      }
+      const v = meta.version
+      if (typeof v !== 'number' || !Number.isInteger(v) || v !== 1) {
+        errors.push('meta.version: must be the JSON number 1')
+      }
+    }
+  }
+
+  // colors: known keys + HEX contract, then the §5.5 WCAG gate.
+  const colors = config.colors
+  if (colors !== undefined) {
+    if (!isPlainObject(colors)) {
+      errors.push('colors: must be an object of HEX strings')
+    } else {
+      for (const key of Object.keys(colors)) {
+        if (!COLOR_KEYS.includes(key)) errors.push(`colors.${key}: unknown key — rejected`)
+      }
+      const hexes: Record<string, string> = {}
+      for (const key of COLOR_KEYS) {
+        const raw = colors[key]
+        if (raw === undefined) continue
+        // JSON null at leaf level fails the DB's jsonb_typeof check ('null' is
+        // not a string) — mirror it (076 rejects ALL explicit JSON nulls).
+        if (typeof raw !== 'string' || !HEX_RE.test(raw)) {
+          errors.push(`colors.${key}: must be a HEX string matching ^#[0-9a-fA-F]{6}$`)
+          continue
+        }
+        hexes[key] = raw
+      }
+      contrastGate(hexes, errors, warnings)
+      tintGate(hexes, warnings)
+    }
+  }
+
+  // typography: known keys, https-only floor (origin/.woff2 allowlist lands
+  // at the buildFontFace consumer, Task 10 — DB enforces the floor only).
+  const typography = config.typography
+  if (typography !== undefined) {
+    if (!isPlainObject(typography)) {
+      errors.push('typography: must be an object of https URLs')
+    } else {
+      for (const key of Object.keys(typography)) {
+        if (!TYPOGRAPHY_KEYS.includes(key)) errors.push(`typography.${key}: unknown key — rejected`)
+      }
+      for (const key of TYPOGRAPHY_KEYS) {
+        const raw = typography[key]
+        if (raw === undefined) continue
+        if (typeof raw !== 'string' || !raw.startsWith('https://')) {
+          errors.push(`typography.${key}: must be an https:// URL`)
+        }
+      }
+    }
+  }
+
+  // assets: bucket paths or https URLs (076 charset/traversal rules).
+  const assets = config.assets
+  if (assets !== undefined) {
+    if (!isPlainObject(assets)) {
+      errors.push('assets: must be an object of bucket paths or https URLs')
+    } else {
+      for (const key of Object.keys(assets)) {
+        if (!ASSET_KEYS.includes(key)) errors.push(`assets.${key}: unknown key — rejected`)
+      }
+      for (const key of ASSET_KEYS) {
+        const raw = assets[key]
+        if (raw === undefined) continue
+        if (typeof raw !== 'string' || !assetValueOk(raw)) {
+          errors.push(
+            `assets.${key}: must be a bucket path ([A-Za-z0-9/_.-], no '..') or an https:// URL`,
+          )
+        }
+      }
+    }
+  }
+
+  // vocabulary: fixed 6-key whitelist (labels.ts owns the list), 64-char DB
+  // cap (the UI enforces 40 for UX; DB is authoritative).
+  const vocabulary = config.vocabulary
+  if (vocabulary !== undefined) {
+    if (!isPlainObject(vocabulary)) {
+      errors.push('vocabulary: must be an object of label strings')
+    } else {
+      const allowed = LABEL_KEYS as readonly string[]
+      for (const key of Object.keys(vocabulary)) {
+        if (!allowed.includes(key)) errors.push(`vocabulary.${key}: unknown key — rejected`)
+      }
+      for (const key of LABEL_KEYS) {
+        const raw = vocabulary[key]
+        if (raw === undefined) continue
+        if (typeof raw !== 'string' || raw.length > 64) {
+          errors.push(`vocabulary.${key}: must be a string of at most 64 characters`)
+        }
+      }
+    }
+  }
+
+  return { ok: errors.length === 0, errors, warnings }
+}
diff --git a/supabase/migrations/039_add_gender_to_leaderboard.sql b/supabase/migrations/039_add_gender_to_leaderboard.sql
index 80d5b1c..c83fe60 100644
--- a/supabase/migrations/039_add_gender_to_leaderboard.sql
+++ b/supabase/migrations/039_add_gender_to_leaderboard.sql
@@ -1,11 +1,16 @@
 -- Recreate leaderboard_virtual with gender column from runner_profiles
+-- NOTE: gender is inserted before event_id here, which create-or-replace
+-- cannot do (a view's existing column names are immutable; only end-appends
+-- are allowed — SQLSTATE 42P16 on fresh replay). Drop first so the final
+-- shape matches the cloud schema exactly.
+drop view leaderboard_virtual;
 create or replace view leaderboard_virtual as
 select
     rp.full_name,
     rp.id as runner_id,
     rp.gender,
     r.event_id,
     sum(rl.distance_km) as total_km,
     rank() over (partition by r.event_id order by sum(rl.distance_km) desc) as rank
 from run_logs rl
 join runner_profiles rp on rp.id = rl.runner_id
diff --git a/supabase/migrations/062_payment_double_charge_and_refund_hardening.sql b/supabase/migrations/0625_payment_double_charge_and_refund_hardening.sql
similarity index 100%
rename from supabase/migrations/062_payment_double_charge_and_refund_hardening.sql
rename to supabase/migrations/0625_payment_double_charge_and_refund_hardening.sql
diff --git a/supabase/migrations/063_payment_claim_in_progress.sql b/supabase/migrations/0635_payment_claim_in_progress.sql
similarity index 100%
rename from supabase/migrations/063_payment_claim_in_progress.sql
rename to supabase/migrations/0635_payment_claim_in_progress.sql
diff --git a/supabase/migrations/076_theme_presets.sql b/supabase/migrations/076_theme_presets.sql
new file mode 100644
index 0000000..a231a0c
--- /dev/null
+++ b/supabase/migrations/076_theme_presets.sql
@@ -0,0 +1,266 @@
+-- ── THEME PRESETS (Event Themes P1 — spec docs/event-themes-design.md §4.1, §4.3) ──
+-- theme_presets: platform-seeded 'system' presets + per-organizer custom presets.
+-- validate_theme_tokens(jsonb, p_strict): single validation choke-point, wired into
+-- the theme_presets.tokens CHECK (p_strict = true). Migration 077 reuses it with
+-- p_strict = false for all-optional events.theme_config overrides.
+-- Enforces (spec §4.3): 64 KB JSON cap, object shape, unknown-key rejection at
+-- every level, HEX ^#[0-9a-fA-F]{6}$, https-only font URLs, bucket-path-or-https
+-- assets with '..' + charset [A-Za-z0-9/_.-] rejection, 6-key vocabulary
+-- whitelist with 64-char DB cap (UI enforces 40), meta {"version": 1} exactly
+-- (required in p_strict mode). No seeds here — 079 owns the 6 system presets.
+-- Up: create function first (the table CHECK references it), then table,
+-- index, RLS policies, grants.
+
+-- ══ up ════════════════════════════════════════════════════════════════
+
+create or replace function public.validate_theme_tokens(tokens jsonb, p_strict boolean)
+returns boolean
+language plpgsql
+immutable
+set search_path = ''
+as $$
+declare
+  v_meta    jsonb;
+  v_section jsonb;
+  v_key     text;
+  v_val     jsonb;
+  v_text    text;
+
+  c_top_keys   text[] := array['colors', 'typography', 'assets', 'vocabulary', 'meta'];
+  c_color_keys text[] := array['primary', 'secondary', 'accent', 'background', 'foreground', 'ring'];
+  c_typo_keys  text[] := array['heading_font_url', 'body_font_url'];
+  c_asset_keys text[] := array['banner_url', 'logo_url', 'badge_icon_url', 'certificate_background_url'];
+  c_vocab_keys text[] := array['bib_label', 'checkpoint_label', 'medal_label', 'run_label',
+                                 'participant_label', 'certificate_label'];
+  c_hex        text   := '^#[0-9a-fA-F]{6}$';
+begin
+  p_strict := coalesce(p_strict, false);
+
+  -- 64 KB JSON cap
+  if octet_length(tokens::text) > 65536 then
+    return false;
+  end if;
+
+  -- must be a JSON object
+  if jsonb_typeof(tokens) <> 'object' then
+    return false;
+  end if;
+
+  -- unknown top-level keys rejected
+  if exists (
+    select 1 from jsonb_object_keys(tokens) as k(key)
+    where not (k.key = any (c_top_keys))
+  ) then
+    return false;
+  end if;
+
+  -- meta: {"version": 1} exactly — extra keys rejected; version must be the
+  -- JSON number 1 (string "1" or other versions rejected). Required in p_strict
+  -- mode; optional but validated in partial (non-p_strict) mode.
+  v_meta := tokens -> 'meta';
+  if v_meta is not null then
+    if jsonb_typeof(v_meta) <> 'object' then
+      return false;
+    end if;
+    if exists (
+      select 1 from jsonb_object_keys(v_meta) as k(key) where k.key <> 'version'
+    ) then
+      return false;
+    end if;
+    if v_meta -> 'version' is null or (v_meta -> 'version') <> '1'::jsonb then
+      return false;
+    end if;
+  elsif p_strict then
+    return false;
+  end if;
+
+  -- colors: known keys only, every value a HEX string.
+  -- p_strict mode: section required; primary/secondary/accent required (§4.2).
+  v_section := tokens -> 'colors';
+  if v_section is not null then
+    if jsonb_typeof(v_section) <> 'object' then
+      return false;
+    end if;
+    if exists (
+      select 1 from jsonb_object_keys(v_section) as k(key)
+      where not (k.key = any (c_color_keys))
+    ) then
+      return false;
+    end if;
+    for v_key, v_val in
+      select e.k, e.v from jsonb_each(v_section) as e(k, v)
+    loop
+      if jsonb_typeof(v_val) <> 'string' then
+        return false;
+      end if;
+      if v_val #>> '{}' !~ c_hex then
+        return false;
+      end if;
+    end loop;
+    if p_strict
+       and not (v_section ? 'primary' and v_section ? 'secondary' and v_section ? 'accent') then
+      return false;
+    end if;
+  elsif p_strict then
+    return false;
+  end if;
+
+  -- typography: known keys only, https-only URLs (spec §4.3; origin/woff2
+  -- allowlist is enforced at save + resolve in src/lib/theme, where the
+  -- platform storage origin is known)
+  v_section := tokens -> 'typography';
+  if v_section is not null then
+    if jsonb_typeof(v_section) <> 'object' then
+      return false;
+    end if;
+    if exists (
+      select 1 from jsonb_object_keys(v_section) as k(key)
+      where not (k.key = any (c_typo_keys))
+    ) then
+      return false;
+    end if;
+    for v_key, v_val in
+      select e.k, e.v from jsonb_each(v_section) as e(k, v)
+    loop
+      if jsonb_typeof(v_val) <> 'string' then
+        return false;
+      end if;
+      if (v_val #>> '{}') !~ '^https://' then
+        return false;
+      end if;
+    end loop;
+  end if;
+
+  -- assets: relative bucket paths (charset [A-Za-z0-9/_.-], no '..') or
+  -- https URLs (spec §4.2 "bucket paths or https URLs"). ':' is off-charset,
+  -- so http:// or javascript: URIs in these fields are rejected.
+  v_section := tokens -> 'assets';
+  if v_section is not null then
+    if jsonb_typeof(v_section) <> 'object' then
+      return false;
+    end if;
+    if exists (
+      select 1 from jsonb_object_keys(v_section) as k(key)
+      where not (k.key = any (c_asset_keys))
+    ) then
+      return false;
+    end if;
+    for v_key, v_val in
+      select e.k, e.v from jsonb_each(v_section) as e(k, v)
+    loop
+      if jsonb_typeof(v_val) <> 'string' then
+        return false;
+      end if;
+      v_text := v_val #>> '{}';
+      if v_text like 'https://%' then
+        continue;
+      end if;
+      if v_text ~ '\.\.' or v_text !~ '^[A-Za-z0-9/_.-]+$' then
+        return false;
+      end if;
+    end loop;
+  end if;
+
+  -- vocabulary: fixed 6-key whitelist, 64-char DB cap (spec §4.3 / Global
+  -- Constraints; UI enforces 40 for UX)
+  v_section := tokens -> 'vocabulary';
+  if v_section is not null then
+    if jsonb_typeof(v_section) <> 'object' then
+      return false;
+    end if;
+    if exists (
+      select 1 from jsonb_object_keys(v_section) as k(key)
+      where not (k.key = any (c_vocab_keys))
+    ) then
+      return false;
+    end if;
+    for v_key, v_val in
+      select e.k, e.v from jsonb_each(v_section) as e(k, v)
+    loop
+      if jsonb_typeof(v_val) <> 'string' then
+        return false;
+      end if;
+      if char_length(v_val #>> '{}') > 64 then
+        return false;
+      end if;
+    end loop;
+  end if;
+
+  return true;
+end;
+$$;
+
+create table public.theme_presets (
+  id           uuid primary key default gen_random_uuid(),
+  slug         text not null unique,
+  name         text not null,
+  description  text,
+  kind         text not null default 'system'
+               check (kind in ('system', 'organizer')),
+  organizer_id uuid references public.organizers (id) on delete cascade,
+  tokens       jsonb not null
+               constraint theme_presets_tokens_valid
+               check (public.validate_theme_tokens(tokens, true)),
+  is_active    boolean not null default true,
+  created_at   timestamptz not null default now(),
+  updated_at   timestamptz not null default now(),
+
+  -- NULL ⇔ system (spec §4.1): system presets are platform-owned (tenancy +
+  -- anti-spoofing); organizer presets must point at their tenant
+  constraint theme_presets_kind_organizer_match
+    check (
+      (kind = 'system' and organizer_id is null)
+      or (kind = 'organizer' and organizer_id is not null)
+    )
+);
+
+create index theme_presets_organizer_id_idx on public.theme_presets (organizer_id);
+
+-- ── RLS ───────────────────────────────────────────────────────────────
+-- System presets are public display config (readable by anon). Organizer
+-- presets are tenant-scoped via JWT app_metadata.organizer_id — organizer A
+-- cannot read or attach organizer B's custom preset (spec §12.4). The
+-- insert/update WITH CHECK also blocks kind='system' spoofing (organizer_id
+-- IS NULL can never equal get_my_organizer_id()). service_role bypasses RLS
+-- for seeding (079) and the cert pipeline.
+
+alter table public.theme_presets enable row level security;
+
+create policy "theme presets system public read"
+  on public.theme_presets for select
+  to anon, authenticated
+  using (kind = 'system');
+
+create policy "theme presets organizer read own"
+  on public.theme_presets for select
+  to authenticated
+  using (organizer_id = get_my_organizer_id());
+
+create policy "theme presets organizer insert own"
+  on public.theme_presets for insert
+  to authenticated
+  with check (kind = 'organizer' and organizer_id = get_my_organizer_id());
+
+create policy "theme presets organizer update own"
+  on public.theme_presets for update
+  to authenticated
+  using (kind = 'organizer' and organizer_id = get_my_organizer_id())
+  with check (kind = 'organizer' and organizer_id = get_my_organizer_id());
+
+create policy "theme presets organizer delete own"
+  on public.theme_presets for delete
+  to authenticated
+  using (kind = 'organizer' and organizer_id = get_my_organizer_id());
+
+create policy "theme presets admin manage"
+  on public.theme_presets for all
+  to authenticated
+  using (is_admin())
+  with check (is_admin());
+
+grant select on public.theme_presets to anon, authenticated;
+grant insert, update, delete on public.theme_presets to authenticated;
+
+-- ══ down ══════════════════════════════════════════════════════════════
+-- drop table public.theme_presets;  -- drops constraints, index, policies
+-- drop function public.validate_theme_tokens(jsonb, boolean);
diff --git a/supabase/migrations/077_events_theme_slug.sql b/supabase/migrations/077_events_theme_slug.sql
new file mode 100644
index 0000000..d8d276b
--- /dev/null
+++ b/supabase/migrations/077_events_theme_slug.sql
@@ -0,0 +1,214 @@
+-- ── EVENTS THEME COLUMNS + SLUG (Event Themes P1 — spec docs/event-themes-design.md §4.1, §4.3) ──
+-- Adds to events:
+--   theme_preset_id  uuid FK → theme_presets ON DELETE SET NULL (076's table),
+--                    guarded by trigger events_validate_theme_refs: the referenced
+--                    preset must be kind='system' OR owned by events.organizer_id
+--                    (anti-IDOR — the plain FK alone would accept ANY preset id).
+--   theme_config     jsonb NULL — partial-shape override validated by
+--                    validate_theme_tokens(config, false) (non-strict: all-optional).
+--   slug             text UNIQUE — kebab-case of the event name capped so that
+--                    kebab + '-' + 8-hex md5(id) suffix is always ≤ 64 chars total;
+--                    backfilled for ALL existing events; drafts may be NULL,
+--                    published/closed events are auto-slugged by trigger
+--                    events_published_needs_slug (spec names it for published;
+--                    §12.3 makes 'closed' publicly visible too, so it is covered).
+-- Trusted writers (postgres / service_role — Django, BFF saveEventTheme after its
+-- own ownership verification) bypass the ref-validation trigger, mirroring the 070
+-- guard pattern; RLS continues to apply to them as normal.
+-- Up: helper function → columns → backfill → unique constraint → trigger
+-- functions → triggers. Backfill runs BEFORE the triggers are created so the
+-- mass UPDATE does not re-enter them.
+
+-- ══ up ════════════════════════════════════════════════════════════════
+
+-- 1. Shared slug-base derivation (used by the backfill below AND by the
+--    auto-slug trigger, so both stay in lockstep). Kebab-case of the name:
+--    lowercase, collapse non-[a-z0-9] runs to '-', trim leading/trailing
+--    dashes, fall back to 'event' when nothing survives. Capped at 55 so
+--    base + '-' + 8-hex suffix ≤ 64 (the slug's total DB cap).
+create or replace function public.event_slug_base(p_name text)
+returns text
+language sql
+immutable
+set search_path = ''
+as $$
+  select left(
+           coalesce(
+             nullif(
+               trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g')),
+               ''
+             ),
+             'event'
+           ),
+           55
+         )
+$$;
+
+-- 2. Columns — one ALTER (single lock pass). theme_config CHECK calls the 076
+--    validator POSITIONALLY (p_strict = false → all-optional partial shape);
+--    SQL NULL stays legal (no theme), JSON null is not an object → rejected.
+alter table public.events
+  add column theme_preset_id uuid
+    references public.theme_presets (id) on delete set null,
+  add column theme_config jsonb
+    constraint events_theme_config_valid
+    check (theme_config is null or public.validate_theme_tokens(theme_config, false)),
+  add column slug text
+    constraint events_slug_format
+    check (
+      slug is null
+      or (
+        char_length(slug) <= 64
+        and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*-[0-9a-f]{8}$'
+      )
+    );
+
+-- FK support index: preset deletes (ON DELETE SET NULL) and theme joins.
+create index events_theme_preset_id_idx on public.events (theme_preset_id);
+
+-- 3. Backfill for ALL existing events: kebab(name) + substr(md5(id::text),1,8).
+--    Dedupe-safe: distinct ids → distinct md5 digests, so would-be slugs
+--    collide only on an 8-hex prefix coincidence (~1 in 4·10⁹ per pair).
+--    Should that ever happen, the 8-hex window slides through the 32-char
+--    digest (25 windows) by collision rank — format preserved, still
+--    deterministic. The UNIQUE constraint added next is the loud backstop.
+with derived as (
+  select id, md5(id::text) as digest, public.event_slug_base(name) as base
+  from public.events
+),
+ranked as (
+  select
+    id,
+    base,
+    digest,
+    -- row_number() is bigint; substr needs int
+    (row_number() over (
+       partition by base, substr(digest, 1, 8)
+       order by id
+     ))::int as rn
+  from derived
+)
+update public.events e
+set slug = ranked.base || '-'
+           || substr(ranked.digest, 1 + ((ranked.rn - 1) % 25), 8)
+from ranked
+where e.id = ranked.id;
+
+alter table public.events
+  add constraint events_slug_key unique (slug);
+
+-- 4. Trigger: anti-IDOR preset reference validation (spec §4.3
+--    events_validate_theme_refs). SECURITY INVOKER on purpose: under the
+--    caller's own RLS view of theme_presets, a preset hidden from the caller
+--    is NOT FOUND → rejected below, closing the FK-bypass (an organizer
+--    probing another tenant's preset id can never pass this trigger).
+create or replace function public.validate_event_theme_refs()
+returns trigger
+language plpgsql
+security invoker
+set search_path = ''
+as $$
+declare
+  v_kind       text;
+  v_preset_org uuid;
+begin
+  -- Trusted writers (postgres, service_role): ownership is verified app-side
+  -- (saveEventTheme) or out-of-band (Django) — 070 guard precedent.
+  if current_user in ('postgres', 'service_role')
+     or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' then
+    return coalesce(new, old);
+  end if;
+
+  if new.theme_preset_id is null then
+    return new;
+  end if;
+
+  select p.kind, p.organizer_id
+    into v_kind, v_preset_org
+    from public.theme_presets p
+   where p.id = new.theme_preset_id;
+
+  -- NOT FOUND also covers RLS-hidden presets — raise rather than defer to
+  -- the FK, which cannot see RLS and would accept the reference.
+  if not found then
+    raise exception
+      'events_validate_theme_refs: theme_preset_id % not found or not permitted',
+      new.theme_preset_id
+      using errcode = 'foreign_key_violation';
+  end if;
+
+  -- Anti-IDOR: preset must be system OR owned by the event's organizer.
+  if v_kind <> 'system'
+     and v_preset_org is distinct from new.organizer_id then
+    raise exception
+      'events_validate_theme_refs: preset % is not a system preset and is not owned by the event organizer',
+      new.theme_preset_id
+      using errcode = 'check_violation';
+  end if;
+
+  return new;
+end;
+$$;
+
+create trigger events_validate_theme_refs
+  before insert or update of theme_preset_id, organizer_id
+  on public.events
+  for each row
+  execute function public.validate_event_theme_refs();
+
+-- 5. Trigger: published (and closed, §12.3 public visibility) events must
+--    carry a slug — auto-derive on INSERT or draft→published/closed
+--    transition when the caller left it NULL.
+create or replace function public.enforce_published_slug()
+returns trigger
+language plpgsql
+security invoker
+set search_path = ''
+as $$
+declare
+  v_candidate text;
+  v_taken     boolean;
+  v_i         int;
+begin
+  if new.slug is not null
+     or (new.status <> 'published' and new.status <> 'closed') then
+    return new;
+  end if;
+
+  -- Same derivation as the 077 backfill (kebab + 8-hex md5(id) window);
+  -- first non-taken window wins. The UNIQUE constraint remains the final
+  -- arbiter under concurrency — worst case the last candidate raises 23505.
+  for v_i in 0 .. 24 loop
+    v_candidate := public.event_slug_base(new.name)
+                   || '-' || substr(md5(new.id::text), 1 + v_i, 8);
+    v_taken := null;
+    select true
+      into v_taken
+      from public.events e
+     where e.slug = v_candidate;
+    exit when v_taken is null;
+  end loop;
+
+  new.slug := v_candidate;
+  return new;
+end;
+$$;
+
+create trigger events_published_needs_slug
+  before insert or update of slug, status, name
+  on public.events
+  for each row
+  execute function public.enforce_published_slug();
+
+-- ══ down ══════════════════════════════════════════════════════════════
+-- drop trigger if exists events_published_needs_slug on public.events;
+-- drop function public.enforce_published_slug();
+-- drop trigger if exists events_validate_theme_refs on public.events;
+-- drop function public.validate_event_theme_refs();
+-- alter table public.events
+--   drop constraint if exists events_slug_key,
+--   drop constraint if exists events_slug_format,
+--   drop column if exists slug,
+--   drop column if exists theme_config,
+--   drop column if exists theme_preset_id;
+-- drop function public.event_slug_base(text);
diff --git a/supabase/migrations/078_theme_rpc.sql b/supabase/migrations/078_theme_rpc.sql
new file mode 100644
index 0000000..aa6f3d2
--- /dev/null
+++ b/supabase/migrations/078_theme_rpc.sql
@@ -0,0 +1,148 @@
+-- ── THEME RESOLUTION RPC (Event Themes P1 — spec docs/event-themes-design.md §4.3, §9) ──
+-- jsonb_deep_merge(a, b): IMMUTABLE deep merge — b (the event's theme_config)
+-- wins; a JSON null in the override REMOVES that key from the result at any
+-- depth (jsonb_strip_nulls semantics → the platform default survives at
+-- render); preset-side nulls are stripped identically. Two objects merge
+-- key-by-key recursively; scalar/array overrides replace wholesale.
+-- get_event_theme(event_id): single canonical resolution point (spec §4.3) —
+--   preset.tokens ⊕ events.theme_config. SECURITY DEFINER so public pages (and
+--   later the Django cert pipeline via service_role) can resolve a theme
+--   without reading the events row. Visibility (spec §12.3): published/closed
+--   → everyone; draft → owning organizer, platform admin, or service_role
+--   only. Denial returns NULL — indistinguishable from "no theme", so the RPC
+--   never leaks draft existence.
+-- SECURITY DEFINER note: current_user switches to the function owner inside
+-- the call, so the caller is identified via JWT claims only — 077's
+-- current_user-based trusted-writer bypass does NOT transfer here (that
+-- trigger is security invoker). Helpers get_my_organizer_id() / is_admin()
+-- are referenced schema-qualified, which is valid under the pinned empty
+-- search_path; their bodies only touch the schema-qualified auth.jwt().
+-- No is_active filter: spec §4.3 defines resolution purely as tokens ⊕ config.
+-- Up: merge function → RPC → revoke from public → explicit grants.
+
+-- ══ up ════════════════════════════════════════════════════════════════
+
+create or replace function public.jsonb_deep_merge(a jsonb, b jsonb)
+returns jsonb
+language plpgsql
+immutable
+set search_path = ''
+as $$
+declare
+  v_base  jsonb := jsonb_strip_nulls(a);  -- a-side nulls mean "no value"
+  v_patch jsonb := b;
+  v_key   text;
+  v_val   jsonb;
+begin
+  if v_base is null and v_patch is null then
+    return null;                          -- no preset, no config → no theme
+  end if;
+
+  if v_base is null then
+    v_base := '{}'::jsonb;                -- merge the override onto nothing
+  end if;
+  if v_patch is null then
+    return v_base;                        -- no override → preset as-is
+  end if;
+
+  -- Only an object override merges key-by-key; scalar/array override replaces
+  -- the whole document (event wins).
+  if jsonb_typeof(v_patch) <> 'object' then
+    return v_patch;
+  end if;
+  if jsonb_typeof(v_base) <> 'object' then
+    v_base := '{}'::jsonb;
+  end if;
+
+  for v_key, v_val in
+    select e.key, e.value from jsonb_each(v_patch) as e(key, value)
+  loop
+    if jsonb_typeof(v_val) = 'null' then
+      -- jsonb_strip_nulls semantics (spec §4.3): a null OVERRIDE removes the
+      -- key from the result → the platform default survives at render.
+      -- Applies at any depth via the recursion below.
+      v_base := v_base - v_key;
+    elsif jsonb_typeof(v_val) = 'object'
+          and jsonb_typeof(v_base -> v_key) = 'object' then
+      -- both sides hold objects → recurse (deep, not shallow). Absent base
+      -- key yields SQL NULL → typeof NULL ≠ 'object' → falls to the else arm
+      -- and the object is set as-is.
+      v_base := jsonb_set(v_base, array[v_key],
+                          public.jsonb_deep_merge(v_base -> v_key, v_val));
+    else
+      v_base := jsonb_set(v_base, array[v_key], v_val);
+    end if;
+  end loop;
+
+  return v_base;
+end;
+$$;
+
+create or replace function public.get_event_theme(event_id uuid)
+returns jsonb
+language plpgsql
+stable
+security definer
+set search_path = ''
+as $$
+declare
+  v_status       text;
+  v_organizer_id uuid;
+  v_tokens       jsonb;
+  v_config       jsonb;
+  v_caller_org   uuid;
+begin
+  select e.status, e.organizer_id, e.theme_config, p.tokens
+    into v_status, v_organizer_id, v_config, v_tokens
+    from public.events e
+    left join public.theme_presets p on p.id = e.theme_preset_id
+   where e.id = event_id;
+
+  if not found then
+    return null;                          -- unknown event → no theme
+  end if;
+
+  -- Visibility gate (spec §4.3 / §12.3): published and closed events are
+  -- public; drafts resolve only for the owning organizer, a platform admin,
+  -- or service_role (service_role detected via its JWT claim — see the
+  -- SECURITY DEFINER note in the header).
+  -- NULL discipline (Task 14 hardening): both columns are nullable, so the
+  -- comparisons use IS DISTINCT FROM / explicit NULL arms — a plain
+  -- `v_status <> 'published'` or `v_caller_org <> v_organizer_id` yields
+  -- NULL (→ gate skipped → theme RESOLVED) for a NULL-status or
+  -- NULL-organizer event. Distinct-from treats NULL as "not public", so
+  -- degenerate rows deny by default, exactly like a draft.
+  if v_status is distinct from 'published' and v_status is distinct from 'closed' then
+    v_caller_org := public.get_my_organizer_id();
+    if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
+       and not coalesce(public.is_admin(), false)
+       and (v_organizer_id is null or v_caller_org is null
+            or v_caller_org <> v_organizer_id) then
+      return null;
+    end if;
+  end if;
+
+  return public.jsonb_deep_merge(v_tokens, v_config);
+end;
+$$;
+
+-- Execute privilege: a fresh function is executable by PUBLIC by default —
+-- revoke first, then grant explicitly to the three PostgREST roles (spec §9
+-- "RPC escalation" mitigation: read-only, pinned search_path, explicit
+-- grants after revoke).
+revoke all on function public.get_event_theme(uuid) from public;
+
+grant execute on function public.get_event_theme(uuid)
+  to anon, authenticated, service_role;
+
+-- jsonb_deep_merge is a pure helper, kept OUT of the public API surface:
+-- Supabase default privileges grant EXECUTE on new functions to the API roles
+-- (verified in §4 of the verification output), so it is revoked explicitly.
+revoke all on function public.jsonb_deep_merge(jsonb, jsonb)
+  from public, anon, authenticated, service_role;
+
+-- ══ down ══════════════════════════════════════════════════════════════
+-- revoke all on function public.get_event_theme(uuid) from anon, authenticated, service_role;
+-- revoke all on function public.jsonb_deep_merge(jsonb, jsonb) from public, anon, authenticated, service_role;
+-- drop function public.get_event_theme(uuid);
+-- drop function public.jsonb_deep_merge(jsonb, jsonb);
diff --git a/supabase/migrations/079_seed_theme_presets.sql b/supabase/migrations/079_seed_theme_presets.sql
new file mode 100644
index 0000000..96b47c6
--- /dev/null
+++ b/supabase/migrations/079_seed_theme_presets.sql
@@ -0,0 +1,172 @@
+-- ── SEED 6 SYSTEM THEME PRESETS (Event Themes P1 — spec §4.6, §13 sign-off ③) ──
+-- Roster with FIXED uuids, committed as literals (events.theme_preset_id FK from
+-- 077 targets these — NEVER regenerate): Pelikat Classic, Wizard Academy,
+-- Hidden Village, Galaxy Runner, Sunset Marathon, Batik Heritage.
+-- Every row: kind='system' + organizer_id IS NULL (076 NULL⇔system constraint);
+-- tokens pass the strict theme_presets_tokens CHECK (validate_theme_tokens
+-- (tokens, true) — colors.primary/secondary/accent HEX required, meta {"version": 1}).
+-- Colors: Batik Heritage verbatim from §4.6. The other five finalize §4.6's
+-- indicative roles at seed time (§4.6 header: "final at seed time"); primaries
+-- ≥3:1 vs platform background per the §5.5 gate philosophy; Pelikat Classic
+-- reuses the platform brand primary oklch(0.51 0.16 190) → #00807A. Roster names
+-- are generic archetypes (§4.6/§10.1: no franchise themes shipped).
+-- typography/assets sections intentionally OMITTED: the §4.2 contract has no
+-- font-family key (heading_font_url/body_font_url are https URLs only) and
+-- asset paths/fonts are P2 scope (plan Roadmap); §4.6 family names (e.g. Batik
+-- "Prata"/"Inter") are indicative prose with no v1 token representation —
+-- revisit at the P2 gate.
+-- Up: one explicit row per preset; on conflict (slug) do nothing keeps the seed
+-- idempotent. Down: delete the six rows by their fixed uuids (077's
+-- ON DELETE SET NULL on events.theme_preset_id keeps referencing events intact).
+
+-- ══ up ════════════════════════════════════════════════════════════════
+
+insert into public.theme_presets (id, slug, name, description, kind, organizer_id, tokens)
+values
+  -- 1. Pelikat Classic — platform look: brand teal + race-day red (§4.6.1)
+  (
+    'b7d4dfdd-0c4d-4427-b561-b989f370008d',
+    'pelikat-classic',
+    'Pelikat Classic',
+    'Pelikat platform look — brand teal with race-day red accents.',
+    'system',
+    null,
+    '{
+      "colors": {
+        "primary": "#00807A",
+        "secondary": "#115E59",
+        "accent": "#C62A2F",
+        "ring": "#00807A"
+      },
+      "meta": {"version": 1}
+    }'::jsonb
+  ),
+
+  -- 2. Wizard Academy — midnight purple + antique gold (§4.6.2)
+  (
+    'e2c9ba7d-4751-4101-a2e8-b27c86c61a1b',
+    'wizard-academy',
+    'Wizard Academy',
+    'Midnight purple and antique gold — a school-of-magic run day.',
+    'system',
+    null,
+    '{
+      "colors": {
+        "primary": "#4C1D95",
+        "secondary": "#5B21B6",
+        "accent": "#A16207",
+        "ring": "#4C1D95"
+      },
+      "vocabulary": {
+        "bib_label": "Spell Number",
+        "medal_label": "House Crest",
+        "certificate_label": "Diploma of Magic"
+      },
+      "meta": {"version": 1}
+    }'::jsonb
+  ),
+
+  -- 3. Hidden Village — forest greens + moss (§4.6.3)
+  (
+    '04b5923b-d10d-49fe-ad74-7c5705f92179',
+    'hidden-village',
+    'Hidden Village',
+    'Forest greens and moss — a hidden woodland village trail.',
+    'system',
+    null,
+    '{
+      "colors": {
+        "primary": "#166534",
+        "secondary": "#365314",
+        "accent": "#4D7C0F",
+        "ring": "#166534"
+      },
+      "vocabulary": {
+        "checkpoint_label": "Waypoint",
+        "run_label": "Trail"
+      },
+      "meta": {"version": 1}
+    }'::jsonb
+  ),
+
+  -- 4. Galaxy Runner — deep-space navy + neon cyan (§4.6.4)
+  (
+    'bd39de2a-0ff0-455e-bb27-047bca7b8194',
+    'galaxy-runner',
+    'Galaxy Runner',
+    'Deep-space navy with neon cyan — an interstellar run.',
+    'system',
+    null,
+    '{
+      "colors": {
+        "primary": "#1E1B4B",
+        "secondary": "#312E81",
+        "accent": "#0891B2",
+        "ring": "#1E1B4B"
+      },
+      "vocabulary": {
+        "bib_label": "Crew ID",
+        "medal_label": "Star Shard"
+      },
+      "meta": {"version": 1}
+    }'::jsonb
+  ),
+
+  -- 5. Sunset Marathon — dusk orange → pink (§4.6.5)
+  (
+    'e4fb2e41-ad2c-4e1f-a8a9-cf334acd72ca',
+    'sunset-marathon',
+    'Sunset Marathon',
+    'Dusk orange fading to pink — a sunset finish line.',
+    'system',
+    null,
+    '{
+      "colors": {
+        "primary": "#C2410C",
+        "secondary": "#9A3412",
+        "accent": "#BE185D",
+        "ring": "#C2410C"
+      },
+      "meta": {"version": 1}
+    }'::jsonb
+  ),
+
+  -- 6. Batik Heritage — Malaysian batik-inspired; tokens verbatim §4.6 (§13 ③)
+  (
+    '03c7d417-d02a-4104-9299-2f03be5c4d66',
+    'batik-heritage',
+    'Batik Heritage',
+    'Malaysian batik-inspired — terracotta and canting gold on wax-cream.',
+    'system',
+    null,
+    '{
+      "colors": {
+        "primary": "#9C4A1A",
+        "secondary": "#3E2C23",
+        "accent": "#D4A017",
+        "background": "#FBF6EC",
+        "foreground": "#2B2118",
+        "ring": "#C68B2E"
+      },
+      "vocabulary": {
+        "checkpoint_label": "Kampung",
+        "medal_label": "Pingat",
+        "run_label": "Larian",
+        "participant_label": "Peserta",
+        "certificate_label": "Sijil"
+      },
+      "meta": {"version": 1}
+    }'::jsonb
+  )
+on conflict (slug) do nothing;
+
+-- ══ down ══════════════════════════════════════════════════════════════
+-- delete from public.theme_presets
+-- where id in (
+--   'b7d4dfdd-0c4d-4427-b561-b989f370008d',  -- pelikat-classic
+--   'e2c9ba7d-4751-4101-a2e8-b27c86c61a1b',  -- wizard-academy
+--   '04b5923b-d10d-49fe-ad74-7c5705f92179',  -- hidden-village
+--   'bd39de2a-0ff0-455e-bb27-047bca7b8194',  -- galaxy-runner
+--   'e4fb2e41-ad2c-4e1f-a8a9-cf334acd72ca',  -- sunset-marathon
+--   '03c7d417-d02a-4104-9299-2f03be5c4d66'   -- batik-heritage
+-- );
diff --git a/supabase/seed.sql b/supabase/seed.sql
index 238f7b7..46ae250 100644
--- a/supabase/seed.sql
+++ b/supabase/seed.sql
@@ -67,20 +67,34 @@ insert into storage.buckets (id, name, public)
 values
   ('ic-documents',  'ic-documents',  false),
   ('race-photos',   'race-photos',   false),
   ('photo-gallery', 'photo-gallery', false),
   ('receipts',      'receipts',      false),
   ('certificates',  'certificates',  false),
   ('avatars',       'avatars',       true),
   ('merch-images',  'merch-images',  true)
 on conflict (id) do nothing;
 
+-- Event Themes P1: `event-themes` bucket with FULL config (size + mime
+-- allowlist). setup-storage.sql is the config authority; this upsert only
+-- makes a bare `db reset` + seed self-contained like the buckets above.
+insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
+values (
+  'event-themes', 'event-themes', true,
+  10485760,
+  array['image/png','image/jpeg','image/webp','font/woff','font/woff2','font/ttf']
+)
+on conflict (id) do update set
+  public            = excluded.public,
+  file_size_limit   = excluded.file_size_limit,
+  allowed_mime_types = excluded.allowed_mime_types;
+
 -- ════════════════════════════════════════════════════════════════════════════
 -- §2 AUTH USERS  (password for all: Pelikat!2026)
 --    Role resolution is via raw_app_meta_data (read by get_my_organizer_id()
 --    / is_admin()): admin {"role":"admin"},
 --    organizer {"role":"organizer","organizer_id":"<organizers.id>"},
 --    runner {"role":"runner"}.
 --    email_confirmed_at is always set (guest auto-claim trigger requires it).
 -- ★ instance_id: hosted GoTrue filters instance_id = '00000000-…' on every
 --    lookup, so every seeded auth.users row MUST include it explicitly.
 --    (Pre-074 seed omitted it → 18 NULL rows invisible to hosted GoTrue;
diff --git a/supabase/setup-storage.sql b/supabase/setup-storage.sql
index 8aa2ea4..3bc38f1 100644
--- a/supabase/setup-storage.sql
+++ b/supabase/setup-storage.sql
@@ -51,27 +51,135 @@ create policy "authenticated upload own avatar" on storage.objects
   );
 
 create policy "authenticated update own avatar" on storage.objects
   for update using (
     bucket_id = 'avatars' and
     (storage.foldername(name))[1] = auth.uid()::text
   );
 
 -- ic-documents: private bucket for IC/passport images
 -- Runners can upload raw temp files; Django encrypts and replaces them
+-- ⚠ Drop-guards: migration 041 already creates these three identically-named
+-- policies, so a whole-file replay after `supabase db reset` would abort here
+-- without them (069 precedent: drop-if-exists before every re-created policy).
+drop policy if exists "runner uploads own ic document" on storage.objects;
 create policy "runner uploads own ic document" on storage.objects
   for insert with check (
     bucket_id = 'ic-documents' and
     (storage.foldername(name))[1] = auth.uid()::text
   );
 
+drop policy if exists "runner reads own ic document" on storage.objects;
 create policy "runner reads own ic document" on storage.objects
   for select using (
     bucket_id = 'ic-documents' and
     (storage.foldername(name))[1] = auth.uid()::text
   );
 
+drop policy if exists "runner deletes own ic document" on storage.objects;
 create policy "runner deletes own ic document" on storage.objects
   for delete using (
     bucket_id = 'ic-documents' and
     (storage.foldername(name))[1] = auth.uid()::text
   );
+
+-- ── EVENT THEMES BUCKET (Event Themes P1 — spec §6) ──────────
+-- Dedicated PUBLIC bucket: themed assets render on unauthenticated runner
+-- pages. Public read is bucket-level (`public: true`); the bucket is NOT
+-- publicly listable — there is deliberately no public SELECT policy, so
+-- list/download via the Storage API stays organizer+admin-scoped below.
+-- Rendered certificates with runner PII stay in the private `certificates`
+-- bucket, unchanged.
+
+insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
+values (
+  'event-themes',
+  'event-themes',
+  true,
+  10485760,  -- 10 MB hard cap (per-asset-type limits enforced editor-side)
+  array[
+    'image/png',
+    'image/jpeg',
+    'image/webp',
+    'font/woff',
+    'font/woff2',
+    'font/ttf'
+  ]
+)
+on conflict (id) do nothing;
+
+-- Tenancy validator: only paths shaped
+--   organizers/{organizer_id}/events/{event_id}/{asset}.{ext}
+-- pass, where both uuid segments must be canonical lowercase literals and
+-- the event must actually belong to the caller — a forged event uuid fails
+-- the exists-check. Admin bypass lives here so all four policies share it.
+-- System preset assets (organizers/system/presets/…) are uploaded via
+-- service_role, which bypasses RLS entirely — outside this validator.
+-- ⚠ Param is `p_name`, NOT `name`: inside the `exists (… from events e …)`
+-- subquery a parameter called `name` is shadowed by the `events.name`
+-- column (column names outrank SQL-function parameter names), which made
+-- the helper always-false for non-admins. Positional calls are unaffected.
+create or replace function can_manage_theme_path(p_name text)
+returns boolean
+language sql
+stable
+security definer
+set search_path = public
+as $$
+  select is_admin() or exists (
+    select 1
+    from events e
+    where e.organizer_id = get_my_organizer_id()
+      and (storage.foldername(p_name)) = array[
+            'organizers',
+            get_my_organizer_id()::text,
+            'events',
+            e.id::text
+          ]
+  )
+$$;
+
+-- organizer/admin can upload to their own event path (Storage upload)
+create policy "organizer uploads own event theme assets" on storage.objects
+  for insert to authenticated
+  with check (
+    bucket_id = 'event-themes' and
+    can_manage_theme_path(name)
+  );
+
+-- organizer/admin list/download only (public serving is bucket-level and
+-- never consults RLS; anon matches no policy → not publicly listable)
+create policy "organizer reads own event theme assets" on storage.objects
+  for select to authenticated
+  using (
+    bucket_id = 'event-themes' and
+    can_manage_theme_path(name)
+  );
+
+-- update covers Storage API upsert: true (insert-or-update replacement)
+create policy "organizer updates own event theme assets" on storage.objects
+  for update to authenticated
+  using (
+    bucket_id = 'event-themes' and
+    can_manage_theme_path(name)
+  )
+  with check (
+    bucket_id = 'event-themes' and
+    can_manage_theme_path(name)
+  );
+
+-- delete via Storage API as owner/admin (hosted Supabase blocks direct SQL
+-- deletes on storage.objects; the storage API applies these same policies)
+create policy "organizer deletes own event theme assets" on storage.objects
+  for delete to authenticated
+  using (
+    bucket_id = 'event-themes' and
+    can_manage_theme_path(name)
+  );
+
+-- ══ down (addendum only) ═════════════════════════════════════════════
+-- drop policy "organizer deletes own event theme assets" on storage.objects;
+-- drop policy "organizer updates own event theme assets" on storage.objects;
+-- drop policy "organizer reads own event theme assets" on storage.objects;
+-- drop policy "organizer uploads own event theme assets" on storage.objects;
+-- drop function can_manage_theme_path(text);
+-- delete from storage.buckets where id = 'event-themes';
diff --git a/tests/reliability/payments-schema.test.ts b/tests/reliability/payments-schema.test.ts
index 8880c02..e820e8d 100644
--- a/tests/reliability/payments-schema.test.ts
+++ b/tests/reliability/payments-schema.test.ts
@@ -172,21 +172,21 @@ describe('Reliability: confirm_dummy_payment server-trust revision (migration 06
     )
   })
 
   it('header explains WHY ownership moved app-side (mock-only + caller-JWT pre-verify)', () => {
     expect(migration061).toMatch(/PAYMENT_PROVIDER\s*=\s*'mock'/)
     expect(migration061).toMatch(/server action/i)
   })
 })
 
 describe('Reliability: double-charge + refund hardening (migration 062)', () => {
-  const migration062 = read('supabase', 'migrations', '062_payment_double_charge_and_refund_hardening.sql')
+  const migration062 = read('supabase', 'migrations', '0625_payment_double_charge_and_refund_hardening.sql')
 
   it('adds the cumulative refunded_amount counter (A-4)', () => {
     expect(migration062).toContain(
       'add column if not exists refunded_amount numeric(10,2) not null default 0'
     )
   })
 
   it('amends confirm_payment (same 059 signature) with the duplicate-charge branch (W-3)', () => {
     expect(migration062).toContain(
       'create or replace function public.confirm_payment(\n  p_provider_request_id text,\n  p_provider_payment_id text,\n  p_rail text\n) returns uuid'
@@ -240,21 +240,21 @@ describe('Reliability: double-charge + refund hardening (migration 062)', () =>
 
   it('documents the claim → hitpay create → link/delete usage sequence', () => {
     expect(migration062).toContain('is_reservation = false')
     expect(migration062).toContain('is_reservation = true')
     expect(migration062).toMatch(/GET the PR/i)
     expect(migration062).toMatch(/DELETE the synthetic row/i)
   })
 })
 
 describe('Reliability: claim in-progress sentinel disambiguation (migration 063)', () => {
-  const migration063 = read('supabase', 'migrations', '063_payment_claim_in_progress.sql')
+  const migration063 = read('supabase', 'migrations', '0635_payment_claim_in_progress.sql')
 
   it('changes the signature to the tri-state returns table, provider_request_id first', () => {
     expect(migration063).toContain(
       'returns table(provider_request_id text, is_reservation boolean, in_progress boolean)'
     )
   })
 
   it('is security definer with empty search_path and keeps the advisory lock FIRST', () => {
     expect(migration063).toMatch(/security\s+definer/i)
     expect(migration063).toMatch(/set\s+search_path\s*=\s*''/)
@@ -313,21 +313,21 @@ describe('Reliability: claim in-progress sentinel disambiguation (migration 063)
     expect(migration063).toMatch(/ALWAYS safe to delete/i)
   })
 
   it('updates the function comment with the tri-state semantics', () => {
     expect(migration063).toContain('in_progress=true ⇒ reservation already holds the sentinel')
   })
 })
 
 describe('Reliability: sentinel runbook truth revision (migration 064)', () => {
   const migration064 = read('supabase', 'migrations', '064_payment_sentinel_runbook.sql')
-  const migration063 = read('supabase', 'migrations', '063_payment_claim_in_progress.sql')
+  const migration063 = read('supabase', 'migrations', '0635_payment_claim_in_progress.sql')
 
   it('is comment-only: signature, grants and the 063 body are untouched', () => {
     expect(migration064).toMatch(/comment on function public\.claim_payment_slot\(/i)
     expect(migration064).not.toMatch(/\bcreate (or replace )?function\b/i)
     expect(migration064).not.toMatch(/\bdrop function\b/i)
     expect(migration064).not.toMatch(/\brevoke\b|\bgrant\b/i)
     // Nothing is smuggled in a body: no $$ blocks at all.
     expect(migration064.split('$$')).toHaveLength(1)
   })
 
diff --git a/tests/theme/color.test.ts b/tests/theme/color.test.ts
new file mode 100644
index 0000000..9292e51
--- /dev/null
+++ b/tests/theme/color.test.ts
@@ -0,0 +1,175 @@
+import { describe, it, expect } from 'vitest'
+import {
+  hexToOklch,
+  oklchToString,
+  hexToRgb255,
+  relativeLuminance,
+  contrastRatio,
+  pickForeground,
+  deriveDarkVariant,
+} from '@/lib/theme/color'
+
+// Parity vectors vs standard OKLCH formulas (Björn Ottosson's OKLab, e.g. as
+// implemented by culori / CSS Color 4). Tolerances: L/C to 2 decimals, h to 1.
+describe('hexToOklch', () => {
+  it('matches standard OKLCH for pure red', () => {
+    const o = hexToOklch('#FF0000')
+    expect(o.l).toBeCloseTo(0.628, 2)
+    expect(o.c).toBeCloseTo(0.258, 2)
+    expect(o.h).toBeCloseTo(29.2, 1)
+  })
+
+  it('matches standard OKLCH for Batik Heritage primary', () => {
+    const o = hexToOklch('#9C4A1A')
+    expect(o.l).toBeCloseTo(0.505, 2)
+    expect(o.c).toBeCloseTo(0.124, 2)
+    expect(o.h).toBeCloseTo(46.9, 0)
+  })
+
+  it('maps black and white to the achromatic axis', () => {
+    expect(hexToOklch('#000000')).toEqual({ l: 0, c: 0, h: 0 })
+    const w = hexToOklch('#FFFFFF')
+    expect(w.l).toBeCloseTo(1, 3)
+    expect(w.c).toBeLessThan(0.001)
+  })
+
+  it('is case-insensitive and accepts an optional # prefix', () => {
+    const upper = hexToOklch('#FF0000')
+    const lower = hexToOklch('#ff0000')
+    const bare = hexToOklch('ff0000')
+    expect(lower.l).toBe(upper.l)
+    expect(bare.c).toBe(upper.c)
+    expect(bare.h).toBe(upper.h)
+  })
+
+  it('returns the safe fallback for malformed hex', () => {
+    expect(hexToOklch('not-a-hex')).toEqual({ l: 0, c: 0, h: 0 })
+    expect(hexToOklch('#12345')).toEqual({ l: 0, c: 0, h: 0 })
+    expect(hexToOklch('javascript:alert(1)')).toEqual({ l: 0, c: 0, h: 0 })
+  })
+})
+
+describe('oklchToString', () => {
+  it('formats as `oklch(L C H)` with rounding and trimmed zeros', () => {
+    expect(oklchToString({ l: 0.628, c: 0.258, h: 29.2 })).toBe(
+      'oklch(0.628 0.258 29.2)'
+    )
+    expect(oklchToString({ l: 0, c: 0, h: 0 })).toBe('oklch(0 0 0)')
+  })
+})
+
+describe('hexToRgb255', () => {
+  it('converts hex channels to 0-255', () => {
+    expect(hexToRgb255('#FF0000')).toEqual([255, 0, 0])
+    expect(hexToRgb255('#9C4A1A')).toEqual([156, 74, 26])
+    expect(hexToRgb255('ffffff')).toEqual([255, 255, 255])
+  })
+
+  it('falls back to black on malformed input', () => {
+    expect(hexToRgb255('#xyz123')).toEqual([0, 0, 0])
+  })
+})
+
+describe('relativeLuminance (WCAG 2.1 sRGB)', () => {
+  it('is 0 for black and 1 for white', () => {
+    expect(relativeLuminance('#000000')).toBe(0)
+    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 6)
+  })
+
+  it('weights sRGB channels per WCAG 2.1', () => {
+    // #FFD700: R=1, G=215/255 → linear 0.6797, B=0.
+    expect(relativeLuminance('#FFD700')).toBeCloseTo(0.6987, 3)
+  })
+
+  it('is 0 for malformed input', () => {
+    expect(relativeLuminance('#12')).toBe(0)
+  })
+})
+
+describe('contrastRatio (WCAG 2.1)', () => {
+  it('gives exactly 21:1 for black vs white', () => {
+    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10)
+  })
+
+  it('is order-independent and 1 against itself', () => {
+    expect(contrastRatio('#ffffff', '#000000')).toBe(
+      contrastRatio('#000000', '#ffffff')
+    )
+    expect(contrastRatio('#9C4A1A', '#9C4A1A')).toBeCloseTo(1, 10)
+  })
+
+  it('degrades to 1 (no contrast) on malformed input', () => {
+    expect(contrastRatio('#zzzzzz', '#ffffff')).toBe(1)
+    expect(contrastRatio('#000000', '')).toBe(1)
+  })
+})
+
+describe('pickForeground', () => {
+  // oklch(0.145 0 0) is achromatic: LMS = L^3, so each linear sRGB channel is
+  // 0.145^3 and the WCAG luminance is the same (channel weights sum to 1).
+  const DARK_FG_WCAG_LUM = 0.145 ** 3
+
+  it('picks the dark foreground for light fills (#FFD700), ≥4.5:1', () => {
+    // White branch must fail first (≈1.4:1).
+    expect(contrastRatio('#FFD700', '#ffffff')).toBeLessThan(4.5)
+    expect(pickForeground('#FFD700')).toBe('oklch(0.145 0 0)')
+    const gold = relativeLuminance('#FFD700')
+    expect((gold + 0.05) / (DARK_FG_WCAG_LUM + 0.05)).toBeGreaterThanOrEqual(4.5)
+  })
+
+  it('picks white for dark fills (#9C4A1A), ≥4.5:1', () => {
+    expect(contrastRatio('#9C4A1A', '#ffffff')).toBeGreaterThanOrEqual(4.5)
+    expect(pickForeground('#9C4A1A')).toBe('#ffffff')
+  })
+
+  it('returns the dark foreground for malformed fills', () => {
+    expect(pickForeground('')).toBe('oklch(0.145 0 0)')
+  })
+})
+
+describe('deriveDarkVariant', () => {
+  function parseOklch(s: string): { l: number; c: number; h: number } {
+    const m = /^oklch\((\S+) (\S+) (\S+)\)$/.exec(s)
+    if (!m) throw new Error(`not oklch string: ${s}`)
+    return { l: Number(m[1]), c: Number(m[2]), h: Number(m[3]) }
+  }
+
+  it('keeps hue, clamps L to [0.68, 0.82], caps chroma at 0.20', () => {
+    const src = hexToOklch('#9C4A1A')
+    const dark = parseOklch(deriveDarkVariant('#9C4A1A'))
+    expect(dark.h).toBeCloseTo(src.h, 0)
+    expect(dark.l).toBeGreaterThanOrEqual(0.68)
+    expect(dark.l).toBeLessThanOrEqual(0.82)
+    expect(dark.c).toBeLessThanOrEqual(0.2)
+    // Sub-cap chroma is reduced (×0.85), never amplified.
+    expect(dark.c).toBeLessThan(src.c)
+  })
+
+  it('clamps already-light colors down to L 0.82', () => {
+    // Light source: L above the clamp ceiling → exactly 0.82, hue preserved.
+    const src = hexToOklch('#FFD700')
+    const dark = parseOklch(deriveDarkVariant('#FFD700'))
+    expect(dark.l).toBe(0.82)
+    expect(dark.h).toBeCloseTo(src.h, 0)
+  })
+
+  it('returns a neutral dark fallback (no throw) for malformed hex', () => {
+    expect(deriveDarkVariant('not-a-hex')).toBe('oklch(0.68 0 0)')
+  })
+})
+
+describe('malformed input never throws (spec §5.5.4)', () => {
+  const garbage: unknown[] = [undefined, null, 42, {}, '#', '#12G45Z']
+
+  it('every function degrades to its safe fallback', () => {
+    for (const g of garbage) {
+      expect(() => hexToOklch(g as string)).not.toThrow()
+      expect(hexToOklch(g as string)).toEqual({ l: 0, c: 0, h: 0 })
+      expect(hexToRgb255(g as string)).toEqual([0, 0, 0])
+      expect(relativeLuminance(g as string)).toBe(0)
+      expect(contrastRatio(g as string, g as string)).toBe(1)
+      expect(pickForeground(g as string)).toBe('oklch(0.145 0 0)')
+      expect(deriveDarkVariant(g as string)).toBe('oklch(0.68 0 0)')
+    }
+  })
+})
diff --git a/tests/theme/css.test.ts b/tests/theme/css.test.ts
new file mode 100644
index 0000000..75db7f8
--- /dev/null
+++ b/tests/theme/css.test.ts
@@ -0,0 +1,248 @@
+import { describe, it, expect, beforeAll, afterAll } from 'vitest'
+import { readFileSync } from 'node:fs'
+import { resolve } from 'node:path'
+import { buildStyleVars, buildFontFace } from '@/lib/theme/css'
+import type { BrandSlot, ResolvedTheme } from '@/lib/theme/types'
+
+// Platform storage origin for the font allowlist (spec §5.4). css.ts reads
+// NEXT_PUBLIC_SUPABASE_URL per call — set before any test body runs. Vitest
+// isolates workers per file, so this cannot leak into other test files.
+const TEST_SUPABASE_URL = 'https://ugexrrslijmwtieevjbs.supabase.co'
+const REAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
+
+beforeAll(() => {
+  process.env.NEXT_PUBLIC_SUPABASE_URL = TEST_SUPABASE_URL
+})
+afterAll(() => {
+  if (REAL_SUPABASE_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
+  else process.env.NEXT_PUBLIC_SUPABASE_URL = REAL_SUPABASE_URL
+})
+
+// Distinct opaque oklch() strings per field — buildStyleVars must pass dark
+// slots through UNTOUCHED (Task 6 carried requirement: never re-parse oklch).
+const slot = (l: string, d: string, fl: string, fd: string): BrandSlot => ({
+  light: l,
+  dark: d,
+  fgLight: fl,
+  fgDark: fd,
+})
+
+const resolved: ResolvedTheme = {
+  primary: slot('oklch(0.6 0.12 30)', 'oklch(0.7 0.1 30)', 'oklch(1 0 0)', 'oklch(0.145 0 0)'),
+  secondary: slot('oklch(0.92 0 0)', 'oklch(0.16 0 0)', 'oklch(0.145 0 0)', 'oklch(0.985 0 0)'),
+  accent: slot('oklch(0.85 0.15 90)', 'oklch(0.8 0.12 90)', 'oklch(0.145 0 0)', 'oklch(0.985 0 0)'),
+  ring: slot('oklch(0.55 0.2 200)', 'oklch(0.75 0.15 200)', 'oklch(1 0 0)', 'oklch(0.145 0 0)'),
+  background: { light: null, dark: null },
+  foreground: { light: null, dark: null },
+  fonts: { heading: null, body: null },
+  labels: {
+    bib_label: 'Bib Number',
+    checkpoint_label: 'Checkpoint',
+    medal_label: 'Medal',
+    run_label: 'Run',
+    participant_label: 'Participant',
+    certificate_label: 'Certificate',
+  },
+  warnings: [],
+  source: { presetId: null, overriddenKeys: [] },
+}
+
+describe('buildStyleVars', () => {
+  it('emits light + dark + both foregrounds for all 4 brand roles', () => {
+    const vars = buildStyleVars(resolved) as unknown as Record<string, string>
+    const roles = ['primary', 'secondary', 'accent', 'ring'] as const
+    for (const role of roles) {
+      expect(vars[`--et-${role}`]).toBe(resolved[role].light)
+      expect(vars[`--et-${role}-dark`]).toBe(resolved[role].dark)
+      expect(vars[`--et-${role}-fg`]).toBe(resolved[role].fgLight)
+      expect(vars[`--et-${role}-fg-dark`]).toBe(resolved[role].fgDark)
+    }
+  })
+
+  it('passes dark slots through as opaque oklch strings (never re-parsed)', () => {
+    const vars = buildStyleVars(resolved) as unknown as Record<string, string>
+    expect(vars['--et-primary-dark']).toBe('oklch(0.7 0.1 30)')
+    expect(vars['--et-ring-fg-dark']).toBe('oklch(0.145 0 0)')
+  })
+
+  it('omits font vars when fonts are null', () => {
+    const vars = buildStyleVars(resolved) as unknown as Record<string, string>
+    expect(vars['--et-font-heading']).toBeUndefined()
+    expect(vars['--et-font-body']).toBeUndefined()
+  })
+
+  it('emits heading font var with system family + Geist fallback when eventId given', () => {
+    const themed: ResolvedTheme = {
+      ...resolved,
+      fonts: { heading: 'https://fonts.gstatic.com/s/lasso/v1/x.woff2', body: null },
+    }
+    const vars = buildStyleVars(themed, '9b2f4c1e-abcd-4321-9876-abcdef012345') as unknown as Record<string, string>
+    expect(vars['--et-font-heading']).toBe('ET-9b2f4c1e-Heading, var(--font-geist)')
+  })
+
+  it('emits body font var with system family + Geist fallback', () => {
+    const themed: ResolvedTheme = {
+      ...resolved,
+      fonts: { heading: null, body: 'https://fonts.gstatic.com/s/inter/v1/y.woff2' },
+    }
+    const vars = buildStyleVars(themed, '9b2f4c1e-abcd-4321-9876-abcdef012345') as unknown as Record<string, string>
+    expect(vars['--et-font-body']).toBe('ET-9b2f4c1e-Body, var(--font-geist)')
+    expect(vars['--et-font-heading']).toBeUndefined()
+  })
+
+  it('omits font vars when no eventId is given (pinned single-arg signature)', () => {
+    const themed: ResolvedTheme = {
+      ...resolved,
+      fonts: { heading: 'https://fonts.gstatic.com/s/lasso/v1/x.woff2', body: null },
+    }
+    const vars = buildStyleVars(themed) as unknown as Record<string, string>
+    expect(vars['--et-font-heading']).toBeUndefined()
+  })
+})
+
+describe('buildFontFace', () => {
+  const eventId = '9b2f4c1e-abcd-4321-9876-abcdef012345'
+
+  it('accepts fonts.gstatic.com https woff2 and emits @font-face with system family + swap', () => {
+    const css = buildFontFace(eventId, 'https://fonts.gstatic.com/s/lasso/v1/x.woff2')
+    expect(css).toContain('font-family: ET-9b2f4c1e-Heading;')
+    expect(css).toContain('font-display: swap;')
+    expect(css).toContain('url("https://fonts.gstatic.com/s/lasso/v1/x.woff2") format("woff2")')
+  })
+
+  it('accepts the platform storage origin (Supabase URL env)', () => {
+    const css = buildFontFace(
+      eventId,
+      `${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/organizers/o/events/e/heading.woff2`
+    )
+    expect(css).toContain('ET-9b2f4c1e-Heading')
+    expect(css).toContain('font-display: swap;')
+  })
+
+  it('rejects non-allowlisted https hosts', () => {
+    expect(buildFontFace(eventId, 'https://evil.example.com/x.woff2')).toBe('')
+  })
+
+  it('rejects non-https URLs even on allowed hosts', () => {
+    expect(buildFontFace(eventId, 'http://fonts.gstatic.com/x.woff2')).toBe('')
+    expect(
+      buildFontFace(eventId, `${TEST_SUPABASE_URL.replace('https', 'http')}/storage/v1/object/public/event-themes/x.woff2`)
+    ).toBe('')
+  })
+
+  it('rejects non-woff2 extensions', () => {
+    expect(buildFontFace(eventId, 'https://fonts.gstatic.com/x.ttf')).toBe('')
+    expect(buildFontFace(eventId, 'https://fonts.gstatic.com/x.woff')).toBe('')
+    expect(buildFontFace(eventId, `${TEST_SUPABASE_URL}/x`)).toBe('')
+  })
+
+  it('rejects ../ path traversal (DB charset bypass — app-layer boundary, spec §5.4)', () => {
+    // Raw dot-dot segments are rejected before URL normalization hides them.
+    expect(buildFontFace(eventId, `${TEST_SUPABASE_URL}/../x.woff2`)).toBe('')
+    expect(buildFontFace(eventId, 'https://fonts.gstatic.com/../x.woff2')).toBe('')
+    expect(buildFontFace(eventId, `${TEST_SUPABASE_URL}/storage/v1/../evil.woff2`)).toBe('')
+    expect(buildFontFace(eventId, 'https://fonts.gstatic.com/%2e%2e/x.woff2')).toBe('')
+    // Fully-encoded traversal (`..` AND the slashes percent-encoded) — Task 14.
+    expect(buildFontFace(eventId, 'https://fonts.gstatic.com/%2e%2e%2fx.woff2')).toBe('')
+    expect(
+      buildFontFace(eventId, `${TEST_SUPABASE_URL}/storage/v1%2f..%2fevil.woff2`)
+    ).toBe('')
+  })
+
+  it('rejects malformed URLs', () => {
+    expect(buildFontFace(eventId, 'not-a-url')).toBe('')
+    expect(buildFontFace(eventId, '')).toBe('')
+  })
+
+  it('normalizes the URL (no raw spaces/quotes injected into the CSS string)', () => {
+    const css = buildFontFace(eventId, 'https://fonts.gstatic.com/a b.woff2')
+    expect(css).toContain('url("https://fonts.gstatic.com/a%20b.woff2")')
+    // Inside the url("…") token there must be no whitespace or nested quotes.
+    expect(css).toMatch(/url\("[^"\s]*"\)/)
+  })
+
+  it('sanitizes the family prefix to alphanumeric characters', () => {
+    const css = buildFontFace('dead<beef>-1234', 'https://fonts.gstatic.com/x.woff2')
+    expect(css).toContain('font-family: ET-deadbeef-Heading;')
+  })
+})
+
+describe('event-theme.css whitelist (hard boundary — spec §5.3)', () => {
+  const css = readFileSync(resolve(process.cwd(), 'src/app/event-theme.css'), 'utf8')
+
+  /** Every custom property DECLARED in the file (LHS of `--x:`). */
+  function declaredProps(source: string): Set<string> {
+    return new Set([...source.matchAll(/(--[A-Za-z0-9-]+)\s*:/g)].map((m) => m[1]))
+  }
+
+  const WHITELIST = new Set([
+    '--primary',
+    '--primary-foreground',
+    '--secondary',
+    '--secondary-foreground',
+    '--accent',
+    '--accent-foreground',
+    '--ring',
+  ])
+
+  const FORBIDDEN_EXACT = [
+    '--background',
+    '--foreground',
+    '--card',
+    '--card-foreground',
+    '--popover',
+    '--popover-foreground',
+    '--muted',
+    '--muted-foreground',
+    '--border',
+    '--input',
+    '--destructive',
+    '--destructive-foreground',
+    '--radius',
+    '--success',
+  ]
+  const FORBIDDEN_PREFIXES = ['--chart-', '--sidebar-']
+
+  it('declares EXACTLY the 7 brand tokens — nothing else', () => {
+    const declared = declaredProps(css)
+    for (const name of declared) {
+      expect(WHITELIST.has(name), `non-whitelisted token declared: ${name}`).toBe(true)
+    }
+    for (const name of WHITELIST) {
+      expect(declared.has(name), `whitelisted token missing: ${name}`).toBe(true)
+    }
+  })
+
+  it('contains no forbidden platform tokens (exact or prefixed)', () => {
+    const declared = declaredProps(css)
+    for (const name of FORBIDDEN_EXACT) {
+      expect(declared.has(name), `forbidden platform token declared: ${name}`).toBe(false)
+    }
+    for (const name of declared) {
+      for (const prefix of FORBIDDEN_PREFIXES) {
+        expect(name.startsWith(prefix), `forbidden platform token declared: ${name}`).toBe(false)
+      }
+    }
+  })
+
+  it('contains no raw forbidden-token substrings anywhere (belt to the declaration check)', () => {
+    for (const raw of ['--background', '--foreground', '--card', '--popover', '--muted', '--border', '--input', '--destructive', '--chart-', '--sidebar-', '--radius', '--success']) {
+      expect(css.includes(raw), `forbidden token substring present: ${raw}`).toBe(false)
+    }
+  })
+
+  it('maps the brand tokens onto the Tailwind theme vars in both modes', () => {
+    expect(css).toContain('.event-theme {')
+    expect(css).toContain('--primary: var(--et-primary);')
+    expect(css).toContain('--primary-foreground: var(--et-primary-fg);')
+    expect(css).toContain('.dark .event-theme {')
+    expect(css).toContain('--primary: var(--et-primary-dark);')
+    expect(css).toContain('--primary-foreground: var(--et-primary-fg-dark);')
+    expect(css).toContain('--ring: var(--et-ring-dark);')
+  })
+
+  it('heading selectors pick up the themed heading font with a platform fallback', () => {
+    expect(css).toMatch(/\.event-theme h[1-6]/)
+    expect(css).toContain('font-family: var(--et-font-heading, var(--font-sans));')
+  })
+})
diff --git a/tests/theme/derive-theme.test.ts b/tests/theme/derive-theme.test.ts
new file mode 100644
index 0000000..228bba5
--- /dev/null
+++ b/tests/theme/derive-theme.test.ts
@@ -0,0 +1,50 @@
+import { describe, it, expect } from 'vitest'
+import { deriveTheme } from '@/lib/theme/resolve'
+import type { ThemeTokens } from '@/lib/theme/types'
+import { oklchToString, hexToOklch, deriveDarkVariant } from '@/lib/theme/color'
+
+/**
+ * deriveTheme — the pure, isomorphic derivation half of the resolver. The
+ * editor's live preview (Task 13) runs it client-side with the selected
+ * preset's tokens ⊕ the override draft; getResolvedTheme wraps it with the
+ * preset DB load. Never throws on malformed input (spec §5.5).
+ */
+const BATIK: ThemeTokens = {
+  colors: { primary: '#9C4A1A', secondary: '#3E2C23', accent: '#D4A017', ring: '#C68B2E' },
+  vocabulary: { medal_label: 'Pingat' },
+  meta: { version: 1 },
+}
+
+const PRESET_ID = '11111111-1111-1111-1111-111111111111'
+
+describe('deriveTheme', () => {
+  it('preset only → themed slots, labels filled, source tracked', () => {
+    const resolved = deriveTheme(BATIK, null, PRESET_ID)
+    expect(resolved.primary.light).toBe(oklchToString(hexToOklch('#9C4A1A')))
+    expect(resolved.primary.dark).toBe(deriveDarkVariant('#9C4A1A'))
+    expect(resolved.labels.medal_label).toBe('Pingat')
+    expect(resolved.labels.bib_label).toBe('Bib Number')
+    expect(resolved.source).toEqual({ presetId: PRESET_ID, overriddenKeys: [] })
+  })
+
+  it('override draft wins over the preset (live preview reflects edits)', () => {
+    const resolved = deriveTheme(BATIK, { colors: { primary: '#00807A' } }, PRESET_ID)
+    expect(resolved.primary.light).toBe(oklchToString(hexToOklch('#00807A')))
+    expect(resolved.secondary.light).toBe(oklchToString(hexToOklch('#3E2C23')))
+    expect(resolved.source.overriddenKeys).toEqual(['colors.primary'])
+  })
+
+  it('custom (no preset) + malformed HEX degrades to platform + warning, never throws', () => {
+    const resolved = deriveTheme({}, { colors: { primary: 'nope' } }, null)
+    expect(resolved.source.presetId).toBeNull()
+    expect(resolved.warnings.some((w) => w.includes('colors.primary'))).toBe(true)
+  })
+
+  it('fuzz: garbage draft shapes never throw', () => {
+    for (const cfg of [42, 'x', [], { colors: 5 }, { vocabulary: { bib_label: 42 } }]) {
+      const resolved = deriveTheme(BATIK, cfg as unknown as ThemeTokens, PRESET_ID)
+      expect(resolved.primary).toBeTruthy()
+      expect(resolved.labels.bib_label).toBeTruthy()
+    }
+  })
+})
diff --git a/tests/theme/draft.test.ts b/tests/theme/draft.test.ts
new file mode 100644
index 0000000..1e52e31
--- /dev/null
+++ b/tests/theme/draft.test.ts
@@ -0,0 +1,63 @@
+import { describe, it, expect } from 'vitest'
+import { seedThemeDraft, normalizeThemeDraft, themeDraftEquals } from '@/lib/theme/draft'
+
+/**
+ * Editor draft-state semantics (Task 13, carried requirements from Tasks 3/9):
+ *  - per-key reset = OMIT the key; the editor must never produce nested JSON
+ *    nulls (validate.ts + 076 reject explicit nulls at every level)
+ *  - an empty draft normalizes to null = full reset (theme_config SQL NULL)
+ *  - drafts are compared order-independently (jsonb row order is not stable)
+ */
+describe('seedThemeDraft', () => {
+  it('copies plain-object sections; nulls/garbage sections are omitted (never carried as JSON nulls)', () => {
+    const seeded = seedThemeDraft({
+      colors: { primary: '#123456' },
+      vocabulary: null,
+      typography: 'garbage',
+      meta: { version: 1 },
+      evil: { x: 1 },
+    })
+    expect(seeded).toEqual({ colors: { primary: '#123456' } })
+  })
+
+  it('canonicalizes edited-section key order (jsonb row order is not stable)', () => {
+    const seeded = seedThemeDraft({ colors: { ring: '#000000', primary: '#123456' } })
+    expect(Object.keys(seeded.colors ?? {})).toEqual(['primary', 'ring'])
+  })
+})
+
+describe('normalizeThemeDraft', () => {
+  it('drops empty sections; an empty draft → null (full reset = SQL NULL)', () => {
+    expect(normalizeThemeDraft({ colors: {}, vocabulary: {} })).toBeNull()
+    expect(normalizeThemeDraft({ colors: { primary: '#123456' }, vocabulary: {} })).toEqual({
+      colors: { primary: '#123456' },
+    })
+  })
+
+  it('never emits nested nulls — null leaves are omitted', () => {
+    const payload = normalizeThemeDraft({ colors: { primary: null } } as never)
+    expect(payload).toBeNull()
+  })
+
+  it('null/non-object drafts normalize to null', () => {
+    expect(normalizeThemeDraft(null)).toBeNull()
+    expect(normalizeThemeDraft(42 as never)).toBeNull()
+  })
+})
+
+describe('themeDraftEquals', () => {
+  it('key-order independent', () => {
+    expect(
+      themeDraftEquals(
+        { colors: { primary: '#123456', ring: '#000000' } },
+        { colors: { ring: '#000000', primary: '#123456' } },
+      ),
+    ).toBe(true)
+  })
+
+  it('distinguishes content and null', () => {
+    expect(themeDraftEquals({ colors: { primary: '#123456' } }, { colors: { primary: '#654321' } })).toBe(false)
+    expect(themeDraftEquals(null, { colors: { primary: '#123456' } })).toBe(false)
+    expect(themeDraftEquals(null, null)).toBe(true)
+  })
+})
diff --git a/tests/theme/event-theme-scope.test.tsx b/tests/theme/event-theme-scope.test.tsx
new file mode 100644
index 0000000..1788ccb
--- /dev/null
+++ b/tests/theme/event-theme-scope.test.tsx
@@ -0,0 +1,137 @@
+import { describe, it, expect, vi, beforeEach } from 'vitest'
+import { prerender } from 'react-dom/static'
+import type { SupabaseClient } from '@supabase/supabase-js'
+import { createClient } from '@/lib/supabase/server'
+import { EventThemeScope } from '@/components/theme/event-theme-scope'
+
+// EventThemeScope builds its own server client (plan interface: { event, children }).
+// Mock the module so tests never touch next/headers; resolve.ts's only query is
+// the theme_presets lookup — same minimal chainable fake as resolve.test.ts.
+vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
+
+const EVENT_ID = '9b2f4c1e-abcd-4321-9876-abcdef012345'
+const PRESET_ID = '11111111-1111-1111-1111-111111111111'
+
+type PresetRow = { id: string; tokens: unknown } | null
+
+function fakeSupabase(row: PresetRow): SupabaseClient {
+  return {
+    from: () => ({
+      select: () => ({
+        eq: () => ({
+          maybeSingle: async () => ({ data: row, error: null }),
+        }),
+      }),
+    }),
+  } as unknown as SupabaseClient
+}
+
+function useSupabase(row: PresetRow): void {
+  vi.mocked(createClient).mockResolvedValue(
+    fakeSupabase(row) as unknown as Awaited<ReturnType<typeof createClient>>,
+  )
+}
+
+// Valid per the write validator (Task 1/9): strict HEX, contrast ≥3:1 vs the
+// platform background, https + .woff2 heading font.
+const TOKENS = {
+  colors: { primary: '#9C4A1A', secondary: '#3E2C23', accent: '#D4A017', ring: '#C68B2E' },
+  typography: { heading_font_url: 'https://fonts.gstatic.com/s/lasso/v1/x.woff2' },
+  meta: { version: 1 },
+}
+
+function event(theme_preset_id: string | null, theme_config: unknown = null) {
+  return { id: EVENT_ID, theme_preset_id, theme_config }
+}
+
+// renderToStaticMarkup (react-dom/server) rejects async components in React
+// 19; prerender (react-dom/static) is its async-capable counterpart and still
+// yields the raw SSR string — inline vars pre-hydration are asserted verbatim.
+async function render(event: { id: string; theme_preset_id: string | null; theme_config: unknown }) {
+  const { prelude } = await prerender(
+    <EventThemeScope event={event}>
+      <p>child</p>
+    </EventThemeScope>,
+  )
+  let html = ''
+  const reader = prelude.getReader()
+  const decoder = new TextDecoder()
+  for (;;) {
+    const { done, value } = await reader.read()
+    if (done) break
+    html += decoder.decode(value, { stream: true })
+  }
+  return html + decoder.decode()
+}
+
+// The 16 brand vars buildStyleVars emits — light/dark × color/companion-fg.
+const ROLE_SUFFIXES = ['-fg', '-dark', '-fg-dark'] as const
+
+describe('EventThemeScope (SSR, spec §5.3)', () => {
+  beforeEach(() => {
+    vi.mocked(createClient).mockReset()
+  })
+
+  it('themed event → wrapper div carries both color modes inline, pre-hydration', async () => {
+    useSupabase({ id: PRESET_ID, tokens: TOKENS })
+    const html = await render(event(PRESET_ID))
+    expect(html).toContain('class="event-theme"')
+    for (const role of ['primary', 'secondary', 'accent', 'ring']) {
+      // Color slots are always oklch; -fg companions may be HEX (#ffffff) —
+      // presence of the pair is the zero-FOUC contract, not its unit.
+      expect(html).toContain(`--et-${role}:oklch(`)
+      for (const suffix of ROLE_SUFFIXES) {
+        expect(html).toContain(`--et-${role}${suffix}:`)
+      }
+    }
+    expect(html).toContain('child')
+  })
+
+  it('unthemed event → children unwrapped (no wrapper, no font-face, no query)', async () => {
+    useSupabase(null)
+    const html = await render(event(null))
+    expect(html).toBe('<p>child</p>')
+    expect(createClient).not.toHaveBeenCalled()
+  })
+
+  it('empty theme_config object → treated as unthemed', async () => {
+    useSupabase(null)
+    const html = await render(event(null, {}))
+    expect(html).toBe('<p>child</p>')
+  })
+
+  it('theme_config-only event (no preset) → still wrapped', async () => {
+    useSupabase(null)
+    const html = await render(event(null, { colors: { primary: '#123456' } }))
+    expect(html).toContain('class="event-theme"')
+    expect(html).toContain('--et-primary:oklch(')
+  })
+
+  it('preset lookup fails → platform theme still wraps (resolve degrades, never throws)', async () => {
+    useSupabase(null)
+    const html = await render(event(PRESET_ID))
+    expect(html).toContain('class="event-theme"')
+    // Platform primary (resolve.ts PLATFORM_SLOTS, mirrors globals.css).
+    expect(html).toContain('--et-primary:oklch(0.51 0.16 190)')
+  })
+
+  it('themed heading font → @font-face + font var with system-generated family', async () => {
+    useSupabase({ id: PRESET_ID, tokens: TOKENS })
+    const html = await render(event(PRESET_ID))
+    expect(html).toContain('@font-face')
+    expect(html).toContain('font-family: ET-9b2f4c1e-Heading;')
+    // Binding carry (Task 10): font vars only emit when event.id is passed.
+    expect(html).toContain('--et-font-heading:ET-9b2f4c1e-Heading')
+  })
+
+  it('font URL failing the allowlist → no @font-face (Geist fallback)', async () => {
+    useSupabase({
+      id: PRESET_ID,
+      tokens: { ...TOKENS, typography: { heading_font_url: 'http://evil.example/x.woff2' } },
+    })
+    const html = await render(event(PRESET_ID))
+    expect(html).not.toContain('@font-face')
+    expect(html).not.toContain('--et-font-heading')
+    expect(html).toContain('class="event-theme"')
+  })
+})
diff --git a/tests/theme/labels.test.ts b/tests/theme/labels.test.ts
new file mode 100644
index 0000000..7296f40
--- /dev/null
+++ b/tests/theme/labels.test.ts
@@ -0,0 +1,122 @@
+import { describe, it, expect } from 'vitest'
+import { LABEL_KEYS, sanitizeLabel, fallbackLabel, resolveLabels, labelPreview } from '@/lib/theme/labels'
+
+describe('sanitizeLabel', () => {
+  it('plan vector: strips HTML tags, control chars, and surrounding whitespace', () => {
+    expect(sanitizeLabel('  <b>Scroll</b>\u0000 ')).toBe('Scroll')
+  })
+
+  it('removes stray < and > characters (unclosed brackets)', () => {
+    expect(sanitizeLabel('a<b')).toBe('ab')
+    expect(sanitizeLabel('Bib < Number > X')).toBe('Bib X')
+  })
+
+  it('collapses internal whitespace runs (tabs/newlines included)', () => {
+    expect(sanitizeLabel('Bib\t\n  Number')).toBe('Bib Number')
+  })
+
+  it('caps at 40 characters (UI cap)', () => {
+    expect(sanitizeLabel('a'.repeat(41))).toBe('a'.repeat(40))
+    expect(sanitizeLabel('a'.repeat(80)).length).toBe(40)
+  })
+
+  it('40-char input passes through at the boundary', () => {
+    expect(sanitizeLabel('a'.repeat(40))).toBe('a'.repeat(40))
+  })
+
+  it('degenerate input → empty string (consumer applies fallback)', () => {
+    expect(sanitizeLabel('   ')).toBe('')
+    expect(sanitizeLabel('\u0000')).toBe('')
+    expect(sanitizeLabel('<b></b>')).toBe('')
+  })
+})
+
+describe('fallbackLabel', () => {
+  it('platform fallback map for all six keys', () => {
+    expect(fallbackLabel('bib_label')).toBe('Bib Number')
+    expect(fallbackLabel('checkpoint_label')).toBe('Checkpoint')
+    expect(fallbackLabel('medal_label')).toBe('Medal')
+    expect(fallbackLabel('run_label')).toBe('Run')
+    expect(fallbackLabel('participant_label')).toBe('Participant')
+    expect(fallbackLabel('certificate_label')).toBe('Certificate')
+  })
+
+  it('unknown key → empty string (ignored)', () => {
+    expect(fallbackLabel('evil_key')).toBe('')
+  })
+})
+
+describe('LABEL_KEYS', () => {
+  it('is the fixed 6-key vocabulary (Global Constraints)', () => {
+    expect([...LABEL_KEYS].sort()).toEqual([
+      'bib_label',
+      'certificate_label',
+      'checkpoint_label',
+      'medal_label',
+      'participant_label',
+      'run_label',
+    ])
+  })
+})
+
+describe('resolveLabels', () => {
+  it('null → all six platform fallbacks', () => {
+    expect(resolveLabels(null)).toEqual({
+      bib_label: 'Bib Number',
+      checkpoint_label: 'Checkpoint',
+      medal_label: 'Medal',
+      run_label: 'Run',
+      participant_label: 'Participant',
+      certificate_label: 'Certificate',
+    })
+  })
+
+  it('Batik vocab passes through; bib_label absent by design → "Bib Number" fallback', () => {
+    const labels = resolveLabels({
+      checkpoint_label: 'Kampung',
+      medal_label: 'Pingat',
+      run_label: 'Larian',
+      participant_label: 'Peserta',
+      certificate_label: 'Sijil',
+    })
+    expect(labels.bib_label).toBe('Bib Number')
+    expect(labels.checkpoint_label).toBe('Kampung')
+    expect(labels.medal_label).toBe('Pingat')
+    expect(labels.run_label).toBe('Larian')
+    expect(labels.participant_label).toBe('Peserta')
+    expect(labels.certificate_label).toBe('Sijil')
+  })
+
+  it('partial override: overridden keys sanitized, rest fall back', () => {
+    const labels = resolveLabels({ medal_label: '  Pingat Baru ' })
+    expect(labels.medal_label).toBe('Pingat Baru')
+    expect(labels.bib_label).toBe('Bib Number')
+    expect(labels.checkpoint_label).toBe('Checkpoint')
+  })
+
+  it('sanitizes values on the way through', () => {
+    expect(resolveLabels({ bib_label: '  Nombor <b>Larian</b>\u0001 ' }).bib_label).toBe('Nombor Larian')
+  })
+
+  it('empty-after-sanitize → fallback', () => {
+    expect(resolveLabels({ medal_label: '   ' }).medal_label).toBe('Medal')
+    expect(resolveLabels({ medal_label: '<x>' }).medal_label).toBe('Medal')
+  })
+
+  it('unknown keys ignored; output is always exactly the 6 keys', () => {
+    const labels = resolveLabels({ evil_key: 'x' } as Record<string, string>)
+    expect(labels).not.toHaveProperty('evil_key')
+    expect(Object.keys(labels).sort()).toEqual([...LABEL_KEYS].sort())
+  })
+
+  it('never trusts runtime value types (fuzz)', () => {
+    const labels = resolveLabels({ bib_label: 42 } as unknown as Record<string, string>)
+    expect(labels.bib_label).toBe('Bib Number')
+  })
+})
+
+describe('labelPreview', () => {
+  it('composes the bib preview template', () => {
+    expect(labelPreview(resolveLabels(null).bib_label)).toBe('Your Bib Number #1234')
+  })
+})
diff --git a/tests/theme/leaderboard-scope.test.ts b/tests/theme/leaderboard-scope.test.ts
new file mode 100644
index 0000000..c970044
--- /dev/null
+++ b/tests/theme/leaderboard-scope.test.ts
@@ -0,0 +1,36 @@
+import { describe, it, expect } from 'vitest'
+import { scopedLeaderboardEventId } from '@/app/runner/leaderboard/scope'
+
+// Spec §5.3: the leaderboard inherits an event theme ONLY when event_id
+// targets ONE published event — mixed-event rankings stay neutral.
+const EVENTS = [
+  { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', results_published: true },
+  { id: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', results_published: false },
+]
+
+describe('scopedLeaderboardEventId', () => {
+  it('single published event → scoped (returns the event id)', () => {
+    expect(scopedLeaderboardEventId(EVENTS[0].id, EVENTS)).toBe(EVENTS[0].id)
+  })
+
+  it('missing event_id → neutral (mixed view)', () => {
+    expect(scopedLeaderboardEventId(undefined, EVENTS)).toBeNull()
+  })
+
+  it("event_id 'all' → neutral (mixed view)", () => {
+    expect(scopedLeaderboardEventId('all', EVENTS)).toBeNull()
+  })
+
+  it('stale/unknown event_id → neutral', () => {
+    expect(scopedLeaderboardEventId('c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', EVENTS)).toBeNull()
+  })
+
+  it('single event but results unpublished → neutral', () => {
+    expect(scopedLeaderboardEventId(EVENTS[1].id, EVENTS)).toBeNull()
+  })
+
+  it('events query failed/empty → neutral', () => {
+    expect(scopedLeaderboardEventId(EVENTS[0].id, null)).toBeNull()
+    expect(scopedLeaderboardEventId(EVENTS[0].id, [])).toBeNull()
+  })
+})
diff --git a/tests/theme/resolve.test.ts b/tests/theme/resolve.test.ts
new file mode 100644
index 0000000..eb3c5e8
--- /dev/null
+++ b/tests/theme/resolve.test.ts
@@ -0,0 +1,236 @@
+import { describe, it, expect } from 'vitest'
+import type { SupabaseClient } from '@supabase/supabase-js'
+import { mergeThemeConfig, getResolvedTheme } from '@/lib/theme/resolve'
+import type { ThemeTokens } from '@/lib/theme/types'
+import { hexToOklch, oklchToString, deriveDarkVariant } from '@/lib/theme/color'
+
+// Platform tokens mirror src/app/globals.css (:root / .dark) — if globals
+// change, these literals intentionally fail to flag the drift.
+const PLATFORM = {
+  primaryLight: 'oklch(0.51 0.16 190)',
+  primaryDark: 'oklch(0.75 0.13 190)',
+  secondaryLight: 'oklch(0.92 0 0)',
+  ringLight: 'oklch(0.51 0.16 190)',
+}
+
+const BATIK: ThemeTokens = {
+  colors: { primary: '#9C4A1A', secondary: '#3E2C23', accent: '#D4A017', ring: '#C68B2E' },
+  vocabulary: { bib_label: 'Nombor', medal_label: 'Pingat' },
+  meta: { version: 1 },
+}
+
+const PRESET_ID = '11111111-1111-1111-1111-111111111111'
+
+type PresetRow = { id: string; tokens: unknown } | null
+
+/** Minimal chainable mock of the only supabase query resolve.ts makes. */
+function fakeSupabase(row: PresetRow, error: unknown = null): SupabaseClient {
+  return {
+    from: () => ({
+      select: () => ({
+        eq: () => ({
+          maybeSingle: async () => ({ data: row, error }),
+        }),
+      }),
+    }),
+  } as unknown as SupabaseClient
+}
+
+function eventRow(theme_config: unknown): {
+  theme_preset_id: string
+  theme_config: unknown
+} {
+  return { theme_preset_id: PRESET_ID, theme_config }
+}
+
+describe('mergeThemeConfig', () => {
+  it('merges deep — event wins on leaf conflicts, preset keys survive', () => {
+    const merged = mergeThemeConfig(BATIK, {
+      colors: { primary: '#123456' },
+      vocabulary: { medal_label: 'Pingat Baru' },
+    })
+    expect(merged.colors?.primary).toBe('#123456')
+    expect(merged.colors?.secondary).toBe('#3E2C23')
+    expect(merged.vocabulary?.bib_label).toBe('Nombor')
+    expect(merged.vocabulary?.medal_label).toBe('Pingat Baru')
+  })
+
+  it('null override key drops the key (→ platform default downstream)', () => {
+    const merged = mergeThemeConfig(BATIK, { colors: { primary: null } })
+    expect(merged.colors && 'primary' in merged.colors).toBe(false)
+    expect(merged.colors?.secondary).toBe('#3E2C23')
+  })
+
+  it('null override section drops the whole section (section-level reset)', () => {
+    const merged = mergeThemeConfig(BATIK, { vocabulary: null } as unknown as ThemeTokens)
+    expect(merged.vocabulary).toBeUndefined()
+    expect(merged.colors?.primary).toBe('#9C4A1A')
+  })
+
+  it('drops unknown keys silently — top-level, nested, and non-object sections', () => {
+    const merged = mergeThemeConfig(BATIK, {
+      evil: { x: 1 },
+      colors: { primary: '#123456', evil: '#000000' },
+      typography: 'red',
+      assets: ['nope'],
+    } as unknown as ThemeTokens)
+    expect(Object.keys(merged).sort()).toEqual(['colors', 'meta', 'vocabulary'])
+    expect(merged.colors).toEqual({
+      primary: '#123456',
+      secondary: '#3E2C23',
+      accent: '#D4A017',
+      ring: '#C68B2E',
+    })
+  })
+
+  it('fuzz: malformed preset/override never throw', () => {
+    const garbage = [null, 42, 'x', [], { colors: 5 }, { colors: { primary: { deep: true } } }]
+    for (const g of garbage) {
+      expect(() =>
+        mergeThemeConfig(g as unknown as ThemeTokens, g as unknown as ThemeTokens),
+      ).not.toThrow()
+      expect(() => mergeThemeConfig(BATIK, g as unknown as ThemeTokens)).not.toThrow()
+    }
+  })
+})
+
+describe('getResolvedTheme', () => {
+  it('no preset id → platform theme, no warnings', async () => {
+    const resolved = await getResolvedTheme(fakeSupabase(null), { theme_preset_id: null, theme_config: null })
+    expect(resolved.primary).toEqual({
+      light: PLATFORM.primaryLight,
+      dark: PLATFORM.primaryDark,
+      fgLight: 'oklch(1 0 0)',
+      fgDark: 'oklch(0.15 0.04 190)',
+    })
+    expect(resolved.secondary.light).toBe(PLATFORM.secondaryLight)
+    expect(resolved.ring.light).toBe(PLATFORM.ringLight)
+    expect(resolved.background).toEqual({ light: null, dark: null })
+    expect(resolved.warnings).toEqual([])
+    expect(resolved.source).toEqual({ presetId: null, overriddenKeys: [] })
+  })
+
+  it('missing preset row → platform theme + warning', async () => {
+    const resolved = await getResolvedTheme(fakeSupabase(null), eventRow(null))
+    expect(resolved.primary.light).toBe(PLATFORM.primaryLight)
+    expect(resolved.warnings.length).toBeGreaterThan(0)
+    expect(resolved.source.presetId).toBeNull()
+  })
+
+  it('preset query error → platform theme + warning (never throws)', async () => {
+    const resolved = await getResolvedTheme(fakeSupabase(null, new Error('boom')), eventRow(null))
+    expect(resolved.primary.light).toBe(PLATFORM.primaryLight)
+    expect(resolved.warnings.length).toBeGreaterThan(0)
+  })
+
+  it('resolves preset ⊕ override end-to-end: labels filled, dark derived, source tracked', async () => {
+    const override = { vocabulary: { bib_label: 'Nombor Larian' } }
+    const resolved = await getResolvedTheme(
+      fakeSupabase({ id: PRESET_ID, tokens: BATIK }),
+      eventRow(override),
+    )
+    // light = oklch string of the validated HEX
+    expect(resolved.primary.light).toBe(oklchToString(hexToOklch('#9C4A1A')))
+    // dark = deriveDarkVariant (same hue, L clamp [0.68, 0.82], C ×0.85 cap 0.20)
+    expect(resolved.primary.dark).toBe(deriveDarkVariant('#9C4A1A'))
+    // labels: override wins, preset survives, platform fallback fills the rest
+    expect(resolved.labels.bib_label).toBe('Nombor Larian')
+    expect(resolved.labels.medal_label).toBe('Pingat')
+    expect(resolved.labels.checkpoint_label).toBe('Checkpoint')
+    expect(resolved.labels.certificate_label).toBe('Certificate')
+    // source
+    expect(resolved.source.presetId).toBe(PRESET_ID)
+    expect(resolved.source.overriddenKeys).toEqual(['vocabulary.bib_label'])
+  })
+
+  it('null override key → platform default color', async () => {
+    const resolved = await getResolvedTheme(
+      fakeSupabase({ id: PRESET_ID, tokens: BATIK }),
+      eventRow({ colors: { primary: null } }),
+    )
+    expect(resolved.primary.light).toBe(PLATFORM.primaryLight)
+    expect(resolved.secondary.light).toBe(oklchToString(hexToOklch('#3E2C23')))
+  })
+
+  it('malformed override HEX degrades to platform + warning', async () => {
+    const resolved = await getResolvedTheme(
+      fakeSupabase({ id: PRESET_ID, tokens: BATIK }),
+      eventRow({ colors: { primary: 'not-a-hex' } }),
+    )
+    expect(resolved.primary.light).toBe(PLATFORM.primaryLight)
+    expect(resolved.warnings.some((w) => w.includes('colors.primary'))).toBe(true)
+    // degraded keys do not count as overridden
+    expect(resolved.source.overriddenKeys).toEqual([])
+  })
+
+  it('contrast precheck: primary <3:1 vs platform background degrades; ring only warns', async () => {
+    const resolved = await getResolvedTheme(
+      fakeSupabase({ id: PRESET_ID, tokens: BATIK }),
+      eventRow({ colors: { primary: '#949494', ring: '#949494' } }),
+    )
+    // 2.91:1 vs the light platform background (#fafafa, color.ts
+    // PLATFORM_BG_HEX). #909090 was the original probe but sits at 3.06:1 vs
+    // the true background — inside the 3.0–3.06 band where the old #f4f4f4
+    // proxy disagreed with the save-gate; #949494 degrades under both.
+    expect(resolved.primary.light).toBe(PLATFORM.primaryLight)
+    expect(resolved.warnings.some((w) => w.includes('colors.primary') && w.includes('contrast'))).toBe(true)
+    // ring keeps the themed color, warning only
+    expect(resolved.ring.light).toBe(oklchToString(hexToOklch('#949494')))
+    expect(resolved.warnings.some((w) => w.includes('colors.ring'))).toBe(true)
+  })
+
+  it('fg pairing: fgLight from pickForeground(HEX); fgDark assigned directly, never derived from oklch', async () => {
+    const resolved = await getResolvedTheme(
+      fakeSupabase({ id: PRESET_ID, tokens: BATIK }),
+      eventRow({ colors: { primary: '#777777', secondary: '#3E2C23' } }),
+    )
+    // mid-tone: passes the 3:1 fill-vs-background gate (4.29:1 vs #fafafa) but
+    // white text on it is <4.5:1 → pickForeground returns the dark fg companion
+    expect(resolved.primary.fgLight).toBe('oklch(0.145 0 0)')
+    // carried requirement (Task 6 review): dark fg is the platform constant,
+    // NOT pickForeground of the dark oklch string (parseHex is HEX-only)
+    expect(resolved.primary.fgDark).toBe('oklch(0.145 0 0)')
+    // dark preset wood color → white foreground in light mode
+    expect(resolved.secondary.fgLight).toBe('#ffffff')
+    expect(resolved.secondary.fgDark).toBe('oklch(0.145 0 0)')
+  })
+
+  it('optional background/foreground slots: valid HEX → oklch, else null (platform)', async () => {
+    const ok = await getResolvedTheme(
+      fakeSupabase({ id: PRESET_ID, tokens: BATIK }),
+      eventRow({ colors: { background: '#FBF6EC', foreground: '#2B2118' } }),
+    )
+    expect(ok.background).toEqual({ light: oklchToString(hexToOklch('#FBF6EC')), dark: null })
+    expect(ok.foreground).toEqual({ light: oklchToString(hexToOklch('#2B2118')), dark: null })
+
+    const bad = await getResolvedTheme(
+      fakeSupabase({ id: PRESET_ID, tokens: BATIK }),
+      eventRow({ colors: { background: '#zzzzzz' } }),
+    )
+    expect(bad.background).toEqual({ light: null, dark: null })
+    expect(bad.warnings.some((w) => w.includes('colors.background'))).toBe(true)
+  })
+
+  it('fonts: https URLs kept, non-https dropped + warning', async () => {
+    const resolved = await getResolvedTheme(
+      fakeSupabase({ id: PRESET_ID, tokens: BATIK }),
+      eventRow({
+        typography: { heading_font_url: 'http://evil.com/x.woff2', body_font_url: 'https://fonts.gstatic.com/b.woff2' },
+      }),
+    )
+    expect(resolved.fonts.heading).toBeNull()
+    expect(resolved.fonts.body).toBe('https://fonts.gstatic.com/b.woff2')
+    expect(resolved.warnings.some((w) => w.includes('typography.heading_font_url'))).toBe(true)
+  })
+
+  it('fuzz: malformed theme_config shapes never throw', async () => {
+    for (const cfg of [42, 'x', [], { colors: 5 }, { vocabulary: { bib_label: 42 } }, { colors: { primary: { deep: true } } }]) {
+      const resolved = await getResolvedTheme(
+        fakeSupabase({ id: PRESET_ID, tokens: BATIK }),
+        eventRow(cfg),
+      )
+      expect(resolved.primary).toBeTruthy()
+      expect(resolved.labels.bib_label).toBeTruthy()
+    }
+  })
+})
diff --git a/tests/theme/save-event-theme.test.ts b/tests/theme/save-event-theme.test.ts
new file mode 100644
index 0000000..694f03c
--- /dev/null
+++ b/tests/theme/save-event-theme.test.ts
@@ -0,0 +1,180 @@
+import { describe, it, expect, vi, beforeEach } from 'vitest'
+
+/**
+ * saveEventTheme action pins — plan Task 13 Step 1 + carried requirements:
+ *  - unauthenticated → error (never a write)
+ *  - non-owner → error (Task 2 anti-IDOR carry: the BFF path owns the
+ *    ownership check — the 077 trigger bypasses postgres/service_role)
+ *  - preset reference must be system OR owned by the caller's organizer
+ *  - primary <3:1 vs platform background → blocked w/ structured errors
+ *    (client-side validation is UX only — server re-validates, Task 9 carry)
+ *  - happy path → BOTH columns written + revalidate of organizer, runner
+ *    event, and leaderboard paths (Task 12 carry)
+ */
+
+const { requireAuth, revalidatePath, updatePayload, updateError } = vi.hoisted(() => ({
+  requireAuth: vi.fn(),
+  revalidatePath: vi.fn(),
+  updatePayload: vi.fn(),
+  updateError: vi.fn(),
+}))
+
+vi.mock('@/lib/auth/requireUser', () => ({ requireAuth }))
+vi.mock('next/cache', () => ({ revalidatePath }))
+// actions.ts's module graph pulls server-only modules (supabase/server via
+// createClient, subscription) — never exercised here, stubbed out.
+vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
+vi.mock('@/lib/subscription', () => ({ getOrganizerSubscriptionPrice: vi.fn() }))
+
+type Row = unknown
+
+function makeSupabase(opts: { event?: Row; preset?: Row } = {}) {
+  return {
+    from: (table: string) => ({
+      select: () => ({
+        eq: () => ({
+          single: async () => ({ data: table === 'events' ? (opts.event ?? null) : null, error: null }),
+          maybeSingle: async () => ({
+            data: table === 'theme_presets' ? (opts.preset ?? null) : null,
+            error: null,
+          }),
+        }),
+      }),
+      update: (payload: Record<string, unknown>) => {
+        updatePayload(payload)
+        return { eq: async () => ({ error: updateError() }) }
+      },
+    }),
+  }
+}
+
+const OWNER = { id: 'user-1', app_metadata: { organizer_id: 'org-1' } }
+const OWNED_EVENT = { id: 'event-1', organizer_id: 'org-1' }
+const SYSTEM_PRESET = { id: 'preset-1', kind: 'system', organizer_id: null }
+
+const { saveEventTheme } = await import('@/components/events/actions')
+
+beforeEach(() => {
+  requireAuth.mockReset()
+  revalidatePath.mockReset()
+  updatePayload.mockReset()
+  updateError.mockReset()
+  updateError.mockReturnValue(null)
+})
+
+describe('saveEventTheme', () => {
+  it('unauthenticated → error (requireAuth redirect propagates), never writes', async () => {
+    requireAuth.mockRejectedValue(new Error('NEXT_REDIRECT'))
+    await expect(
+      saveEventTheme('event-1', { theme_preset_id: null, theme_config: null }),
+    ).rejects.toThrow()
+    expect(updatePayload).not.toHaveBeenCalled()
+  })
+
+  it('non-owner → error, never writes (anti-IDOR carry)', async () => {
+    requireAuth.mockResolvedValue({
+      supabase: makeSupabase({ event: { id: 'event-1', organizer_id: 'org-OTHER' } }),
+      user: OWNER,
+    })
+    const result = await saveEventTheme('event-1', { theme_preset_id: null, theme_config: null })
+    expect(result.ok).toBe(false)
+    expect((result as { error: string }).error).toMatch(/organize/i)
+    expect(updatePayload).not.toHaveBeenCalled()
+  })
+
+  it('caller without an organizer profile → error, never writes', async () => {
+    requireAuth.mockResolvedValue({
+      supabase: makeSupabase({ event: OWNED_EVENT }),
+      user: { id: 'user-1', app_metadata: {} },
+    })
+    const result = await saveEventTheme('event-1', { theme_preset_id: null, theme_config: null })
+    expect(result.ok).toBe(false)
+    expect(updatePayload).not.toHaveBeenCalled()
+  })
+
+  it('preset reference that is not system and not owned → error, never writes', async () => {
+    requireAuth.mockResolvedValue({
+      supabase: makeSupabase({
+        event: OWNED_EVENT,
+        preset: { id: 'preset-x', kind: 'organizer', organizer_id: 'org-OTHER' },
+      }),
+      user: OWNER,
+    })
+    const result = await saveEventTheme('event-1', {
+      theme_preset_id: 'preset-x',
+      theme_config: null,
+    })
+    expect(result.ok).toBe(false)
+    expect((result as { error: string }).error).toMatch(/preset/i)
+    expect(updatePayload).not.toHaveBeenCalled()
+  })
+
+  it('primary <3:1 vs platform background → blocked with structured error, never writes', async () => {
+    requireAuth.mockResolvedValue({
+      supabase: makeSupabase({ event: OWNED_EVENT, preset: SYSTEM_PRESET }),
+      user: OWNER,
+    })
+    const result = await saveEventTheme('event-1', {
+      theme_preset_id: 'preset-1',
+      theme_config: { colors: { primary: '#FFD700' } },
+    })
+    expect(result.ok).toBe(false)
+    expect((result as { error: string }).error).toMatch(/colors\.primary.*contrast/i)
+    expect(updatePayload).not.toHaveBeenCalled()
+  })
+
+  it('happy path → both columns written + revalidates organizer, runner event, leaderboard', async () => {
+    requireAuth.mockResolvedValue({
+      supabase: makeSupabase({ event: OWNED_EVENT, preset: SYSTEM_PRESET }),
+      user: OWNER,
+    })
+    const config = { colors: { primary: '#00807A' }, vocabulary: { medal_label: 'Pingat' } }
+    const result = await saveEventTheme('event-1', { theme_preset_id: 'preset-1', theme_config: config })
+    expect(result.ok).toBe(true)
+    expect(updatePayload).toHaveBeenCalledWith({
+      theme_preset_id: 'preset-1',
+      theme_config: config,
+    })
+    expect(revalidatePath).toHaveBeenCalledWith('/organizer/events/event-1')
+    expect(revalidatePath).toHaveBeenCalledWith('/runner/events/event-1')
+    expect(revalidatePath).toHaveBeenCalledWith('/runner/leaderboard')
+  })
+
+  it('happy path with a low-contrast secondary → ok:true with structured warnings', async () => {
+    requireAuth.mockResolvedValue({
+      supabase: makeSupabase({ event: OWNED_EVENT, preset: SYSTEM_PRESET }),
+      user: OWNER,
+    })
+    const result = await saveEventTheme('event-1', {
+      theme_preset_id: null,
+      theme_config: { colors: { primary: '#00807A', secondary: '#FFD700' } },
+    })
+    expect(result.ok).toBe(true)
+    expect((result as { warnings: string[] }).warnings.some((w) => w.includes('colors.secondary'))).toBe(true)
+    expect(updatePayload).toHaveBeenCalled()
+  })
+
+  it('full reset (null/null) is a valid write', async () => {
+    requireAuth.mockResolvedValue({
+      supabase: makeSupabase({ event: OWNED_EVENT }),
+      user: OWNER,
+    })
+    const result = await saveEventTheme('event-1', { theme_preset_id: null, theme_config: null })
+    expect(result.ok).toBe(true)
+    expect(updatePayload).toHaveBeenCalledWith({ theme_preset_id: null, theme_config: null })
+  })
+
+  it('DB write error → structured error', async () => {
+    requireAuth.mockResolvedValue({
+      supabase: makeSupabase({ event: OWNED_EVENT }),
+      user: OWNER,
+    })
+    updateError.mockReturnValue({ message: 'check constraint violated' })
+    const result = await saveEventTheme('event-1', {
+      theme_preset_id: null,
+      theme_config: { colors: { primary: '#00807A' } },
+    })
+    expect(result.ok).toBe(false)
+    expect((result as { error: string }).error).toMatch(/check constraint/i)
+  })
+})
diff --git a/tests/theme/theme-editor.test.tsx b/tests/theme/theme-editor.test.tsx
new file mode 100644
index 0000000..5b556f2
--- /dev/null
+++ b/tests/theme/theme-editor.test.tsx
@@ -0,0 +1,98 @@
+import { describe, it, expect, vi } from 'vitest'
+import { prerender } from 'react-dom/static'
+import { MiniThemePreview } from '@/components/theme/mini-theme-preview'
+import { ThemeEditor } from '@/components/theme/theme-editor'
+import { deriveTheme } from '@/lib/theme/resolve'
+import type { ThemeTokens } from '@/lib/theme/types'
+
+/**
+ * Task 13 render smoke (prerender convention from event-theme-scope.test.tsx):
+ * the gallery cards + live preview render through the SAME `.event-theme`
+ * engine, and the editor mounts read-only vs editable without crashing.
+ * The interactive click-through (save → runner page themed) stays a manual
+ * smoke — see task-13 report.
+ */
+
+const EVENT_ID = '9b2f4c1e-abcd-4321-9876-abcdef012345'
+const PRESET_ID = '11111111-1111-1111-1111-111111111111'
+
+const BATIK: ThemeTokens = {
+  colors: { primary: '#9C4A1A', secondary: '#3E2C23', accent: '#D4A017', ring: '#C68B2E' },
+  vocabulary: { medal_label: 'Pingat', checkpoint_label: 'Kampung' },
+  meta: { version: 1 },
+}
+
+const PRESETS = [{ id: PRESET_ID, name: 'Batik Heritage', tokens: BATIK }]
+
+async function toHtml(node: React.ReactElement): Promise<string> {
+  const { prelude } = await prerender(node)
+  let html = ''
+  const reader = prelude.getReader()
+  const decoder = new TextDecoder()
+  for (;;) {
+    const { done, value } = await reader.read()
+    if (done) break
+    html += decoder.decode(value, { stream: true })
+  }
+  return html + decoder.decode()
+}
+
+// saveEventTheme is a 'use server' action whose module graph pulls
+// server-only modules — never executed in these render smokes.
+vi.mock('@/components/events/actions', () => ({ saveEventTheme: vi.fn() }))
+vi.mock('@/components/events/event-tabs', () => ({ useThemeDirtyReporter: () => null }))
+
+describe('MiniThemePreview (SSR through the .event-theme engine)', () => {
+  it('renders the themed scope with inline --et-* vars (two-arg buildStyleVars)', async () => {
+    const resolved = deriveTheme(BATIK, null, PRESET_ID)
+    const html = await toHtml(<MiniThemePreview resolved={resolved} eventId={EVENT_ID} />)
+    expect(html).toContain('event-theme')
+    expect(html).toContain('--et-primary:oklch(')
+    // whitelist consumption via Tailwind classes, not ad-hoc token mapping
+    expect(html).toContain('bg-primary')
+  })
+
+  it('shows resolved vocabulary (fallbacks filled) as text', async () => {
+    const resolved = deriveTheme(BATIK, null, PRESET_ID)
+    const html = await toHtml(<MiniThemePreview resolved={resolved} />)
+    expect(html).toContain('Kampung')
+    expect(html).toContain('Pingat')
+    expect(html).toContain('Bib Number')
+  })
+})
+
+describe('ThemeEditor (SSR mount smoke)', () => {
+  it('editable mode: gallery + color rows + vocab + save bar render', async () => {
+    const html = await toHtml(
+      <ThemeEditor
+        eventId={EVENT_ID}
+        canEdit
+        savedPresetId={PRESET_ID}
+        savedConfig={null}
+        presets={PRESETS}
+      />,
+    )
+    expect(html).toContain('Batik Heritage')
+    for (const role of ['Primary', 'Secondary', 'Accent', 'Ring']) {
+      expect(html).toContain(role)
+    }
+    expect(html).toContain('Save theme')
+    // Batik preset selected → its vocabulary seeds the live label preview
+    expect(html).toContain('Your Kampung #1234')
+    expect(html).toContain('Your Bib Number #1234')
+  })
+
+  it('read-only mode (non-owner): banner shown, no save button', async () => {
+    const html = await toHtml(
+      <ThemeEditor
+        eventId={EVENT_ID}
+        canEdit={false}
+        savedPresetId={null}
+        savedConfig={null}
+        presets={PRESETS}
+      />,
+    )
+    expect(html).toContain('read-only')
+    expect(html).not.toContain('Save theme')
+  })
+})
diff --git a/tests/theme/validate.test.ts b/tests/theme/validate.test.ts
new file mode 100644
index 0000000..a6bed38
--- /dev/null
+++ b/tests/theme/validate.test.ts
@@ -0,0 +1,222 @@
+import { describe, it, expect } from 'vitest'
+import { validateThemeConfig } from '@/lib/theme/validate'
+import { PLATFORM_BG_HEX, contrastRatio } from '@/lib/theme/color'
+import type { ThemeTokens } from '@/lib/theme/types'
+
+// Full valid config — Batik Heritage palette (§4.6 family), every section
+// populated, all colors clear the §5.5 gate vs the platform background.
+const FULL: ThemeTokens = {
+  colors: {
+    primary: '#9C4A1A', // 5.90:1 vs #fafafa
+    secondary: '#3E2C23', // 12.66:1
+    accent: '#8C6D1F', // 4.65:1
+    ring: '#9C4A1A',
+    background: '#FBF6EC', // tint L 0.974 ∈ [0.93, 0.995]
+    foreground: '#2B2118',
+  },
+  typography: {
+    heading_font_url: 'https://fonts.gstatic.com/s/heading.woff2',
+    body_font_url: 'https://fonts.gstatic.com/s/body.woff2',
+  },
+  assets: {
+    banner_url:
+      'organizers/00000000-0000-0000-0000-000000000000/events/11111111-1111-1111-1111-111111111111/banner.png',
+    logo_url: 'https://cdn.example.com/logo.png',
+  },
+  vocabulary: {
+    bib_label: 'Nombor',
+    checkpoint_label: 'Checkpoint',
+    medal_label: 'Pingat',
+    run_label: 'Larian',
+    participant_label: 'Peserta',
+    certificate_label: 'Sijil',
+  },
+  meta: { version: 1 },
+}
+
+function errorFor(config: unknown, fragment: string): string | undefined {
+  return validateThemeConfig(config).errors.find((e) => e.includes(fragment))
+}
+
+describe('DB validator mirror (076 non-strict mode — events.theme_config CHECK)', () => {
+  it('accepts minimal {} and column-NULL inputs (null/undefined)', () => {
+    for (const empty of [{}, null, undefined]) {
+      expect(validateThemeConfig(empty)).toEqual({ ok: true, errors: [], warnings: [] })
+    }
+  })
+
+  it('accepts the full valid token set with zero errors and zero warnings', () => {
+    expect(validateThemeConfig(FULL)).toEqual({ ok: true, errors: [], warnings: [] })
+  })
+
+  it('accepts partial configs (any subset of sections and leaves)', () => {
+    expect(validateThemeConfig({ colors: { primary: '#9C4A1A' } }).ok).toBe(true)
+    expect(
+      validateThemeConfig({ typography: { heading_font_url: 'https://fonts.gstatic.com/a.woff2' } }).ok,
+    ).toBe(true)
+    expect(validateThemeConfig({ vocabulary: { bib_label: 'Nombor' } }).ok).toBe(true)
+    expect(validateThemeConfig({ assets: { logo_url: 'organizers/x/logo.png' } }).ok).toBe(true)
+  })
+
+  it('rejects non-object configs (number, string, boolean, array)', () => {
+    for (const bad of [42, 'x', true, []]) {
+      const res = validateThemeConfig(bad)
+      expect(res.ok).toBe(false)
+      expect(res.errors.some((e) => e.includes('must be a JSON object'))).toBe(true)
+    }
+  })
+
+  it('rejects unknown keys at the top level and in every section', () => {
+    expect(errorFor({ evil: 1 }, 'theme_config.evil')).toBeDefined()
+    expect(errorFor({ colors: { evil: '#000000' } }, 'colors.evil')).toBeDefined()
+    expect(errorFor({ typography: { evil: 'https://x' } }, 'typography.evil')).toBeDefined()
+    expect(errorFor({ assets: { evil: 'a.png' } }, 'assets.evil')).toBeDefined()
+    expect(errorFor({ vocabulary: { evil: 'x' } }, 'vocabulary.evil')).toBeDefined()
+    expect(errorFor({ meta: { version: 1, evil: 2 } }, 'meta.evil')).toBeDefined()
+  })
+
+  it('rejects malformed HEX per ^#[0-9a-fA-F]{6}$ (stored-token contract)', () => {
+    for (const hex of ['not-a-hex', '#12345', '123456', '#GGGGGG', '#9C4A1A7']) {
+      expect(errorFor({ colors: { primary: hex } }, 'colors.primary')).toBeDefined()
+    }
+    // non-string leaves (numbers, booleans, objects) fail the same check
+    expect(errorFor({ colors: { primary: 5 } }, 'colors.primary')).toBeDefined()
+    expect(errorFor({ colors: { primary: { deep: true } } }, 'colors.primary')).toBeDefined()
+  })
+
+  it('rejects explicit JSON nulls at every nesting level (076 mirror)', () => {
+    // Verified against the live 076 validate_theme_tokens: jsonb 'null' is
+    // neither 'object' (sections) nor 'string' (leaves) — ALL rejected.
+    for (const section of ['colors', 'typography', 'assets', 'vocabulary', 'meta']) {
+      expect(errorFor({ [section]: null }, section)).toBeDefined()
+    }
+    expect(errorFor({ colors: { primary: null } }, 'colors.primary')).toBeDefined()
+    expect(errorFor({ typography: { heading_font_url: null } }, 'typography.heading_font_url')).toBeDefined()
+    expect(errorFor({ vocabulary: { bib_label: null } }, 'vocabulary.bib_label')).toBeDefined()
+    expect(errorFor({ meta: { version: null } }, 'meta.version')).toBeDefined()
+  })
+
+  it('rejects non-https font URLs (http:, javascript:) — https floor per §4.3', () => {
+    expect(errorFor({ typography: { heading_font_url: 'http://evil.com/x.woff2' } }, 'typography')).toBeDefined()
+    expect(errorFor({ typography: { body_font_url: 'javascript:alert(1)' } }, 'typography')).toBeDefined()
+  })
+
+  it('rejects unsafe asset values: .. traversal, off-charset, javascript:, empty', () => {
+    expect(errorFor({ assets: { banner_url: '../evil.png' } }, 'assets.banner_url')).toBeDefined()
+    expect(errorFor({ assets: { banner_url: 'has space.png' } }, 'assets.banner_url')).toBeDefined()
+    expect(errorFor({ assets: { banner_url: 'a;b.png' } }, 'assets.banner_url')).toBeDefined()
+    // ':' is off-charset, so URI schemes fail the path branch (076 semantics)
+    expect(errorFor({ assets: { banner_url: 'javascript:alert(1)' } }, 'assets.banner_url')).toBeDefined()
+    expect(errorFor({ assets: { banner_url: '' } }, 'assets.banner_url')).toBeDefined()
+  })
+
+  it('rejects vocabulary labels over the 64-char DB cap (UI enforces 40)', () => {
+    expect(validateThemeConfig({ vocabulary: { bib_label: 'a'.repeat(64) } }).ok).toBe(true)
+    expect(errorFor({ vocabulary: { bib_label: 'a'.repeat(65) } }, 'vocabulary.bib_label')).toBeDefined()
+  })
+
+  it('rejects wrong meta: version ≠ 1, string "1", missing version, non-object meta', () => {
+    expect(errorFor({ meta: { version: 2 } }, 'meta.version')).toBeDefined()
+    expect(errorFor({ meta: { version: '1' } }, 'meta.version')).toBeDefined()
+    expect(errorFor({ meta: {} }, 'meta.version')).toBeDefined()
+    expect(errorFor({ meta: 'nope' }, 'meta')).toBeDefined()
+    expect(errorFor({ meta: [] }, 'meta')).toBeDefined()
+  })
+
+  it('rejects payloads over the 64 KB JSON cap', () => {
+    // Padded via a typography URL (no per-value length cap); otherwise valid.
+    const big = {
+      typography: { heading_font_url: `https://fonts.gstatic.com/${'a'.repeat(70000)}.woff2` },
+    }
+    expect(errorFor(big, '64 KB')).toBeDefined()
+  })
+
+  it('never throws — unserializable input returns a structured error', () => {
+    const circular: Record<string, unknown> = {}
+    circular.self = circular
+    const res = validateThemeConfig(circular)
+    expect(res.ok).toBe(false)
+    expect(res.errors.length).toBeGreaterThan(0)
+  })
+})
+
+describe('WCAG contrast gate (§5.5 — vs PLATFORM_BG_HEX, shared with resolve)', () => {
+  it('hard-blocks primary <3:1 — the ONLY hard block (§13 ④)', () => {
+    const res = validateThemeConfig({ colors: { primary: '#949494' } }) // 2.91:1 vs #fafafa
+    expect(res.ok).toBe(false)
+    expect(res.errors.some((e) => e.includes('colors.primary') && e.includes('contrast'))).toBe(true)
+    expect(res.warnings.some((w) => w.includes('colors.primary'))).toBe(false)
+  })
+
+  it('pins the 3:1 boundary to the shared #fafafa background', () => {
+    // #919191 = 3.02:1 vs #fafafa → passes. Under the old #f4f4f4 proxy it
+    // measured 2.87:1 (blocked) — this pair pins the carried shared-constant
+    // decision (save-gate ↔ render-degrade agreement).
+    expect(validateThemeConfig({ colors: { primary: '#919191' } }).ok).toBe(true)
+    expect(validateThemeConfig({ colors: { primary: '#929292' } }).ok).toBe(false) // 2.98:1
+  })
+
+  it('does NOT block #777777 — plan Task 9 example conflicts with WCAG math', () => {
+    // Plan Task 9 lists "#777777 primary on white → blocked (<3:1)", but the
+    // WCAG 2.1 ratio is 4.48:1 vs white / 4.29:1 vs #fafafa — ≥3:1. Spec §5.5
+    // (locked gate) wins; Task 7's reviewed resolve test pins the same
+    // #777777-passes behavior. Conflict recorded in the Task 9 report.
+    expect(contrastRatio('#777777', PLATFORM_BG_HEX)).toBeGreaterThanOrEqual(3)
+    expect(validateThemeConfig({ colors: { primary: '#777777' } }).ok).toBe(true)
+  })
+
+  it('accepts the Batik pairing: #9C4A1A primary on #FBF6EC (≈5.7:1 vs themed bg)', () => {
+    // ≈5.72:1 against the Batik background; the gate itself measures vs the
+    // platform background (#fafafa, 5.90:1) — OK either way, no errors.
+    const res = validateThemeConfig({ colors: { primary: '#9C4A1A', background: '#FBF6EC' } })
+    expect(res).toEqual({ ok: true, errors: [], warnings: [] })
+  })
+
+  it('warn-and-degrades secondary/accent <3:1 (ok:true, warnings only)', () => {
+    const secondary = validateThemeConfig({ colors: { secondary: '#949494' } })
+    expect(secondary.ok).toBe(true)
+    expect(secondary.errors).toEqual([])
+    expect(secondary.warnings.some((w) => w.includes('colors.secondary') && w.includes('contrast'))).toBe(true)
+
+    // the real Batik accent — gold on light background
+    const accent = validateThemeConfig({ colors: { accent: '#D4A017' } }) // 2.28:1
+    expect(accent.ok).toBe(true)
+    expect(accent.warnings.some((w) => w.includes('colors.accent') && w.includes('contrast'))).toBe(true)
+  })
+
+  it('warns (recommended) for ring <3:1, never blocks', () => {
+    const res = validateThemeConfig({ colors: { ring: '#949494' } })
+    expect(res.ok).toBe(true)
+    expect(res.errors).toEqual([])
+    expect(res.warnings.some((w) => w.includes('colors.ring') && w.includes('contrast'))).toBe(true)
+  })
+
+  it('emits no contrast noise when colors are absent', () => {
+    expect(validateThemeConfig({ vocabulary: { bib_label: 'Nombor' } }).warnings).toEqual([])
+  })
+})
+
+describe('background tint gate (§5.5.1 — oklch L windows)', () => {
+  it('accepts light and dark tints without warning', () => {
+    // light tint: Batik bg (L 0.974); the platform bg itself (L 0.985);
+    // dark tint: L 0.115 ∈ [0.05, 0.12]
+    for (const background of ['#FBF6EC', '#FAFAFA', '#050505']) {
+      const res = validateThemeConfig({ colors: { background } })
+      expect(res.warnings).toEqual([])
+    }
+  })
+
+  it('warns + will-ignore outside the tint windows (mid-tone or pure black)', () => {
+    const mid = validateThemeConfig({ colors: { background: '#FFD700' } }) // L 0.887
+    expect(mid.ok).toBe(true)
+    expect(mid.warnings.some((w) => w.includes('colors.background') && w.includes('tint'))).toBe(true)
+
+    const black = validateThemeConfig({ colors: { background: '#000000' } }) // L 0 < 0.05
+    expect(black.warnings.some((w) => w.includes('colors.background'))).toBe(true)
+  })
+
+  it('applies no tint window to colors.foreground (no gate in §5.5)', () => {
+    const res = validateThemeConfig({ colors: { foreground: '#FFD700' } })
+    expect(res.warnings).toEqual([])
+  })
+})


### .superpowers/sdd/2026-10-28-event-themes-p1/progress.md

# SDD ledger — plan: /home/hfizmzr/pelikat/docs/superpowers/plans/2026-10-28-event-themes-p1.md

## Execution mode (user-mandated)
- Direct In-Place: work in /home/hfizmzr/pelikat/pelikat-web (main branch) and /home/hfizmzr/pelikat/pelikat-api (master branch). NO worktrees, NO branch creation, NO push. Commits land on local main/master. User consented explicitly.

## Pre-execution conflict scan (controller, from plan text)
| Pair | Produces → Consumes | Finding |
| T6→T7 | color.ts helpers → resolve.ts | signatures pinned in briefs; consistent |
| T6→T9 | contrast helpers → validate.ts | consistent |
| T9→T13 | validateThemeConfig → saveEventTheme | name pinned; consistent |
| T7→T9/T10/T11 | ThemeTokens/BrandSlot shapes → consumers | consistent |
| T10→T11 | buildStyleVars → EventThemeScope | consistent; globals.css touched only by T10 |
| T1–T5 | migrations 076–079 sequential; T5 edits setup-storage.sql only | no overlap |
| T11/T12 | runner page vs leaderboard — different files | no overlap |
Scan clean; no contradictions with Global Constraints found.

## Rulings
- Ruling: controller has no shell/file-write primitive — skill scripts (task-brief, review-package), ledger appends, and workspace writes are executed by subagent dispatches on the controller's behalf; controller composes every ledger line verbatim.
- Ruling: commits go directly to local main (pelikat-web) / master (pelikat-api) per user's Direct In-Place mandate; no push, no PR until user asks. Cost if wrong: user wanted feature-branch flow anyway — visible in git log, easily undone.
- Ruling: Task 0 (verification-only, produces no commits) review = controller-verifiable evidence in implementer report (commands + outputs), reviewed by @reviewer reading brief+report without a diff package. Cost if wrong: minimal, evidence is textual.

## Task status
- Task 0: IN PROGRESS (pre-flight)
- Task 0: complete (verification-only, no commits; all four pre-flight checks green — see task-0-report)
- Task 1: IN PROGRESS (migration 076)
- Task 1: implementer DONE (commits b0a20fd..176392c)
- Task 1: complete (commits b0a20fd..176392c, review clean; 3 minors deferred, 1 pinned to Task 9)
- Task 1: minor (deferred): §12.2/RLS matrix evidence transcribed tables not raw psql dumps — reviewer live-probed equivalents
- Task 1: minor (deferred): untracked supabase/.branches/ CLI artifact — add to .gitignore
- Task 1: pinned→Task 9: DB-layer '..' check bypassed by https://host/../x (charset applies to relative paths only) — origin allowlist must be enforced at app layer per spec §5.4
- Task 1: Ruling: fix commits 684acfb+7a60ad7 accepted — pre-existing local-replay bugs (039 drop-first; 062/063 duplicate versions renumbered 0625_/0635_) blocked the mandated db reset gate; cloud drift MCP-verified; consequence: 076-079 reach cloud via MCP apply_migration ONLY, never db push
- Task 2: IN PROGRESS (migration 077)
- Task 2: implementer DONE (commits 176392c..6d1ca10)
- Task 2: complete (commits 176392c..6d1ca10, review clean; 1 carried requirement → Task 13, 1 minor deferred)
- Task 2: carried→Task 13: saveEventTheme MUST verify preset ownership server-side (077 anti-IDOR trigger bypasses postgres/service_role per 070 precedent — BFF path has no DB-level ownership check)
- Task 2: minor (deferred): matrix evidence transcribed not raw psql dumps (same pattern as Task 1)
- Task 2: Ruling: user overrode Direct-In-Place commit policy after Task 2 — no commits on main/master, no push; Tasks 1-2 commits (684acfb, 7a60ad7, 176392c, 6d1ca10) moved to feat/event-themes-p1; local main reset to origin/main; pelikat-api master untouched; all further work commits on feat/event-themes-p1
- Task 3: IN PROGRESS (migration 078) — on feat/event-themes-p1
- Task 3: implementer DONE (commits 6d1ca10..91d8d13)
- Task 3: complete (commits 6d1ca10..91d8d13, review clean; 3 minors deferred, 2 carried requirements)
- Task 3: minor (deferred): 078:109 NULL-unsafe status gate (v_status <> 'published'/'closed') — NULL-status event resolvable by owner only; harden with IS DISTINCT FROM at Task 14 phase gate
- Task 3: minor (deferred): 078:113 NULL-unsafe organizer comparison when event.organizer_id NULL — trusted-role-only reachability; harden at Task 14
- Task 3: minor (deferred): 078 header comment overclaims nested-null removal depth — unreachable via RPC; optional jsonb_strip_nulls future-proofing
- Task 3: carried→Task 13: theme_config cannot carry JSON nulls (076 validator); per-key reset = omit key server-side; whole-section null ({"colors": null}) IS storable = section-level reset-to-platform
- Task 3: carried→P2: is_active deactivation semantics undefined in spec; one-line filter if preset retirement ships
- Task 4: IN PROGRESS (migration 079)
- Task 4: implementer DONE (commits 91d8d13..334aa0f)
- Task 4: complete (commits 91d8d13..334aa0f, review clean; 1 warning noted, 3 carried requirements)
- Task 4: carried→Task 8: labels.ts must ship bib→"Bib Number" fallback (Batik preset depends on it)
- Task 4: carried→P2 gate: revisit typography/asset stubs for all six presets (§4.2 has no font-family key; fonts are P2 scope)
- Task 4: carried→Task 14 phase gate: acknowledge 079 on-conflict (slug) silent-skip trade-off
- Task 5: IN PROGRESS (storage addendum)
- Task 5: implementer DONE (commits 334aa0f..de09dc4)
- Task 5: complete (commits 334aa0f..de09dc4, review clean; 3 minors deferred, 2 carried requirements)
- Task 5: minor (deferred): seed.sql do-update upsert clobbers bucket config on every reset — footgun if config intentionally diverges later
- Task 5: minor (deferred): get_my_organizer_id() called twice in helper (nit); local probe row self-heals at next reset
- Task 5: carried→Task 14: setup-storage.sql whole-file replay aborts ~line 63 (pre-existing 041 policy dup) — fix with drop-guards or align; cloud apply must be addendum-section or per-statement-tolerant psql
- Task 5: carried→P2: uploader must send x-upsert header (query-param upsert 409s on this storage version)
- Task 6: IN PROGRESS (vendored color.ts TDD)
- Task 6: implementer DONE (commits de09dc4..5006a78)
- Task 6: complete (commits de09dc4..5006a78, review clean; 2 minors deferred, 3 carried requirements)
- Task 6: minor (deferred): chroma-cap branch untested (no C>0.235 vector) — add deriveDarkVariant('#FF0000')→c=0.2 test at next touch
- Task 6: carried→Task 7: fgDark = 'oklch(0.145 0 0)' directly in resolve.ts — NEVER call pickForeground on oklch strings (parseHex is HEX-only); dark variants always ≥~6.9:1 vs dark fg
- Task 6: carried→Task 10: buildStyleVars treats dark slots as opaque oklch() strings (not HEX)
- Task 7: IN PROGRESS (types.ts + resolve.ts)
- Task 7: implementer DONE (commits 5006a78..9cb5f13)
- Task 7: complete (commits 5006a78..9cb5f13, review clean; 1 warning carried to Task 9, carries to Tasks 8/10)
- Task 7: carried→Task 8: replace inline LABEL_FALLBACKS in resolve.ts with labels.ts fallbackLabel/resolveLabels; wire sanitizeLabel into resolve
- Task 7: carried→Task 9: validate.ts MUST use the same platform-background decision as resolve precheck (#f4f4f4 proxy vs true #fafafa — boundary band 3.0-3.06:1 disagree risk); fix the resolve.ts comment when aligning
- Task 7: carried→Task 10: font origin allowlist (platform storage origin + fonts.gstatic.com, https) + .woff2 extension + URL escaping MUST be enforced in buildFontFace — resolve's https-only floor is not the boundary
- Task 7: minor (deferred): PLATFORM_BG_HEX comment claims delta <0.1% — actually dY=0.051 (true bg ~ #fafafa); fix comment at Task 9 alignment
- Task 8: IN PROGRESS (labels.ts)
- Task 8: implementer DONE (commits 9cb5f13..201eb6b)
- Task 8: complete (commits 9cb5f13..201eb6b, review clean; 2 minors deferred)
- Task 8: minor (deferred): DEL (U+007F) passes through sanitizeLabel — C0-only per spec; revisit only if spec broadens control-char definition
- Task 8: minor (deferred): LABEL_MAX (40) private — expose for Task 13 editor live-cap only if its brief requires
- Task 9: IN PROGRESS (validate.ts + shared background alignment)
- Task 9: implementer DONE (commits 201eb6b..8212cec)
- Task 9: complete (commits 201eb6b..8212cec, review clean; 3 minors deferred, 5 carries to Task 13)
- Task 9: ruling: plan Task 9 boundary example "#777777 primary on white -> blocked" is mathematically wrong (4.29-4.48:1 passes) — implemented per spec §5.5 with conflict-note test; plan text amended by this ruling
- Task 9: minor (deferred): no render-side in-band (3.0-3.06:1) kept-pin test — optional one-liner
- Task 9: carried→Task 13: reset = omit keys (JSON nulls rejected every level; full reset writes theme_config null); saveEventTheme re-calls validateThemeConfig server-side; structured warnings/errors render as text children; 40-char UI label cap for editor live-meter
- Task 10: IN PROGRESS (css.ts + event-theme.css + globals.css import)
- Task 10: implementer DONE (commits 8212cec..b508953)
- Task 10: complete (commits 8212cec..b508953, review clean; 2 minors deferred, 1 binding carry to Task 11)
- Task 10: minor (deferred): %2e%2e%2f traversal corner in css.ts:85 (host-pinned, bounded) — extend follower class with %2f at next touch/Task 14
- Task 10: minor (deferred): belt-check substring list omits --foreground (redundant with exact check) — add next touch
- Task 10: carried→Task 11 (BINDING): buildStyleVars(resolved, event.id) + buildFontFace(event.id, resolved.fonts.heading) — single-arg pin superseded; without event.id font vars never emit
- Task 11: IN PROGRESS (EventThemeScope + runner page)
- Task 11: implementer DONE (commits b508953..309960c)
- Task 11: complete (commits b508953..309960c, review clean; Docker visual smoke deferred to Task 13/14)
- Task 11: carried→Task 12 (BINDING): two-arg buildStyleVars(resolved, event.id) + buildFontFace(event.id, resolved.fonts.heading)
- Task 11: carried→Task 13/14: deferred visual FOUC smoke — seed themed event + auth'd session, first paint + dark toggle on runner page
- Task 11: minor (deferred): min-h-full wrapper no-op (actionable only if --background ever remapped inside .event-theme); isPlainObject triplicated (below reuse threshold)
- Task 12: IN PROGRESS (leaderboard theming)
- Task 12: implementer DONE (commits 309960c..209bdfe)
- Task 12: complete (commits 309960c..209bdfe, review clean; mixed-view payload guarantee to be pinned as explicit check in Task 14)
- Task 12: minor (deferred): scoped fetch swallows supabase error silently (degrades neutral, matches file style) — console.warn would aid debugging
- Task 12: minor (deferred): publication check duplicated scope.ts vs resultsLocked — accepted decoupling; add cross-reference comment next touch
- Task 13: IN PROGRESS (theme editor + saveEventTheme)
- Task 13: implementer DONE (commits 209bdfe..365e98d)
- Task 13: complete (commits 209bdfe..365e98d, review clean; RULING: section JSON nulls NOT storable — Task 3 ledger claim corrected; omit-only + SQL NULL are the only reset mechanisms; meta dropped on saves = P2 note)
- Task 13: minor (deferred→Task 14): Safari beforeunload hardening; gallery deriveTheme per-render (fine, memo optional)
- Task 13: carried→Task 14: authed click-through smoke (Batik → save → runner page themed + leaderboard revalidate) + Task 11 FOUC visual check
- Task 14: IN PROGRESS (phase gate)
- Task 14: implementer DONE (commits 365e98d..becd500)
- CR-auto fix wave 2: T4 trailing-dash fix in 080_fix_slug_base_trailing_dash (becd500..6600128)
- Ruling: 077 stays buggy in history (already cloud-applied); repair via 080 create-or-replace — cost if wrong: cloud function body drift vs repo 077 reading


### .superpowers/sdd/2026-10-28-event-themes-p1/task-0-report.md

# Task 0 report — pre-flight verification (verification-only, no commits)

Date: Wed Oct 28 2026
Executor: subagent (data-layer) dispatched by controller
Scope: read-only checks A–D + ledger setup. No code changes, no commits.

## CHECK A — Branch state — PASS

Commands:
```
git -C /home/hfizmzr/pelikat/pelikat-web branch --show-current
git -C /home/hfizmzr/pelikat/pelikat-api branch --show-current
```
Raw output:
```
--- pelikat-web ---
main
--- pelikat-api ---
master
```
Result: pelikat-web on `main`, pelikat-api on `master` — as required.

## CHECK B — Migration tip — PASS

Command:
```
ls /home/hfizmzr/pelikat/pelikat-web/supabase/migrations/ | tail -5
```
Raw output:
```
071_ic_retention_confirm_flow_reconcile.sql
072_runner_profiles_active_full_name_check.sql
073_organizer_subscription_pricing.sql
074_fix_seed_users_instance_id.sql
075_fix_seed_user_token_columns.sql
```
Result: highest numbered file is `075_fix_seed_user_token_columns.sql` — as required.

## CHECK C — Cloud DB migration state (project `ugexrrslijmwtieevjbs`) — PASS

Tool: Supabase MCP `list_migrations` with `project_id: "ugexrrslijmwtieevjbs"`.

Query: full migration list from the cloud project's migration records.

Result: 78 migrations returned; the final three entries (most recent applied) are:
```
{ "version": "20261026050041", "name": "organizer_subscription_pricing" }
{ "version": "20261026053629", "name": "fix_seed_users_instance_id" }
{ "version": "20261026054022", "name": "fix_seed_user_token_columns" }
```
These correspond 1:1 to local files `073_organizer_subscription_pricing.sql`, `074_fix_seed_users_instance_id.sql`, `075_fix_seed_user_token_columns.sql` (CHECK B). All of 073, 074, 075 are APPLIED on the cloud database.

## CHECK D — Baseline gates in pelikat-web — PASS

Setup: `pelikat-web/package.json` declares `"packageManager": "pnpm@10.33.0"` → pnpm. No `typecheck` script defined, so `tsc --noEmit` was run directly via pnpm. Test script is `"test": "vitest run"`.

### D1 — Typecheck

Command (workdir `/home/hfizmzr/pelikat/pelikat-web`):
```
pnpm exec tsc --noEmit; echo "tsc exit code: $?"
```
Raw output:
```
tsc exit code: 0
```
Result: zero errors.

### D2 — Tests

Command (workdir `/home/hfizmzr/pelikat/pelikat-web`):
```
pnpm test
```
Raw output (tail):
```
> pelikat-web@0.1.0 test /home/hfizmzr/pelikat/pelikat-web
> vitest run

 RUN  v4.1.11 /home/hfizmzr/pelikat/pelikat-web

 Test Files  27 passed (27)
      Tests  267 passed (267)
   Start at  21:31:23
   Duration  4.48s (transform 5.15s, setup 11.19s, import 7.22s, tests 1.62s, environment 30.29s)
```
Result: 267 tests passed (27 test files), 0 failures.

## Verdict

All four checks (A, B, C, D) PASS. Pre-flight is GREEN; plan execution may proceed.


### .superpowers/sdd/2026-10-28-event-themes-p1/task-1-report.md

# Task 1 Report — Migration 076 `theme_presets` + `validate_theme_tokens()`

**Implementer:** @db-specialist (subagent) · **Date:** 2026-10-28
**Status:** DONE_WITH_CONCERNS (task itself fully green; two pre-existing local-replay bugs in migration history had to be fixed to satisfy the `db reset` gate — see "Pre-existing fixes" and concerns)

## BASE commit
`b0a20fd6f42bd8b0101b966fc5b0de7777d2a1a4` (branch `main`, clean tree; `git rev-parse HEAD` recorded before any edit)

## HEAD
`176392c` — `feat(theme): 076 theme_presets + validate_theme_tokens`

## Commits (local `main`, NOT pushed — Direct In-Place mandate)
| SHA | Message | Scope |
|---|---|---|
| `684acfb` | `fix(db): drop leaderboard_virtual before 039 gender re-add so fresh replays pass (create-or-replace cannot rename view columns)` | 1 file, +5 lines (pre-existing replay bug) |
| `7a60ad7` | `fix(db): renumber duplicate 062/063 payment migrations to 0625/0635 so fresh local replays pass (schema_migrations pkey collision; contents already live on cloud, unrecorded in its history)` | 2 renames + test path update (pre-existing replay bug) |
| `176392c` | `feat(theme): 076 theme_presets + validate_theme_tokens` | Task 1 deliverable: `supabase/migrations/076_theme_presets.sql` (266 lines) |

Plan message for Task 1 used verbatim (`feat(theme): 076 theme_presets + validate_theme_tokens`).

## File created
`supabase/migrations/076_theme_presets.sql` (only file in the Task 1 commit)

### up outline (executes in this order)
1. `create or replace function public.validate_theme_tokens(tokens jsonb, p_strict boolean) returns boolean` — `language plpgsql, immutable, set search_path = ''`. Enforcement per spec §4.3 + brief:
   - 64 KB JSON cap (`octet_length(tokens::text) > 65536` → reject; boundary 65536 accepted)
   - object-shape guard (non-object jsonb → false)
   - unknown-key rejection at every level: top-level ⊆ {colors, typography, assets, vocabulary, meta}; colors ⊆ 6 spec keys; typography ⊆ 2; assets ⊆ 4; vocabulary ⊆ the fixed 6 keys; meta = exactly `{"version": 1}` (extra meta keys rejected; version must be JSON **number** 1 — string `"1"` rejected; `1.0` accepted via jsonb numeric equality)
   - HEX `^#[0-9a-fA-F]{6}$` on every colors value
   - typography values: `https://`-only (spec §4.3; origin/woff2 allowlist deliberately NOT in the DB validator — enforced at save/resolve in `src/lib/theme` per §5.4, where the platform storage origin is known; noted in the migration header)
   - assets values: relative bucket paths must match charset `[A-Za-z0-9/_.-]+` with no `..` anywhere; or full `https://` URLs (`:` is off-charset, so `http://`/`javascript:` URIs in asset fields are rejected)
   - vocabulary values: text ≤ 64 chars (DB cap; UI enforces 40)
   - strict mode (`true`, used by the table CHECK): colors section required with `primary`/`secondary`/`accent` required (spec §4.2 "HEX required") + `meta` required
   - non-strict (`false`, for 077's `events.theme_config`): all sections optional, all provided keys validated
2. `create table public.theme_presets` — `id` uuid PK default `gen_random_uuid()`, `slug` text not null unique, `name` text not null, `description` text, `kind` text not null default 'system' CHECK in ('system','organizer'), `organizer_id` uuid FK→`organizers(id)` ON DELETE CASCADE, `tokens` jsonb not null CHECK (`theme_presets_tokens_valid` → `validate_theme_tokens(tokens, true)`), `is_active` bool not null default true, `created_at`/`updated_at` timestamptz not null default now(), plus `theme_presets_kind_organizer_match` CHECK enforcing **NULL ⇔ system** ((system ∧ organizer_id IS NULL) ∨ (organizer ∧ organizer_id IS NOT NULL)).
3. `create index theme_presets_organizer_id_idx` on `(organizer_id)`.
4. RLS enabled + 6 policies: system presets publicly readable (`to anon, authenticated using (kind='system')`); organizer own-read/insert/update/delete (`to authenticated`, ownership via `get_my_organizer_id()`, insert/update `with check (kind='organizer' and organizer_id=get_my_organizer_id())` → blocks `kind='system'` spoofing AND `organizer_id` reassignment); admin manage-all (`is_admin()` with+check).
5. Grants: `select` to anon+authenticated; `insert, update, delete` to authenticated (service_role bypasses RLS for 079 seeds / cert pipeline).

### down outline (commented, reverse order — repo convention 069/070/075 + plan wording "up + commented `-- down`")
```sql
-- drop table public.theme_presets;  -- drops constraints, index, policies
-- drop function public.validate_theme_tokens(jsonb, boolean);
```

## Environment note
`supabase` CLI was not installed (dangling symlink in ~/.local/bin) → installed **globally via npm, v2.122.0** (tooling only; repo `package.json`/lockfile untouched → "no new npm deps" constraint respected). Local stack had never run on this machine → first `supabase start` pulled images and replayed migrations.

## Pre-existing fixes required by the `db reset` gate (outside Task 1 letter; separate commits)
1. **039 view replay failure (SQLSTATE 42P16)** — `039_add_gender_to_leaderboard.sql` used `create or replace view leaderboard_virtual` with `gender` inserted at position 3; 020's view has `event_id` there. `CREATE OR REPLACE VIEW` cannot rename/reorder columns, only append at end. The 039→051→069 chain is otherwise consistent (each keeps the prior shape and appends). Fix: `drop view leaderboard_virtual;` before the replace in 039 — preserves the cloud-final column order exactly (verified 051/069 recreate with matching shapes; no `drop view` existed between 020–039).
2. **Duplicate migration versions 062/063 (SQLSTATE 23505)** — local had two `062_` and two `063_` files; `supabase_migrations.schema_migrations` pkey on version text rejects the second insert on fresh replay. Cloud investigation (MCP `list_migrations` + `schema_migrations.statements` probes): remote has 001–068 + 8 timestamp versions; **neither `062_payment_double_charge_and_refund_hardening` nor `063_payment_claim_in_progress` exists in remote history, but their effects ARE live on cloud** (probes: `payments.refunded_amount` column ✓, `payment_duplicate_detected` in `confirm_payment` body ✓, `in_progress` tri-state in `claim_payment_slot` ✓) — i.e. applied outside recorded history. Fix: renamed the two orphans to `0625_…` and `0635_…` (CLI sorts versions lexicographically → replay order preserved: 062 → 0625 → 063 → 0635 → 064…; confirmed in reset output). Also updated `tests/reliability/payments-schema.test.ts` which reads those files by filename (44/44 tests green after path update).

## Validation
### `supabase db reset` (final, after 076 in place)
```
Applying migration 075_fix_seed_user_token_columns.sql...
Applying migration 076_theme_presets.sql...
Seeding data from supabase/seed.sql...
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```
Zero errors, full replay 001→076 + seed.sql. Post-reset state: `migrations=78`, `theme_presets rows after clean replay=0` (Task 4 owns seeds — none here by design).

### Red phase (before 076 existed)
`psql` against the fresh 001–075 DB: `to_regclass('public.theme_presets')` = ABSENT, `to_regprocedure('public.validate_theme_tokens(jsonb, boolean)')` = ABSENT — matrix queries could not pass.

### §12.2 validator matrix (psql, final DB)
ACCEPT (expect t):
| Case | Result |
|---|---|
| A1 full tokens (all 5 sections, strict) | t |
| A2 partial (colors.primary + vocabulary.run_label, non-strict) | t |
| A3 minimal (3 required colors + meta, strict) | t |
| A4 `{}` non-strict | t |
| A5 meta omitted, non-strict | t |
| A6 label exactly 64 chars | t |
| A7 `meta {"version": 1.0}` | t |
| A8 tokens exactly 65536 octets | t |
| A8' tokens 66050 octets | f (cap enforced) |

REJECT (expect f — all f):
| Case | Result |
|---|---|
| R1 bad hex char `#9C4A1Z` (strict) | f |
| R2 short hex `#FFF` | f |
| R3 `javascript:alert(1)` in typography | f |
| R4 `organizers/x/../../../etc/passwd` in assets | f |
| R5 unknown top-level key | f |
| R6 unknown color key `neon` | f |
| R7 unknown vocab key `shirt_label` | f |
| R8 `meta {"version": 2}` | f |
| R9 `meta {"version": "1"}` (string) | f |
| R10 label 65 chars | f |
| R11 meta missing (strict) | f |
| R12 colors missing (strict) | f |
| R13 secondary/accent missing (strict) | f |
| R14 `http://` in typography | f |
| R15 `http://evil.com/x.png` as asset path | f |
| R16 non-string color value | f |
| R17 array tokens | f |
| R18 null tokens | f |
| R19 non-string label | f |
| R20 meta not object | f |
| R21 extra key inside meta | f |
| R22 scalar tokens | f |

### Table-level matrix (DO-block exception capture, all PASS)
- `theme_presets_tokens_valid` CHECK rejects malformed tokens at insert ✓
- `theme_presets_kind_organizer_match`: organizer preset with NULL organizer ✗ / system preset with organizer ✗ ✓
- slug unique violation on duplicate ✓
- Shape dump matches spec §4.1 (columns/types/defaults as listed above); 6 constraints present; `relrowsecurity = true`

### RLS matrix (psql `set local role` + `request.jwt.claims` GUC exercising `get_my_organizer_id()`/`is_admin()`)
| Scenario | Result |
|---|---|
| S0 postgres (owner, bypass) sees all 3 fixtures — RLS-off contrast | ✓ |
| S1 anon SELECT → only `pelikat-classic` (system public read) | ✓ |
| S2 organizer A SELECT → `pelikat-classic` + `org-a-custom` only (B's invisible) | ✓ |
| S3 organizer A INSERT kind='system' → SQLSTATE 42501 (with-check) | ✓ |
| S4 organizer A INSERT own custom preset | ✓ |
| S5 organizer A UPDATE own preset → organizer_id=B → 42501 | ✓ |
| S6 organizer A DELETE own preset | ✓ |
| S7 organizer A UPDATE B's preset → 0 rows | ✓ |
| S8 admin (app_metadata.role=admin) INSERT kind='system' → allowed, rolled back | ✓ |

### Per-task gate
- `tsc --noEmit` → exit 0
- `vitest run` → **Test Files 27 passed (27), Tests 267 passed (267)** (after the payments-schema test path fix; before it, 1 file failed to collect on the old filenames — see pre-existing fixes)

## Spec-conflict check (brief vs spec §4–§5)
No conflicts found. Deliberate scope lines, documented in the migration header:
- Typography **origin/woff2 allowlist** (§5.4) is intentionally NOT in the DB validator — the brief's §4.3 list specifies https-only for the DB choke-point; origin enforcement lives at save/resolve in `src/lib/theme` (P1 Task 9), where the platform storage origin is known.
- Assets accept relative bucket paths OR https URLs exactly per §4.2 "bucket paths or https URLs"; the `:`-off-charset side-effect blocks `javascript:`/`http://` there.
- `meta` required in strict, optional-but-validated in non-strict (§4.1: theme_config is "all-optional shape"; Global Constraints: meta required for the tokens contract).
- Task 1 brief assigns no seed uuids → no seeds in 076; Task 4 owns them (plan Task 4).

## Concerns (for @manager / @reviewer)
1. **Cloud-vs-local migration history drift (pre-existing, NOT resolved by me — needs @db-specialist/@manager awareness before cloud apply):** local versions `0625`, `0635`, `069`–`075` have no matching remote `schema_migrations` rows (remote instead has 8 timestamp versions whose contents partially overlap local 069–075; two local payment migrations were applied to cloud entirely outside history). Consequence: **do NOT apply 076–079 to cloud via `supabase db push`** — it would re-apply the unmatched local versions. Use MCP `apply_migration` per plan Task 5's note (cloud application = @db-specialist, one sitting). The renumber commit documents this in its message.
2. Two pre-existing replay fixes (684acfb, 7a60ad7) touch already-cloud-applied migration files. Zero effect on cloud (remote re-runs nothing) and zero semantic change locally (039: same final view shape as cloud; 0625/0635: content unchanged, names only + test paths).
3. Untracked `supabase/.branches/` (CLI artifact from `supabase start`) left uncommitted — repo may want it gitignored.
4. `validate_theme_tokens` parameter named `p_strict` because `strict` is SQL-reserved (brief's `strict` signature preserved positionally; callers use positional notation).
5. `supabase` CLI (v2.122.0) installed globally via npm to run the mandated validation; no repo dependency changes.

## Ledger
`- Task 1: implementer DONE (commits b0a20fd..176392c)` appended to progress.md.


### .superpowers/sdd/2026-10-28-event-themes-p1/task-10-report.md

# Task 10 Report — Style-Vars Builder + Whitelist Stylesheet (TDD)

Branch `feat/event-themes-p1` · BASE `8212cec` → HEAD `b508953` · committed locally, never pushed, main/master untouched.

## Files changed
- **Created** `src/lib/theme/css.ts` — `buildStyleVars(resolved, eventId?)` + `buildFontFace(eventId, fontUrl)`.
- **Created** `src/app/event-theme.css` — whitelist stylesheet.
- **Modified** `src/app/globals.css` — exactly one line: `@import './event-theme.css';` (verified diff = 1 insertion).
- **Created** `tests/theme/css.test.ts` — 20 tests.

## Implementation notes

### buildStyleVars
- Emits 16 color vars: `--et-{role}`, `--et-{role}-dark`, `--et-{role}-fg`, `--et-{role}-fg-dark` × primary/secondary/accent/ring. Values are **identity passthrough** of the `BrandSlot` opaque oklch strings (Task 6 carry — asserted by test: output `===` input strings, never re-parsed).
- Font vars `--et-font-heading` / `--et-font-body` emitted when `resolved.fonts.*` set **and** `eventId` provided. Value = full family stack: `ET-{prefix}-Heading, var(--font-geist)` — the stack travels in the var so the static rule stays one `var()` deep and the fallback **ends in Geist** (spec §5.4).
- **Conflict note (plan vs spec):** the plan pins `buildStyleVars(resolved: ResolvedTheme): CSSProperties`, but `--et-font-heading` must reference the per-event family `ET-{eventIdPrefix}-Heading` (spec §5.4) — and `ResolvedTheme` carries no event id. Reconciled with an **optional second param `eventId?`**: call-compatible with the pinned signature, keeps the plan's "buildStyleVars emits `--et-font-*` when set" true. Task 11 (which has `event.id`) passes it; single-arg calls still work (color vars complete, font vars omitted). Spec did not pin the param list; noting instead of improvising further.
- Background/foreground tint slots are deliberately NOT emitted — they are not in the 7-token whitelist (structurally unreachable, spec §5.3).
- Ring gets the full 4-var set per the plan's "× primary/secondary/accent/ring"; `--et-ring-fg`/`-fg-dark` are intentionally unmapped in the stylesheet (no platform `--ring-foreground` exists) — inert intermediates.
- Return: `Record<string, string> as CSSProperties` (standard pattern; React custom properties aren't in csstype).

### buildFontFace
- Family `ET-{eventIdPrefix}-Heading` — prefix = uuid first segment, stripped to `[A-Za-z0-9]` (system-generated, never user input); empty prefix → `Event` fallback.
- `font-display: swap`; `src: url("<href>") format("woff2")`; href from `new URL` normalization (spaces → `%20`, quotes impossible raw) — test asserts no whitespace/nested quotes inside the `url("…")` token.
- Returns `''` on any rejection (never throws; consumer injects nothing → Geist fallback, spec §5.5).
- **App-layer allowlist (Task 7 carried requirement, spec §5.4):** https only; host ∈ {platform storage origin, fonts.gstatic.com}; path ends `.woff2`. Platform origin read per-call from `process.env.NEXT_PUBLIC_SUPABASE_URL` — the same source `src/lib/supabase/client.ts` uses; unset/malformed env → only fonts.gstatic.com allowed (safe degrade, no hardcoded secrets).
- **Traversal (Task 1 review pin):** the raw string is rejected outright for dot-dot path segments (`..`, `%2e%2e`, mixed, any casing) **before** URL parsing — WHATWG normalization silently resolves `https://host/../x.woff2` → `/x.woff2`, which would otherwise sail through the extension check. This replaces the DB charset check the DB can't apply to absolute URLs. Rejecting (not normalize-and-accept) matches the platform's 076 stance of rejecting `..` outright.

### event-theme.css (whitelist = hard boundary, spec §5.3)
- `.event-theme { }` maps exactly the 7 brand tokens onto Tailwind theme vars (`--primary: var(--et-primary);` … `--ring: var(--et-ring);`); `.dark .event-theme { }` maps the `-dark`/`-fg-dark` slots. Specificity: `.dark .event-theme` (0,2,0) > `.event-theme` (0,1,0); neither competes with `:root` (different target element — custom properties inherit, scope declaration wins locally).
- Heading rule `.event-theme h1,…,h6 { font-family: var(--et-font-heading, var(--font-sans)); }` — set → themed stack ending in Geist; unset → platform sans (`--font-sans: var(--font-geist)`, globals.css:88).
- No body-font rule (plan: "heading selectors" only); `--et-font-body` is emitted by the builder (plan) but its face is not registered in P1 → falls through to Geist = platform behavior until P2.
- The file's header comment deliberately does NOT name forbidden tokens — the raw-substring test would otherwise trip on its own comment.

### globals.css
Single line `@import './event-theme.css';` added in the `@import` block (lines 1–3; CSS requires imports before rules), matching the file's existing single-quote style. Nothing else touched.

### Tests
`tests/theme/css.test.ts` (repo vitest glob `tests/**/*.{test,spec}.{ts,tsx}`). NOTE: plan says `src/lib/theme/css.test.ts`, but that path isn't in the vitest include glob — placed under `tests/theme/` per my brief ("tests/** per repo vitest glob, Tasks 6–9 convention") and matching Tasks 6–9 (`tests/theme/color.test.ts` etc.).

Coverage: var-pair identity for all 4 roles both modes; opaque dark passthrough; font vars set/unset; single-arg signature compatibility; font-face family/swap/url-format; allowlist accept (gstatic + Supabase origin) / reject (non-allowlisted https, http, .ttf, .woff, no-extension, malformed, empty); traversal (`/../`, `/storage/v1/../`, `%2e%2e`); URL normalization/escaping; family-prefix sanitization; **whitelist-absence**: declared custom properties must be EXACTLY the 7 (declaration-level regex `--[A-Za-z0-9-]+ :`), forbidden exact + `--chart-`/`--sidebar-` prefixes rejected, plus raw-substring belt check; both-mode mapping + heading-selector assertions.

## TDD evidence

Red 1 (module missing):
```
FAIL  tests/theme/css.test.ts
Error: Failed to resolve import "@/lib/theme/css" from "tests/theme/css.test.ts". Does the file exist?
 Test Files  1 failed (1)   Tests  no tests
```

Red 2 (traversal expectation exposed URL-normalization hiding `..`; drove the raw-string dot-dot guard):
```
FAIL  tests/theme/css.test.ts > buildFontFace > rejects ../ path traversal (DB charset bypass — app-layer boundary, spec §5.4)
AssertionError: expected '@font-face {\n  font-family: ET-9b2f…' to be ''
 Tests  1 failed | 19 passed (20)
```

Green (file):
```
 Test Files  1 passed (1)
      Tests  20 passed (20)
```

## Gates
| Gate | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, no output |
| `npx vitest run` (full) | **Test Files 32 passed (32), Tests 364 passed (364)** — baseline 344/344 across 31 files + this file's 20 |
| `npm run lint` | 0 errors, 20 warnings — all pre-existing (theme-toggle.tsx, payments-checkout.test.tsx, etc.); grep confirms **zero** findings in touched files |

## Commit
`b508953 feat(theme): two-tier CSS injection` (plan's Task 10 commit message used verbatim). Tree clean except pre-existing untracked `supabase/.branches/` (deferred Task 1 minor). Nothing pushed.

## Concerns / for review
1. **Plan conflict noted:** `buildStyleVars` optional `eventId?` param (details above) — Task 11 must pass `event.id` to get font vars.
2. Plan test-path conflict (src vs tests glob) resolved per brief — no action needed.
3. `--et-ring-fg`/`-fg-dark` emitted but unmapped in the stylesheet (no platform `--ring-foreground`) — inert, per plan's explicit "× …/ring" var list.
4. Dev-environment note: spec §5.4 mandates https-only, so local Supabase storage (`http://localhost:…`) fonts are rejected → Geist fallback in local dev. Spec-pinned; flagging the DX consequence.


### .superpowers/sdd/2026-10-28-event-themes-p1/task-11-diff.md

309960c feat(theme): EventThemeScope + runner page theming

diff --git a/src/app/runner/events/[id]/page.tsx b/src/app/runner/events/[id]/page.tsx
index bedf4ae..e2b0433 100644
--- a/src/app/runner/events/[id]/page.tsx
+++ b/src/app/runner/events/[id]/page.tsx
@@ -1,18 +1,19 @@
 import { ArrowLeft, CircleCheck, CreditCard, Footprints, Images, MapPin, QrCode, ShoppingBag, Trophy } from "lucide-react"
 import { createClient } from '@/lib/supabase/server'
 import { isConfirmedStatus } from '@/lib/registration-status'
 import Link from 'next/link'
 import { notFound } from 'next/navigation'
 import { RunnerRegistrationActions } from '@/components/events/runner-registration-actions'
 import { CancelRegistrationButton } from '@/components/events/cancel-registration-button'
 import { VirtualCertificateButton } from '@/components/gamification/virtual-certificate-button'
+import { EventThemeScope } from '@/components/theme/event-theme-scope'
 import type { Metadata } from 'next'
 
 export const metadata: Metadata = {
   title: 'Event Details - Pelikat',
   description: 'View event details and register for races',
 }
 
 interface RaceCategory {
   id: string
   name: string
@@ -65,235 +66,237 @@ export default async function RunnerEventDetailPage({
   // Virtual run progress: logged distance for this event vs target
   const { data: myLogs } = isVirtual && isRegistered
     ? await supabase.from('run_logs').select('distance_km').eq('event_id', id).eq('runner_id', profile?.id)
     : { data: null }
   const loggedKm = (myLogs ?? []).reduce((acc, l) => acc + Number(l.distance_km || 0), 0)
   const targetKm = Number(event.target_distance_km || 0)
   const raceCategories = (event.race_categories ?? []) as RaceCategory[]
   const eventDate = new Date(event.event_date)
 
   return (
-    <div className="flex flex-col w-full min-h-full bg-background">
-      {/* Sticky Header */}
-      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-muted">
-        <div className="flex items-center h-14 px-4 pt-safe">
-          <Link href="/runner/events" className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground active:bg-card transition-colors -ml-2">
-            <ArrowLeft className="size-[24px]" />
-          </Link>
-          <h1 className="flex-1 text-[16px] font-bold text-foreground text-center mr-8 truncate">
-            {event.name}
-          </h1>
-        </div>
-      </header>
+    <EventThemeScope event={event}>
+      <div className="flex flex-col w-full min-h-full bg-background">
+        {/* Sticky Header */}
+        <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-muted">
+          <div className="flex items-center h-14 px-4 pt-safe">
+            <Link href="/runner/events" className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground active:bg-card transition-colors -ml-2">
+              <ArrowLeft className="size-[24px]" />
+            </Link>
+            <h1 className="flex-1 text-[16px] font-bold text-foreground text-center mr-8 truncate">
+              {event.name}
+            </h1>
+          </div>
+        </header>
 
-      {/* Hero Banner Placeholder */}
-      <div className="w-full h-48 bg-muted relative">
-        <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent opacity-90" />
-        <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between">
-          <div className="flex flex-col">
-            <div className="flex items-center gap-2 mb-2">
-              <span className="px-2 py-1 w-max rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
-                {event.status}
-              </span>
-              {isVirtual && (
-                <span className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-success/10 text-success border border-success/20">
-                  Virtual Run
+        {/* Hero Banner Placeholder */}
+        <div className="w-full h-48 bg-muted relative">
+          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent opacity-90" />
+          <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between">
+            <div className="flex flex-col">
+              <div className="flex items-center gap-2 mb-2">
+                <span className="px-2 py-1 w-max rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
+                  {event.status}
                 </span>
-              )}
+                {isVirtual && (
+                  <span className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-success/10 text-success border border-success/20">
+                    Virtual Run
+                  </span>
+                )}
+              </div>
+              <h2 className="text-[24px] font-bold text-foreground leading-tight drop-shadow-md">
+                {event.name}
+              </h2>
             </div>
-            <h2 className="text-[24px] font-bold text-foreground leading-tight drop-shadow-md">
-              {event.name}
-            </h2>
           </div>
         </div>
-      </div>
 
-      <div className="flex flex-col px-5 py-6 gap-6">
+        <div className="flex flex-col px-5 py-6 gap-6">
         
-        {/* Date & Location */}
-        <section className="flex flex-col gap-4">
-          <div className="flex items-center gap-4 bg-card p-4 rounded-2xl border border-border/60">
-            <div className="w-12 h-12 bg-accent/50 rounded-xl flex flex-col items-center justify-center">
-              <span className="text-[10px] font-bold text-red-500 dark:text-red-300 uppercase">{eventDate.toLocaleDateString('en-MY', { month: 'short' })}</span>
-              <span className="text-[16px] font-extrabold text-foreground leading-none">{eventDate.getDate()}</span>
-            </div>
-            <div className="flex flex-col">
-              <span className="text-[14px] font-bold text-foreground">
-                {eventDate.toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric' })}
-              </span>
-              <span className="text-[12px] text-muted-foreground">Starts at 6:00 AM</span>
-            </div>
-          </div>
-          
-          {event.location && (
+          {/* Date & Location */}
+          <section className="flex flex-col gap-4">
             <div className="flex items-center gap-4 bg-card p-4 rounded-2xl border border-border/60">
-              <div className="w-12 h-12 bg-accent/50 rounded-xl flex items-center justify-center">
-                <MapPin className="size-[20px] text-primary" />
+              <div className="w-12 h-12 bg-accent/50 rounded-xl flex flex-col items-center justify-center">
+                <span className="text-[10px] font-bold text-red-500 dark:text-red-300 uppercase">{eventDate.toLocaleDateString('en-MY', { month: 'short' })}</span>
+                <span className="text-[16px] font-extrabold text-foreground leading-none">{eventDate.getDate()}</span>
               </div>
               <div className="flex flex-col">
-                <span className="text-[14px] font-bold text-foreground">Event Location</span>
-                <span className="text-[12px] text-muted-foreground">{event.location}</span>
+                <span className="text-[14px] font-bold text-foreground">
+                  {eventDate.toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric' })}
+                </span>
+                <span className="text-[12px] text-muted-foreground">Starts at 6:00 AM</span>
               </div>
             </div>
-          )}
-        </section>
+          
+            {event.location && (
+              <div className="flex items-center gap-4 bg-card p-4 rounded-2xl border border-border/60">
+                <div className="w-12 h-12 bg-accent/50 rounded-xl flex items-center justify-center">
+                  <MapPin className="size-[20px] text-primary" />
+                </div>
+                <div className="flex flex-col">
+                  <span className="text-[14px] font-bold text-foreground">Event Location</span>
+                  <span className="text-[12px] text-muted-foreground">{event.location}</span>
+                </div>
+              </div>
+            )}
+          </section>
 
-        {/* About */}
-        <section className="flex flex-col gap-2">
-          <h3 className="text-[16px] font-bold text-foreground">About the Race</h3>
-          <p className="text-[13px] text-muted-foreground leading-relaxed">
-            {event.description || 'No description available for this event.'}
-          </p>
-          <div className="flex items-center gap-2 mt-2">
-            <span className="text-[12px] text-muted-foreground">Organized by:</span>
-            <span className="text-[12px] font-bold text-foreground">{event.organizers?.name || 'Unknown Organizer'}</span>
-          </div>
-        </section>
+          {/* About */}
+          <section className="flex flex-col gap-2">
+            <h3 className="text-[16px] font-bold text-foreground">About the Race</h3>
+            <p className="text-[13px] text-muted-foreground leading-relaxed">
+              {event.description || 'No description available for this event.'}
+            </p>
+            <div className="flex items-center gap-2 mt-2">
+              <span className="text-[12px] text-muted-foreground">Organized by:</span>
+              <span className="text-[12px] font-bold text-foreground">{event.organizers?.name || 'Unknown Organizer'}</span>
+            </div>
+          </section>
 
-        {/* Registration Section */}
-        <section className="mt-4 pt-6 border-t border-border/60 flex flex-col gap-4">
-          <h3 className="text-[16px] font-bold text-foreground">My Registration</h3>
+          {/* Registration Section */}
+          <section className="mt-4 pt-6 border-t border-border/60 flex flex-col gap-4">
+            <h3 className="text-[16px] font-bold text-foreground">My Registration</h3>
           
-          {isRegistered ? (
-            <div className="flex flex-col gap-4">
-              <div className="p-5 rounded-2xl bg-success/10 border border-success/20 flex flex-col gap-4 relative overflow-hidden">
-                <div className="absolute right-0 top-0 w-32 h-32 bg-success/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
-                <div className="flex items-center gap-3">
-                  <CircleCheck className="size-[24px] text-success" />
-                  <div className="flex flex-col">
-                    <span className="text-[14px] font-bold text-success">You&apos;re Registered!</span>
-                    <span className="text-[11px] text-success/80">See you at the start line.</span>
-                  </div>
-                </div>
-                
-                <div className="grid grid-cols-2 gap-4 mt-2">
-                  {!isVirtual && (
+            {isRegistered ? (
+              <div className="flex flex-col gap-4">
+                <div className="p-5 rounded-2xl bg-success/10 border border-success/20 flex flex-col gap-4 relative overflow-hidden">
+                  <div className="absolute right-0 top-0 w-32 h-32 bg-success/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
+                  <div className="flex items-center gap-3">
+                    <CircleCheck className="size-[24px] text-success" />
                     <div className="flex flex-col">
-                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">BIB Number</span>
-                      <span className="text-[16px] font-mono font-bold text-foreground">{registration.bib_number || 'TBA'}</span>
+                      <span className="text-[14px] font-bold text-success">You&apos;re Registered!</span>
+                      <span className="text-[11px] text-success/80">See you at the start line.</span>
                     </div>
-                  )}
-                  <div className="flex flex-col">
-                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Category</span>
-                    <span className="text-[14px] font-bold text-foreground truncate">{registration.race_categories?.name}</span>
                   </div>
-                  {isVirtual && targetKm > 0 && (
-                    <div className="flex flex-col col-span-2 pt-3 border-t border-success/20">
-                      <div className="flex justify-between items-center mb-1.5">
-                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Progress</span>
-                        <span className="text-[11px] font-bold text-success">
-                          {loggedKm.toFixed(1)} / {targetKm} km
-                        </span>
+                
+                  <div className="grid grid-cols-2 gap-4 mt-2">
+                    {!isVirtual && (
+                      <div className="flex flex-col">
+                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">BIB Number</span>
+                        <span className="text-[16px] font-mono font-bold text-foreground">{registration.bib_number || 'TBA'}</span>
                       </div>
-                      <div className="h-2 rounded-full bg-muted overflow-hidden">
-                        <div
-                          className="h-full rounded-full bg-success"
-                          style={{ width: `${Math.min(100, Math.round((loggedKm / targetKm) * 100))}%` }}
-                        />
+                    )}
+                    <div className="flex flex-col">
+                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Category</span>
+                      <span className="text-[14px] font-bold text-foreground truncate">{registration.race_categories?.name}</span>
+                    </div>
+                    {isVirtual && targetKm > 0 && (
+                      <div className="flex flex-col col-span-2 pt-3 border-t border-success/20">
+                        <div className="flex justify-between items-center mb-1.5">
+                          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Progress</span>
+                          <span className="text-[11px] font-bold text-success">
+                            {loggedKm.toFixed(1)} / {targetKm} km
+                          </span>
+                        </div>
+                        <div className="h-2 rounded-full bg-muted overflow-hidden">
+                          <div
+                            className="h-full rounded-full bg-success"
+                            style={{ width: `${Math.min(100, Math.round((loggedKm / targetKm) * 100))}%` }}
+                          />
+                        </div>
                       </div>
+                    )}
+                    <div className="flex justify-between items-center pt-3 border-t border-success/20 col-span-2">
+                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Payment Status</span>
+                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-muted text-foreground">
+                        {registration.payment_status?.toUpperCase()}
+                      </span>
                     </div>
-                  )}
-                  <div className="flex justify-between items-center pt-3 border-t border-success/20 col-span-2">
-                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Payment Status</span>
-                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-muted text-foreground">
-                      {registration.payment_status?.toUpperCase()}
-                    </span>
                   </div>
                 </div>
-              </div>
 
-              <div className="flex flex-col gap-3 mt-2">
-                {!isVirtual && (
-                  <Link
-                    href={`/runner/events/${event.id}/bib`}
-                    className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
-                  >
-                    <QrCode className="size-[18px]" />
-                    View Digital BIB Pass
-                  </Link>
-                )}
+                <div className="flex flex-col gap-3 mt-2">
+                  {!isVirtual && (
+                    <Link
+                      href={`/runner/events/${event.id}/bib`}
+                      className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
+                    >
+                      <QrCode className="size-[18px]" />
+                      View Digital BIB Pass
+                    </Link>
+                  )}
 
-                {!isConfirmedStatus(registration.payment_status) && (
+                  {!isConfirmedStatus(registration.payment_status) && (
+                    <Link
+                      href={`/runner/events/${event.id}/payment`}
+                      className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
+                    >
+                      <CreditCard className="size-[18px]" />
+                      Complete Payment
+                    </Link>
+                  )}
                   <Link
-                    href={`/runner/events/${event.id}/payment`}
-                    className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
+                    href={`/runner/events/${event.id}/merch`}
+                    className="w-full py-3.5 rounded-xl bg-accent text-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                   >
-                    <CreditCard className="size-[18px]" />
-                    Complete Payment
+                    <ShoppingBag className="size-[18px]" />
+                    Event Merch
                   </Link>
-                )}
-                <Link
-                  href={`/runner/events/${event.id}/merch`}
-                  className="w-full py-3.5 rounded-xl bg-accent text-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
-                >
-                  <ShoppingBag className="size-[18px]" />
-                  Event Merch
-                </Link>
 
-                {isVirtual && targetKm > 0 && loggedKm >= targetKm && (
-                  <VirtualCertificateButton eventId={event.id} />
-                )}
+                  {isVirtual && targetKm > 0 && loggedKm >= targetKm && (
+                    <VirtualCertificateButton eventId={event.id} />
+                  )}
 
-                {isVirtual && (
-                  <Link
-                    href={`/runner/run-log?event=${event.id}`}
-                    className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
-                  >
-                    <Footprints className="size-[18px]" />
-                    Log a Run
-                  </Link>
-                )}
+                  {isVirtual && (
+                    <Link
+                      href={`/runner/run-log?event=${event.id}`}
+                      className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
+                    >
+                      <Footprints className="size-[18px]" />
+                      Log a Run
+                    </Link>
+                  )}
+
+                  {!isVirtual && (
+                    <Link
+                      href={`/runner/events/${event.id}/gallery`}
+                      className="w-full py-3.5 rounded-xl bg-accent text-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
+                    >
+                      <Images className="size-[18px]" />
+                      Event Photos
+                    </Link>
+                  )}
 
-                {!isVirtual && (
                   <Link
-                    href={`/runner/events/${event.id}/gallery`}
+                    href={`/runner/leaderboard?event_id=${event.id}`}
                     className="w-full py-3.5 rounded-xl bg-accent text-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                   >
-                    <Images className="size-[18px]" />
-                    Event Photos
+                    <Trophy className="size-[18px]" />
+                    Event Leaderboard
                   </Link>
-                )}
-
-                <Link
-                  href={`/runner/leaderboard?event_id=${event.id}`}
-                  className="w-full py-3.5 rounded-xl bg-accent text-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
-                >
-                  <Trophy className="size-[18px]" />
-                  Event Leaderboard
-                </Link>
 
-                {!registration.checked_in && (
-                  <div className="mt-4 pt-4 border-t border-border/40">
-                    <CancelRegistrationButton eventId={event.id} />
-                  </div>
-                )}
+                  {!registration.checked_in && (
+                    <div className="mt-4 pt-4 border-t border-border/40">
+                      <CancelRegistrationButton eventId={event.id} />
+                    </div>
+                  )}
+                </div>
               </div>
-            </div>
-          ) : (
-            <RunnerRegistrationActions
-              eventId={event.id}
-              categories={raceCategories}
-              hasRunnerProfile={!!profile}
-              runner={{
-                name: profile?.full_name ?? null,
-                email: user?.email ?? null,
-                tShirtSize: profile?.t_shirt_size ?? null,
-                emergencyContactName: profile?.emergency_contact_name ?? null,
-                emergencyContactPhone: profile?.emergency_contact_phone ?? null,
-                dob: profile?.dob ?? null,
-                gender: profile?.gender ?? null,
-                phone: profile?.phone ?? null,
-                icOnFile: !!(profile?.ic_encrypted || profile?.ic_document_path),
-              }}
-              eventSummary={{
-                name: event.name,
-                date: eventDate.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
-                location: event.location,
-              }}
-            />
-          )}
-        </section>
+            ) : (
+              <RunnerRegistrationActions
+                eventId={event.id}
+                categories={raceCategories}
+                hasRunnerProfile={!!profile}
+                runner={{
+                  name: profile?.full_name ?? null,
+                  email: user?.email ?? null,
+                  tShirtSize: profile?.t_shirt_size ?? null,
+                  emergencyContactName: profile?.emergency_contact_name ?? null,
+                  emergencyContactPhone: profile?.emergency_contact_phone ?? null,
+                  dob: profile?.dob ?? null,
+                  gender: profile?.gender ?? null,
+                  phone: profile?.phone ?? null,
+                  icOnFile: !!(profile?.ic_encrypted || profile?.ic_document_path),
+                }}
+                eventSummary={{
+                  name: event.name,
+                  date: eventDate.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
+                  location: event.location,
+                }}
+              />
+            )}
+          </section>
 
+        </div>
       </div>
-    </div>
+    </EventThemeScope>
   )
 }
diff --git a/src/components/theme/event-theme-scope.tsx b/src/components/theme/event-theme-scope.tsx
new file mode 100644
index 0000000..d16683f
--- /dev/null
+++ b/src/components/theme/event-theme-scope.tsx
@@ -0,0 +1,58 @@
+/**
+ * EventThemeScope — server component, spec §5.3 (two-tier injection, zero FOUC).
+ *
+ * Resolves the event theme server-side and renders the themed scope as a
+ * wrapper div carrying ALL `--et-*` vars INLINE (tier 1) — values are correct
+ * at first paint, pre-hydration; next-themes `.dark` toggling re-resolves via
+ * pure CSS (`src/app/event-theme.css`, tier 2).
+ *
+ * The per-event heading @font-face (resolver-built: allowlisted URL,
+ * system-generated `ET-{prefix}-Heading` family) is injected as a <style>
+ * inside the scope — spec §5.4's resolver-built fallback. Scope dies with
+ * navigation, so the face dies with it.
+ *
+ * Unthemed events render children unwrapped: zero DOM, zero queries.
+ */
+import type { ReactNode } from 'react'
+import { createClient } from '@/lib/supabase/server'
+import { getResolvedTheme, type EventThemeInput } from '@/lib/theme/resolve'
+import { buildStyleVars, buildFontFace } from '@/lib/theme/css'
+
+/** Event row subset the scope consumes — `id` drives the font family + var bindings. */
+type EventWithTheme = EventThemeInput & { id: string }
+
+function isPlainObject(v: unknown): v is Record<string, unknown> {
+  return typeof v === 'object' && v !== null && !Array.isArray(v)
+}
+
+/** No-theme predicate: no preset reference AND no (non-empty) override config. */
+function hasTheme(event: EventWithTheme): boolean {
+  if (typeof event.theme_preset_id === 'string' && event.theme_preset_id.length > 0) return true
+  return isPlainObject(event.theme_config) && Object.keys(event.theme_config).length > 0
+}
+
+export async function EventThemeScope({
+  event,
+  children,
+}: {
+  event: EventWithTheme
+  children: ReactNode
+}) {
+  if (!hasTheme(event)) return <>{children}</>
+
+  // getResolvedTheme never throws — any failure degrades to the platform
+  // theme (spec §5.5), so the wrapper always carries valid oklch vars.
+  const supabase = await createClient()
+  const resolved = await getResolvedTheme(supabase, event)
+
+  // BINDING (Task 10 review carry): event.id is REQUIRED in both calls —
+  // without it the font vars/family never emit.
+  const fontFace = resolved.fonts.heading ? buildFontFace(event.id, resolved.fonts.heading) : ''
+
+  return (
+    <div className="event-theme" style={buildStyleVars(resolved, event.id)}>
+      {fontFace !== '' && <style dangerouslySetInnerHTML={{ __html: fontFace }} />}
+      {children}
+    </div>
+  )
+}
diff --git a/tests/theme/event-theme-scope.test.tsx b/tests/theme/event-theme-scope.test.tsx
new file mode 100644
index 0000000..1788ccb
--- /dev/null
+++ b/tests/theme/event-theme-scope.test.tsx
@@ -0,0 +1,137 @@
+import { describe, it, expect, vi, beforeEach } from 'vitest'
+import { prerender } from 'react-dom/static'
+import type { SupabaseClient } from '@supabase/supabase-js'
+import { createClient } from '@/lib/supabase/server'
+import { EventThemeScope } from '@/components/theme/event-theme-scope'
+
+// EventThemeScope builds its own server client (plan interface: { event, children }).
+// Mock the module so tests never touch next/headers; resolve.ts's only query is
+// the theme_presets lookup — same minimal chainable fake as resolve.test.ts.
+vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
+
+const EVENT_ID = '9b2f4c1e-abcd-4321-9876-abcdef012345'
+const PRESET_ID = '11111111-1111-1111-1111-111111111111'
+
+type PresetRow = { id: string; tokens: unknown } | null
+
+function fakeSupabase(row: PresetRow): SupabaseClient {
+  return {
+    from: () => ({
+      select: () => ({
+        eq: () => ({
+          maybeSingle: async () => ({ data: row, error: null }),
+        }),
+      }),
+    }),
+  } as unknown as SupabaseClient
+}
+
+function useSupabase(row: PresetRow): void {
+  vi.mocked(createClient).mockResolvedValue(
+    fakeSupabase(row) as unknown as Awaited<ReturnType<typeof createClient>>,
+  )
+}
+
+// Valid per the write validator (Task 1/9): strict HEX, contrast ≥3:1 vs the
+// platform background, https + .woff2 heading font.
+const TOKENS = {
+  colors: { primary: '#9C4A1A', secondary: '#3E2C23', accent: '#D4A017', ring: '#C68B2E' },
+  typography: { heading_font_url: 'https://fonts.gstatic.com/s/lasso/v1/x.woff2' },
+  meta: { version: 1 },
+}
+
+function event(theme_preset_id: string | null, theme_config: unknown = null) {
+  return { id: EVENT_ID, theme_preset_id, theme_config }
+}
+
+// renderToStaticMarkup (react-dom/server) rejects async components in React
+// 19; prerender (react-dom/static) is its async-capable counterpart and still
+// yields the raw SSR string — inline vars pre-hydration are asserted verbatim.
+async function render(event: { id: string; theme_preset_id: string | null; theme_config: unknown }) {
+  const { prelude } = await prerender(
+    <EventThemeScope event={event}>
+      <p>child</p>
+    </EventThemeScope>,
+  )
+  let html = ''
+  const reader = prelude.getReader()
+  const decoder = new TextDecoder()
+  for (;;) {
+    const { done, value } = await reader.read()
+    if (done) break
+    html += decoder.decode(value, { stream: true })
+  }
+  return html + decoder.decode()
+}
+
+// The 16 brand vars buildStyleVars emits — light/dark × color/companion-fg.
+const ROLE_SUFFIXES = ['-fg', '-dark', '-fg-dark'] as const
+
+describe('EventThemeScope (SSR, spec §5.3)', () => {
+  beforeEach(() => {
+    vi.mocked(createClient).mockReset()
+  })
+
+  it('themed event → wrapper div carries both color modes inline, pre-hydration', async () => {
+    useSupabase({ id: PRESET_ID, tokens: TOKENS })
+    const html = await render(event(PRESET_ID))
+    expect(html).toContain('class="event-theme"')
+    for (const role of ['primary', 'secondary', 'accent', 'ring']) {
+      // Color slots are always oklch; -fg companions may be HEX (#ffffff) —
+      // presence of the pair is the zero-FOUC contract, not its unit.
+      expect(html).toContain(`--et-${role}:oklch(`)
+      for (const suffix of ROLE_SUFFIXES) {
+        expect(html).toContain(`--et-${role}${suffix}:`)
+      }
+    }
+    expect(html).toContain('child')
+  })
+
+  it('unthemed event → children unwrapped (no wrapper, no font-face, no query)', async () => {
+    useSupabase(null)
+    const html = await render(event(null))
+    expect(html).toBe('<p>child</p>')
+    expect(createClient).not.toHaveBeenCalled()
+  })
+
+  it('empty theme_config object → treated as unthemed', async () => {
+    useSupabase(null)
+    const html = await render(event(null, {}))
+    expect(html).toBe('<p>child</p>')
+  })
+
+  it('theme_config-only event (no preset) → still wrapped', async () => {
+    useSupabase(null)
+    const html = await render(event(null, { colors: { primary: '#123456' } }))
+    expect(html).toContain('class="event-theme"')
+    expect(html).toContain('--et-primary:oklch(')
+  })
+
+  it('preset lookup fails → platform theme still wraps (resolve degrades, never throws)', async () => {
+    useSupabase(null)
+    const html = await render(event(PRESET_ID))
+    expect(html).toContain('class="event-theme"')
+    // Platform primary (resolve.ts PLATFORM_SLOTS, mirrors globals.css).
+    expect(html).toContain('--et-primary:oklch(0.51 0.16 190)')
+  })
+
+  it('themed heading font → @font-face + font var with system-generated family', async () => {
+    useSupabase({ id: PRESET_ID, tokens: TOKENS })
+    const html = await render(event(PRESET_ID))
+    expect(html).toContain('@font-face')
+    expect(html).toContain('font-family: ET-9b2f4c1e-Heading;')
+    // Binding carry (Task 10): font vars only emit when event.id is passed.
+    expect(html).toContain('--et-font-heading:ET-9b2f4c1e-Heading')
+  })
+
+  it('font URL failing the allowlist → no @font-face (Geist fallback)', async () => {
+    useSupabase({
+      id: PRESET_ID,
+      tokens: { ...TOKENS, typography: { heading_font_url: 'http://evil.example/x.woff2' } },
+    })
+    const html = await render(event(PRESET_ID))
+    expect(html).not.toContain('@font-face')
+    expect(html).not.toContain('--et-font-heading')
+    expect(html).toContain('class="event-theme"')
+  })
+})


### .superpowers/sdd/2026-10-28-event-themes-p1/task-11-report.md

# Task 11 Report — `EventThemeScope` + runner event page wiring

**Branch:** `feat/event-themes-p1` · **Commits:** `b508953..309960c` · **Mode:** Direct In-Place (pelikat-web)

## What was built

### 1. `src/components/theme/event-theme-scope.tsx` (new, 58 lines)
Async server component per plan + spec §5.3/§5.4:
- **Interface:** `EventThemeScope({ event, children })` — `event: EventThemeInput & { id: string }` (reuses Task 7's `EventThemeInput`, adds `id` for the font bindings; no interface redefined).
- **No-theme predicate** (`hasTheme`): no `theme_preset_id` string AND no non-empty plain-object `theme_config` → children rendered unwrapped (`<>{children}</>`), zero DOM added, zero supabase queries (asserted: `createClient` not called).
- **Themed path:** `createClient()` (repo pattern) → `getResolvedTheme(supabase, event)` (never throws, §5.5) → wrapper `<div className="event-theme" style={buildStyleVars(resolved, event.id)}>` + `{children}`.
- **BINDING CARRY honored (Task 10 review):** `buildStyleVars(resolved, event.id)` and `buildFontFace(event.id, resolved.fonts.heading)` — both two-arg. Without `event.id` the font vars never emit; test pins `--et-font-heading:ET-9b2f4c1e-Heading` in SSR output.
- **@font-face injection:** resolver-built content (allowlisted https/.woff2 URL, system-generated `ET-{prefix}-Heading` family — never user input) via `<style dangerouslySetInnerHTML>` inside the scope, spec §5.4's explicitly blessed fallback. Chose the fallback over React 19 `<style href precedence>` because: (a) the content is dynamic per event, (b) the face is name-unique per event so @font-face has no cascade-order sensitivity, (c) inside the scope it dies with navigation. Global Constraints' "never dangerouslySetInnerHTML" applies to LABELS (rendered as text children — untouched here).
- Fail-allowlist font URL → `buildFontFace` returns `''` → no `<style>` emitted, theme wrapper still applies (Geist fallback), pinned by test.

### 2. `src/app/runner/events/[id]/page.tsx` (modified)
- Imported `EventThemeScope` and wrapped the page's existing root `<div className="flex flex-col w-full min-h-full bg-background">` (spec §5.3: "wrap existing root div"). Pure mechanical +2 re-indent of the JSX body; zero logic changes.
- **Plan deviation (reported, not improvised):** plan says "extend its event `select` with `theme_preset_id`, `theme_config`, preset `tokens`". The page's select is already `*, organizers(name), race_categories(*)` — the migration-077 event columns flow through `*`. Preset tokens are loaded *inside* `getResolvedTheme` by its Task 7 contract (`supabase.from('theme_presets').select('id, tokens')`), so a join in the page select would be dead weight. No select change made.
- Layout note: adding the scope div between `main.flex-1` and the page root makes the root's `min-h-full` resolve against an auto-height parent (percentage → no-op). Visual impact is nil — `--background` is NOT remapped inside `.event-theme` (whitelist hard boundary), so background coverage is unchanged; flagged for reviewer awareness.

### 3. `tests/theme/event-theme-scope.test.tsx` (new, 7 tests)
**Path deviation per manager instruction:** plan line 159 said `src/components/theme/event-theme-scope.test.tsx`; tests live in `tests/` (vitest include glob `tests/**`, Tasks 6–10 convention) → `tests/theme/event-theme-scope.test.tsx`.
- **Harness:** plan prescribed `renderToStaticMarkup` (react-dom/server), which **rejects async components in React 19.2** ("A component suspended while responding to synchronous input" — empirically confirmed). Switched to `prerender` from `react-dom/static` (verified exported in react-dom 19.2.4) — the async-capable static API, still yielding the raw SSR string for verbatim pre-hydration assertions.
- `@/lib/supabase/server` mocked (`vi.mock` factory with no outer refs; `vi.mocked(createClient).mockResolvedValue(...)` per test) — same minimal chainable `fakeSupabase` shape as `tests/theme/resolve.test.ts` (theme_presets lookup is resolve's only query).
- Cases: ① themed event → `class="event-theme"` wrapper, all 16 brand vars (`--et-{role}` light/`-fg`/`-dark`/`-fg-dark`) inline pre-hydration, children rendered inside; ② unthemed → exact `<p>child</p>` unwrap, no query; ③ empty `theme_config` `{}` → unthemed; ④ `theme_config`-only (no preset) → still wrapped; ⑤ preset lookup fails → platform-theme wrapper (`--et-primary:oklch(0.51 0.16 190)`), Review Focus #3 at the page layer; ⑥ heading font → `@font-face` + `ET-9b2f4c1e-Heading` family + `--et-font-heading` var (binding-carry pin); ⑦ non-allowlist font URL → no `@font-face`, wrapper intact.

## Commands run & results

| Command | Result |
|---|---|
| `pnpm exec vitest run tests/theme/event-theme-scope.test.tsx` (pre-implementation) | FAIL for the right reason (`Failed to resolve import "@/components/theme/event-theme-scope"`) |
| same after implementation (renderToStaticMarkup) | 7 failed — async components unsupported in react-dom/server (React 19.2) |
| same after switching harness to `prerender` (react-dom/static) | **7 passed (7)** |
| `pnpm exec tsc --noEmit` | exit 0, clean |
| `pnpm exec vitest run` (full suite) | **371/371 across 33 files** (baseline 364/364 + 7 new) |
| `npm run lint` | **0 errors**, 20 warnings — all pre-existing (none in the three touched files; nearest match is pre-existing `runner/events/[id]/payment/page.tsx` setState-in-effect warning) |

## Docker smoke (plan Step 3) — best-effort, limits reported
- `pelikat-web-web-1` up on `:3000`, hot-reloading this checkout.
- `curl /runner/events/d0e5e000-…-002a` → **HTTP 307 → `/login?redirect=…`**: runner route sits behind auth middleware; no test credentials available, and injecting a session into the shared DB is out of scope.
- DB check (read-only, via `docker exec supabase_db…psql`): **no event has `theme_preset_id`/`theme_config` set** — no themed event exists to smoke (Theme tab that writes themes is Task 13).
- Compensating coverage: the zero-FOUC guarantee (Review Focus #5, pinned Task 11) is asserted at the SSR layer — inline both-mode vars present pre-hydration; `.dark` re-resolution is pure CSS (Task 10's stylesheet tests). A visual first-paint/dark-toggle pass with a real themed event remains for the controller/`@reviewer` once a themed event exists.

## Decisions & conflicts
1. **Test framework deviation** (renderToStaticMarkup → prerender): forced by React 19.2 behavior; same raw-HTML assertions. Report-only conflict with plan wording, none with spec.
2. **Test location deviation** (src/ → tests/theme/): per manager instruction (established convention), plan line 159 superseded.
3. **Select unchanged**: `*` already covers theme columns; tokens load inside `getResolvedTheme` per its contract.
4. **Spec vs plan — no conflicts found.** Plan's single-arg `buildStyleVars(resolved)` pin (line 161) superseded by the Task 10 binding carry as instructed; implemented two-arg.
5. `supabase/.branches/` untracked noise pre-existing in the worktree — deliberately NOT committed.

## Files changed (commit `309960c`)
- `src/components/theme/event-theme-scope.tsx` (new)
- `src/app/runner/events/[id]/page.tsx` (wrap + import + re-indent)
- `tests/theme/event-theme-scope.test.tsx` (new)


### .superpowers/sdd/2026-10-28-event-themes-p1/task-12-diff.md

diff --git a/src/app/runner/leaderboard/page.tsx b/src/app/runner/leaderboard/page.tsx
index b045b23..ba2ac6f 100644
--- a/src/app/runner/leaderboard/page.tsx
+++ b/src/app/runner/leaderboard/page.tsx
@@ -1,13 +1,15 @@
 import { ArrowLeft, Hourglass, Trophy } from "lucide-react"
 import { createClient } from '@/lib/supabase/server'
 import { LiveLeaderboard, type LeaderboardEntry } from '@/components/gamification/live-leaderboard'
+import { EventThemeScope } from '@/components/theme/event-theme-scope'
+import { scopedLeaderboardEventId } from './scope'
 import { LeaderboardFilters } from './filters'
 import { ExportCSV } from './export-csv'
 import Link from 'next/link'
 import type { Metadata } from 'next'
 
 export const metadata: Metadata = {
   title: 'Leaderboard - Pelikat',
   description: 'Virtual run rankings across all events',
 }
 
@@ -48,20 +50,35 @@ export default async function RunnerLeaderboardPage({
           .order('name')
       : Promise.resolve({ data: [] }),
   ])
 
   // FR-69: results are hidden until the organizer publishes them
   const publishedIds = (events ?? []).filter((e) => e.results_published).map((e) => e.id)
   const resultsLocked = event_id && event_id !== 'all'
     ? !(events ?? []).some((e) => e.id === event_id && e.results_published)
     : publishedIds.length === 0
 
+  // Theme scope (spec §5.3): only when event_id targets one published event.
+  // The events list (already fetched for the filters) is the publication source
+  // of truth; the themed row is fetched separately so the mixed view — and the
+  // always-run events query — never carries theme_config payload.
+  const scopedId = scopedLeaderboardEventId(event_id, events)
+  const scopedEvent = scopedId
+    ? (
+        await supabase
+          .from('events')
+          .select('id, theme_preset_id, theme_config')
+          .eq('id', scopedId)
+          .maybeSingle()
+      ).data
+    : null
+
   let leaderboard: LeaderboardEntry[] | null = null
   if (!resultsLocked) {
     let query = supabase.from('leaderboard_virtual').select('*').limit(50)
 
     if (event_id && event_id !== 'all') {
       query = query.eq('event_id', event_id)
     } else if (publishedIds.length > 0) {
       query = query.in('event_id', publishedIds)
     }
     if (gender && gender !== 'all') {
@@ -70,21 +87,21 @@ export default async function RunnerLeaderboardPage({
       query = query.eq('gender', g)
     }
     if (category_id && category_id !== 'all') {
       query = query.eq('category_id', category_id)
     }
 
     leaderboard = (await query.order('rank', { ascending: true })).data
   }
 
 
-  return (
+  const content = (
     <div className="flex flex-col w-full min-h-full bg-background">
       {/* Sticky Header */}
       <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-muted">
         <div className="flex items-center h-14 px-4 pt-safe">
           <Link href="/runner" className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground active:bg-card transition-colors -ml-2">
             <ArrowLeft className="size-[24px]" />
           </Link>
           <div className="flex-1 flex flex-col items-center mr-8 truncate">
             <h1 className="text-[16px] font-bold text-foreground leading-tight">
               Leaderboard
@@ -136,11 +153,17 @@ export default async function RunnerLeaderboardPage({
               gender: gender && gender !== 'all' ? (gender === 'male' ? 'M' : gender === 'female' ? 'F' : gender) : undefined,
               category_id: category_id && category_id !== 'all' ? category_id : undefined,
             }}
             publishedIds={publishedIds}
           />
         )}
 
       </div>
     </div>
   )
+
+  // Single published event → themed scope (spec §5.3); mixed views render
+  // content unwrapped — same pattern as the runner event page (Task 11).
+  return scopedEvent ? (
+    <EventThemeScope event={scopedEvent}>{content}</EventThemeScope>
+  ) : content
 }
diff --git a/src/app/runner/leaderboard/scope.ts b/src/app/runner/leaderboard/scope.ts
new file mode 100644
index 0000000..ee57af1
--- /dev/null
+++ b/src/app/runner/leaderboard/scope.ts
@@ -0,0 +1,13 @@
+/**
+ * Leaderboard theme-scope decision (spec §5.3): the leaderboard inherits an
+ * event theme ONLY when `event_id` targets ONE published event — mixed-event
+ * rankings (no event_id / 'all') and missing/unpublished events stay neutral.
+ * Pure so the page's scope decision is unit-testable (Task 12 Step 1).
+ */
+export function scopedLeaderboardEventId(
+  eventId: string | undefined,
+  events: { id: string; results_published: boolean }[] | null | undefined,
+): string | null {
+  if (!eventId || eventId === 'all') return null
+  return (events ?? []).some((e) => e.id === eventId && e.results_published) ? eventId : null
+}
diff --git a/tests/theme/leaderboard-scope.test.ts b/tests/theme/leaderboard-scope.test.ts
new file mode 100644
index 0000000..c970044
--- /dev/null
+++ b/tests/theme/leaderboard-scope.test.ts
@@ -0,0 +1,36 @@
+import { describe, it, expect } from 'vitest'
+import { scopedLeaderboardEventId } from '@/app/runner/leaderboard/scope'
+
+// Spec §5.3: the leaderboard inherits an event theme ONLY when event_id
+// targets ONE published event — mixed-event rankings stay neutral.
+const EVENTS = [
+  { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', results_published: true },
+  { id: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', results_published: false },
+]
+
+describe('scopedLeaderboardEventId', () => {
+  it('single published event → scoped (returns the event id)', () => {
+    expect(scopedLeaderboardEventId(EVENTS[0].id, EVENTS)).toBe(EVENTS[0].id)
+  })
+
+  it('missing event_id → neutral (mixed view)', () => {
+    expect(scopedLeaderboardEventId(undefined, EVENTS)).toBeNull()
+  })
+
+  it("event_id 'all' → neutral (mixed view)", () => {
+    expect(scopedLeaderboardEventId('all', EVENTS)).toBeNull()
+  })
+
+  it('stale/unknown event_id → neutral', () => {
+    expect(scopedLeaderboardEventId('c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', EVENTS)).toBeNull()
+  })
+
+  it('single event but results unpublished → neutral', () => {
+    expect(scopedLeaderboardEventId(EVENTS[1].id, EVENTS)).toBeNull()
+  })
+
+  it('events query failed/empty → neutral', () => {
+    expect(scopedLeaderboardEventId(EVENTS[0].id, null)).toBeNull()
+    expect(scopedLeaderboardEventId(EVENTS[0].id, [])).toBeNull()
+  })
+})
209bdfe feat(theme): single-event leaderboard theming


### .superpowers/sdd/2026-10-28-event-themes-p1/task-12-report.md

# Task 12 Report — Leaderboard theming (single-event only)

Branch: `feat/event-themes-p1` · Commits: `309960c..209bdfe` (single commit `209bdfe feat(theme): single-event leaderboard theming`)

## Requirements recap (plan + spec)

- Plan Task 12: leaderboard server page — when it targets ONE published event → wrap in `EventThemeScope`; mixed-event rankings stay neutral; `LiveLeaderboard` client component inherits CSS vars with ZERO client theme logic.
- Spec §5.3 (line 140): leaderboard theming **only** when `event_id` targets one published event; mixed views neutral; runner-event-page pattern.
- Global Constraints honored: stylesheet whitelist untouched (scope emits only `--et-*` inline vars); no new deps; zero client theme JS.

## Files changed

1. **`src/app/runner/leaderboard/scope.ts`** (new, 15 lines) — pure predicate
   `scopedLeaderboardEventId(eventId, events): string | null`
   (`event_id` set + non-`'all'` + present in the events list with `results_published` → the id; otherwise null).
   Pure function so the plan's Step 1 predicate test pins the decision.
2. **`tests/theme/leaderboard-scope.test.ts`** (new, 6 tests) — single published → id; missing `event_id` → null; `'all'` → null; stale/unknown id → null; unpublished single event → null; null/empty events list → null.
3. **`src/app/runner/leaderboard/page.tsx`** (modified, +17/−1) —
   - After the existing events fetch: `scopedId = scopedLeaderboardEventId(event_id, events)`, then a conditional single-row fetch `select('id, theme_preset_id, theme_config').eq('id', scopedId).maybeSingle()` **only** in the scoped path (mixed view and the always-run events query never carry `theme_config` payload).
   - JSX root moved into `const content`; return is `scopedEvent ? <EventThemeScope event={scopedEvent}>{content}</EventThemeScope> : content`.

## Patterns reused (not reinvented)

- `EventThemeScope` (Task 11) consumed exactly as the runner event page does — including its BINDING carry: the two-arg `buildStyleVars(resolved, event.id)` / `buildFontFace(event.id, resolved.fonts.heading)` calls live inside the scope component, satisfied by construction.
- Runner event page wrap pattern (`src/app/runner/events/[id]/page.tsx`): wrap the whole page root, inner markup untouched.
- Publication source of truth = the existing `events` query already fetched for the filter dropdown (same rows `resultsLocked` uses).
- Prerender-test pattern from `tests/theme/event-theme-scope.test.tsx` was NOT needed here — the plan tests only the pure predicate; the scope component's SSR behavior is already pinned in Task 11's tests.

## Behavior matrix (verified by design + tests)

| Case | Result |
|---|---|
| `event_id` = published event | wrapped in `.event-theme`, themed |
| `event_id` = unpublished event (results locked) | neutral (spec: published only) |
| `event_id` = stale/unknown uuid | neutral |
| `event_id` absent or `'all'` (mixed view) | neutral |
| Scoped row deleted between queries (race) | `.maybeSingle()` → null → neutral, no throw |
| Scoped event has no theme (`hasTheme` false) | scope renders `<>{children}</>` — no wrapper, no query |
| User switches event in `LeaderboardFilters` | `router.push` → server re-renders → scope re-decides server-side (zero client theme JS) |
| Preset lookup fails / malformed config | resolve degrades to platform theme inside wrapper (Task 6/7 behavior, never throws) |

## Verification

- `pnpm exec vitest run tests/theme/leaderboard-scope.test.ts` → 6/6 PASS (RED first: module missing).
- `pnpm exec vitest run` → **377/377 across 34 files** (baseline 371/371 across 33 + 6 new).
- `pnpm exec tsc --noEmit` → exit 0.
- `pnpm lint` → 0 errors, 20 warnings — identical to baseline (verified via `git stash` round-trip).
- Self-review of `git show 209bdfe`: minimal diff, no client components touched, `LiveLeaderboard`/`filters.tsx`/`export-csv.tsx` unchanged.

## Notes / deferrals

- Theme columns are fetched in a second conditional query instead of widening the always-run `events` select — keeps mixed-view payload unchanged (`theme_config` can be up to 64 KB/event). One extra lightweight query only in the scoped path.
- Deliberate duplication: `scopedLeaderboardEventId` re-expresses the single-event publication check that `resultsLocked` also contains — kept standalone because the plan pins it as its own tested decision; coupling it to `resultsLocked` would silently shift theme scope if that flag's semantics change.
- `supabase/.branches/` untracked directory pre-existed; not mine, not committed.
- No conflicts between plan and spec Draft v2.1 found for this task.


### .superpowers/sdd/2026-10-28-event-themes-p1/task-13-diff.md

# Task 13 Diff package (209bdfe..365e98d)

## Log
```
365e98d feat(theme): organizer Theme tab MVP + saveEventTheme
```

## Diff -U10
```diff
diff --git a/src/app/organizer/events/[id]/page.tsx b/src/app/organizer/events/[id]/page.tsx
index baab365..cabbdab 100644
--- a/src/app/organizer/events/[id]/page.tsx
+++ b/src/app/organizer/events/[id]/page.tsx
@@ -1,20 +1,22 @@
 import { createClient } from '@/lib/supabase/server'
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
 import { Button } from '@/components/ui/button'
 import { Badge } from '@/components/ui/badge'
-import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
 import { Calendar, MapPin, Users, Clock, ArrowLeft, Shirt, BarChart3, ClipboardList } from 'lucide-react'
 import Link from 'next/link'
 import { notFound } from 'next/navigation'
 import { EventSettingsPanel } from '@/components/events/event-settings-panel'
+import { EventPageTabs } from '@/components/events/event-tabs'
+import { ThemeEditor } from '@/components/theme/theme-editor'
 import { getSafeRunnerProfiles } from '@/lib/runner-profiles-safe'
+import type { ThemeTokens } from '@/lib/theme/types'
 import type { Metadata } from 'next'
 
 export const metadata: Metadata = {
   title: 'Event Details - Pelikat',
   description: 'Manage event details and registrations',
 }
 
 type RaceCategory = {
   id: string
   name: string | null
@@ -45,20 +47,23 @@ const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline'> = {
 type EventDetail = {
   id: string
   name: string
   description: string | null
   event_date: string
   location: string | null
   status: EventStatus
   reg_open: string | null
   reg_close: string | null
   results_published: boolean | null
+  organizer_id: string | null
+  theme_preset_id: string | null
+  theme_config: unknown
   race_categories: RaceCategory[] | null
   registrations: Registration[] | null
 }
 
 export default async function OrganizerEventDetailPage({
   params,
 }: {
   params: Promise<{ id: string }>
 }) {
   const [{ id }, supabase] = await Promise.all([
@@ -91,20 +96,33 @@ export default async function OrganizerEventDetailPage({
     registrations: ((event.registrations ?? []) as unknown as { runner_id?: string | null }[]).map((reg) => ({
       ...reg,
       runner_profiles: profileById.get((reg as { runner_id?: string }).runner_id ?? '') ?? null,
     })),
   }
 
   const eventDetail = eventWithProfiles as EventDetail
   const raceCategories = eventDetail.race_categories ?? []
   const registrations = eventDetail.registrations ?? []
 
+  // Theme tab inputs: system preset gallery (public read per 076 RLS) and
+  // caller ownership (read-only tab for non-owners — spec §8.6).
+  const [{ data: presets }, { data: { user } }] = await Promise.all([
+    supabase
+      .from('theme_presets')
+      .select('id, name, tokens')
+      .eq('kind', 'system')
+      .order('name'),
+    supabase.auth.getUser(),
+  ])
+  const myOrganizerId = user?.app_metadata?.organizer_id
+  const canEdit = typeof myOrganizerId === 'string' && eventDetail.organizer_id === myOrganizerId
+
   const stats = {
     totalRegistrations: registrations.length,
     checkedIn: registrations.filter((registration) => registration.checked_in).length,
     categories: raceCategories.length,
   }
 
   const statusVariant = STATUS_VARIANTS
 
   return (
     <div className="space-y-6">
@@ -178,106 +196,101 @@ export default async function OrganizerEventDetailPage({
         <Card className="border-border">
           <CardHeader className="pb-2">
             <CardTitle className="text-sm font-medium">Revenue</CardTitle>
           </CardHeader>
           <CardContent>
             <div className="text-2xl font-bold">$0</div>
           </CardContent>
         </Card>
       </div>
 
-      <Tabs defaultValue="overview" className="space-y-4">
-        <TabsList>
-          <TabsTrigger value="overview">Overview</TabsTrigger>
-          <TabsTrigger value="registrations">Registrations</TabsTrigger>
-          <TabsTrigger value="categories">Categories</TabsTrigger>
-        </TabsList>
-
-        <TabsContent value="overview" className="space-y-4">
-          <Card className="border-border">
-            <CardHeader>
-              <CardTitle>Event Description</CardTitle>
-            </CardHeader>
-            <CardContent>
-              <p className="text-muted-foreground">
-                {eventDetail.description || 'No description provided'}
-              </p>
-            </CardContent>
-          </Card>
-
-          <div className="grid gap-4 md:grid-cols-2">
+      <EventPageTabs
+        overview={
+          <>
             <Card className="border-border">
               <CardHeader>
-                <CardTitle>Quick Actions</CardTitle>
+                <CardTitle>Event Description</CardTitle>
               </CardHeader>
-              <CardContent className="space-y-2">
-                <Button variant="outline" className="w-full justify-start" asChild>
-                  <Link href={`/organizer/events/${eventDetail.id}/registrations`}>
-                    <ClipboardList className="mr-2 h-4 w-4" />
-                    Registrations &amp; Guests
-                  </Link>
-                </Button>
-                <Link href={`/organizer/events/${eventDetail.id}/checkin`} className="block">
-                  <Button variant="outline" className="w-full justify-start">
-                    <Users className="mr-2 h-4 w-4" />
-                    Check-in Dashboard
-                  </Button>
-                </Link>
-                <Link href={`/organizer/events/${eventDetail.id}/repc`} className="block">
-                  <Button variant="outline" className="w-full justify-start">
-                    <Shirt className="mr-2 h-4 w-4" />
-                    REPC Inventory
-                  </Button>
-                </Link>
-                <Link href={`/organizer/events/${eventDetail.id}/photos`} className="block">
-                  <Button variant="outline" className="w-full justify-start">
-                    <Clock className="mr-2 h-4 w-4" />
-                    Photo Management
-                  </Button>
-                </Link>
-                <Link href={`/organizer/events/${eventDetail.id}/leaderboard`} className="block">
-                  <Button variant="outline" className="w-full justify-start">
-                    <Users className="mr-2 h-4 w-4" />
-                    Leaderboard
-                  </Button>
-                </Link>
+              <CardContent>
+                <p className="text-muted-foreground">
+                  {eventDetail.description || 'No description provided'}
+                </p>
               </CardContent>
             </Card>
 
-            <Card className="border-border">
-              <CardHeader>
-                <CardTitle>Race Categories</CardTitle>
-              </CardHeader>
-              <CardContent>
-                {raceCategories.length > 0 ? (
-                  <div className="space-y-2">
-                    {raceCategories.map((cat) => (
-                      <div key={cat.id} className="flex items-center justify-between">
-                        <span className="text-sm">{cat.name}</span>
-                        <Badge variant="outline">{cat.gender || "Open"}</Badge>
-                      </div>
-                    ))}
-                  </div>
-                ) : (
-                  <div className="text-center py-4">
-                    <p className="text-sm text-muted-foreground mb-3">No categories yet</p>
-                    <Link href={`/organizer/events/${eventDetail.id}/categories`}>
-                      <Button size="sm" variant="outline">Manage Categories</Button>
+            <div className="grid gap-4 md:grid-cols-2">
+              <Card className="border-border">
+                <CardHeader>
+                  <CardTitle>Quick Actions</CardTitle>
+                </CardHeader>
+                <CardContent className="space-y-2">
+                  <Button variant="outline" className="w-full justify-start" asChild>
+                    <Link href={`/organizer/events/${eventDetail.id}/registrations`}>
+                      <ClipboardList className="mr-2 h-4 w-4" />
+                      Registrations &amp; Guests
                     </Link>
-                  </div>
-                )}
-              </CardContent>
-            </Card>
-          </div>
-        </TabsContent>
+                  </Button>
+                  <Link href={`/organizer/events/${eventDetail.id}/checkin`} className="block">
+                    <Button variant="outline" className="w-full justify-start">
+                      <Users className="mr-2 h-4 w-4" />
+                      Check-in Dashboard
+                    </Button>
+                  </Link>
+                  <Link href={`/organizer/events/${eventDetail.id}/repc`} className="block">
+                    <Button variant="outline" className="w-full justify-start">
+                      <Shirt className="mr-2 h-4 w-4" />
+                      REPC Inventory
+                    </Button>
+                  </Link>
+                  <Link href={`/organizer/events/${eventDetail.id}/photos`} className="block">
+                    <Button variant="outline" className="w-full justify-start">
+                      <Clock className="mr-2 h-4 w-4" />
+                      Photo Management
+                    </Button>
+                  </Link>
+                  <Link href={`/organizer/events/${eventDetail.id}/leaderboard`} className="block">
+                    <Button variant="outline" className="w-full justify-start">
+                      <Users className="mr-2 h-4 w-4" />
+                      Leaderboard
+                    </Button>
+                  </Link>
+                </CardContent>
+              </Card>
 
-        <TabsContent value="registrations" className="space-y-4">
+              <Card className="border-border">
+                <CardHeader>
+                  <CardTitle>Race Categories</CardTitle>
+                </CardHeader>
+                <CardContent>
+                  {raceCategories.length > 0 ? (
+                    <div className="space-y-2">
+                      {raceCategories.map((cat) => (
+                        <div key={cat.id} className="flex items-center justify-between">
+                          <span className="text-sm">{cat.name}</span>
+                          <Badge variant="outline">{cat.gender || "Open"}</Badge>
+                        </div>
+                      ))}
+                    </div>
+                  ) : (
+                    <div className="text-center py-4">
+                      <p className="text-sm text-muted-foreground mb-3">No categories yet</p>
+                      <Link href={`/organizer/events/${eventDetail.id}/categories`}>
+                        <Button size="sm" variant="outline">Manage Categories</Button>
+                      </Link>
+                    </div>
+                  )}
+                </CardContent>
+              </Card>
+            </div>
+          </>
+        }
+        registrations={
           <Card className="border-border">
             <CardHeader>
               <CardTitle>Registrations</CardTitle>
               <CardDescription>All runner registrations for this event</CardDescription>
             </CardHeader>
             <CardContent>
               {registrations.length > 0 ? (
                 <div className="space-y-4">
                   {registrations.slice(0, 10).map((reg) => (
                     <div key={reg.id} className="flex items-center justify-between border-b pb-2">
@@ -296,23 +309,22 @@ export default async function OrganizerEventDetailPage({
                         </Badge>
                       </div>
                     </div>
                   ))}
                 </div>
               ) : (
                 <p className="text-muted-foreground">No registrations yet</p>
               )}
             </CardContent>
           </Card>
-        </TabsContent>
-
-        <TabsContent value="categories" className="space-y-4">
+        }
+        categories={
           <Card className="border-border">
             <CardHeader className="flex flex-row items-start justify-between">
               <div>
                 <CardTitle>Race Categories</CardTitle>
                 <CardDescription>Manage race categories for this event</CardDescription>
               </div>
               <Link href={`/organizer/events/${eventDetail.id}/categories`}>
                 <Button size="sm" variant="outline">Manage All</Button>
               </Link>
             </CardHeader>
@@ -337,15 +349,30 @@ export default async function OrganizerEventDetailPage({
               ) : (
                 <div className="text-center py-8">
                   <p className="text-muted-foreground mb-4">No categories yet</p>
                   <Link href={`/organizer/events/${eventDetail.id}/categories`}>
                     <Button>Add Category</Button>
                   </Link>
                 </div>
               )}
             </CardContent>
           </Card>
-        </TabsContent>
-      </Tabs>
+        }
+        theme={
+          <ThemeEditor
+            eventId={eventDetail.id}
+            canEdit={canEdit}
+            savedPresetId={eventDetail.theme_preset_id ?? null}
+            // theme_config is hand-craftable JSONB — the editor seeds
+            // defensively (non-object shapes degrade to an empty draft).
+            savedConfig={(eventDetail.theme_config ?? null) as ThemeTokens | null}
+            presets={(presets ?? []).map((preset) => ({
+              id: preset.id,
+              name: preset.name,
+              tokens: preset.tokens as ThemeTokens,
+            }))}
+          />
+        }
+      />
     </div>
   )
 }
diff --git a/src/components/events/actions.ts b/src/components/events/actions.ts
index 42fc1dd..0e1a9dc 100644
--- a/src/components/events/actions.ts
+++ b/src/components/events/actions.ts
@@ -9,20 +9,22 @@ import { isConfirmedStatus } from '@/lib/registration-status'
 // module; a barreled re-export of another module's action throws a build
 // error), so call sites import them from their defining module directly.
 import {
   REPC_CHECK_IN_RPC,
   normalizeRepcCheckInResult,
   type RepcCheckInResult,
   type RepcCheckInRpcRow,
 } from '@/lib/repc'
 import { requireAuth } from '@/lib/auth/requireUser'
 import { getOrganizerSubscriptionPrice } from '@/lib/subscription'
+import { validateThemeConfig } from '@/lib/theme/validate'
+import type { ThemeTokens } from '@/lib/theme/types'
 import { revalidatePath } from 'next/cache'
 import { redirect } from 'next/navigation'
 
 // ─────────────────────────────────────────────────────────────────────────────
 // Registration Actions
 // ─────────────────────────────────────────────────────────────────────────────
 
 // ── HitPay checkout (server-side funnel via Django) ──────────────────────────
 // The browser never sees the HitPay API. Amount and reference come from
 // the server; confirmation happens only through the signed webhook in
@@ -346,20 +348,100 @@ export async function updateEventDates(
   const { error } = await supabase
     .from('events')
     .update(updates)
     .eq('id', eventId)
 
   if (error) throw new Error(error.message)
 
   revalidatePath(`/organizer/events/${eventId}`)
 }
 
+// ─────────────────────────────────────────────────────────────────────────────
+// Theme Actions (Event Themes P1 — Task 13)
+// ─────────────────────────────────────────────────────────────────────────────
+
+export type SaveEventThemeResult =
+  | { ok: true; warnings: string[] }
+  | { ok: false; error: string }
+
+/**
+ * Write an event's theme (both columns: `theme_preset_id` + `theme_config`).
+ *
+ * Server-side guarantees (carried requirements):
+ *  - ownership: the 077 anti-IDOR trigger bypasses postgres/service_role and
+ *    the BFF path has no DB-level ownership check — the event must belong to
+ *    the caller's organizer BEFORE anything is written;
+ *  - preset reference: system OR owned by the caller's organizer (same
+ *    trigger-bypass rationale, defense in depth);
+ *  - validation: validateThemeConfig re-runs HERE — client validation is UX
+ *    only (Task 9). Hard-blocks on `errors` (only the primary <3:1 rule);
+ *    warnings ride along as structured strings (render as text children).
+ *
+ * Reset semantics (Task 3/9 carries): per-key reset = the draft omits the
+ * key (JSON nulls are rejected at every level); full reset = null/null.
+ */
+export async function saveEventTheme(
+  eventId: string,
+  input: { theme_preset_id: string | null; theme_config: ThemeTokens | null }
+): Promise<SaveEventThemeResult> {
+  const { supabase, user } = await requireAuth()
+
+  const organizerId = user.app_metadata?.organizer_id
+  if (!organizerId) return { ok: false, error: 'Organizer profile not found' }
+
+  const { data: event } = await supabase
+    .from('events')
+    .select('id, organizer_id')
+    .eq('id', eventId)
+    .single()
+
+  if (!event || event.organizer_id !== organizerId) {
+    return { ok: false, error: 'You can only theme events you organize.' }
+  }
+
+  const presetId = input.theme_preset_id || null
+  if (presetId !== null) {
+    const { data: preset } = await supabase
+      .from('theme_presets')
+      .select('id, kind, organizer_id')
+      .eq('id', presetId)
+      .maybeSingle()
+
+    const permitted =
+      preset != null &&
+      ((preset.kind === 'system' && preset.organizer_id === null) ||
+        (preset.kind === 'organizer' && preset.organizer_id === organizerId))
+
+    if (!permitted) return { ok: false, error: 'Unknown or not permitted theme preset.' }
+  }
+
+  const validation = validateThemeConfig(input.theme_config)
+  if (!validation.ok) {
+    return { ok: false, error: validation.errors.join(' · ') }
+  }
+
+  const { error } = await supabase
+    .from('events')
+    .update({ theme_preset_id: presetId, theme_config: input.theme_config })
+    .eq('id', eventId)
+
+  if (error) return { ok: false, error: error.message }
+
+  // Organizer view + every themed runner consumer (runner event page and the
+  // single-event leaderboard, Task 12).
+  revalidatePath(`/organizer/events/${eventId}`)
+  revalidatePath(`/runner/events/${eventId}`)
+  revalidatePath('/runner/leaderboard')
+
+  return { ok: true, warnings: validation.warnings }
+}
+
 // ─────────────────────────────────────────────────────────────────────────────
 // Category Actions
 // ─────────────────────────────────────────────────────────────────────────────
 
 export async function createCategory(eventId: string, formData: FormData) {
   const { supabase } = await requireAuth()
 
   const { data: event } = await supabase
     .from('events')
     .select('organizer_id')
diff --git a/src/components/events/event-tabs.tsx b/src/components/events/event-tabs.tsx
new file mode 100644
index 0000000..84255b9
--- /dev/null
+++ b/src/components/events/event-tabs.tsx
@@ -0,0 +1,129 @@
+'use client'
+
+import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
+import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
+import {
+  AlertDialog,
+  AlertDialogAction,
+  AlertDialogCancel,
+  AlertDialogContent,
+  AlertDialogDescription,
+  AlertDialogFooter,
+  AlertDialogHeader,
+  AlertDialogTitle,
+} from '@/components/ui/alert-dialog'
+
+/**
+ * Client shell for the organizer event page Tabs (server page passes the
+ * tab contents as serializable nodes). Exists so the Theme tab can have a
+ * DIRTY-STATE BADGE on its trigger and a leave confirmation (AlertDialog,
+ * plan Task 13) before a tab switch discards the unsaved draft — a server
+ * component cannot intercept Radix tab switches.
+ */
+
+const ThemeDirtyContext = createContext<{ report: (dirty: boolean) => void } | null>(null)
+
+/** The Theme editor reports unsaved-draft state up to the tabs shell. */
+export function useThemeDirtyReporter(): ((dirty: boolean) => void) | null {
+  const ctx = useContext(ThemeDirtyContext)
+  return ctx?.report ?? null
+}
+
+export function EventPageTabs({
+  overview,
+  registrations,
+  categories,
+  theme,
+}: {
+  overview: ReactNode
+  registrations: ReactNode
+  categories: ReactNode
+  theme: ReactNode
+}) {
+  const [value, setValue] = useState('overview')
+  const [dirty, setDirty] = useState(false)
+  const [leaveTo, setLeaveTo] = useState<string | null>(null)
+
+  // Real navigation (route links, tab close) with an unsaved draft —
+  // browser-native confirm; in-app tab switches use the AlertDialog below.
+  useEffect(() => {
+    if (!dirty) return
+    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
+    window.addEventListener('beforeunload', handler)
+    return () => window.removeEventListener('beforeunload', handler)
+  }, [dirty])
+
+  return (
+    <ThemeDirtyContext.Provider value={{ report: setDirty }}>
+      <Tabs
+        value={value}
+        onValueChange={(v) => {
+          // While the theme draft is dirty, any switch away would unmount
+          // (and lose) it — confirm first. Dirty implies the theme tab is
+          // active: the editor resets the flag on unmount.
+          if (dirty) setLeaveTo(v)
+          else setValue(v)
+        }}
+        className="space-y-4"
+      >
+        <TabsList>
+          <TabsTrigger value="overview">Overview</TabsTrigger>
+          <TabsTrigger value="registrations">Registrations</TabsTrigger>
+          <TabsTrigger value="categories">Categories</TabsTrigger>
+          <TabsTrigger value="theme">
+            Theme
+            {dirty && (
+              <span
+                aria-hidden
+                data-dirty-badge
+                className="h-1.5 w-1.5 rounded-full bg-primary"
+              />
+            )}
+          </TabsTrigger>
+        </TabsList>
+
+        <TabsContent value="overview" className="space-y-4">
+          {overview}
+        </TabsContent>
+        <TabsContent value="registrations" className="space-y-4">
+          {registrations}
+        </TabsContent>
+        <TabsContent value="categories" className="space-y-4">
+          {categories}
+        </TabsContent>
+        <TabsContent value="theme" className="space-y-4">
+          {theme}
+        </TabsContent>
+      </Tabs>
+
+      <AlertDialog
+        open={leaveTo !== null}
+        onOpenChange={(open) => {
+          if (!open) setLeaveTo(null)
+        }}
+      >
+        <AlertDialogContent>
+          <AlertDialogHeader>
+            <AlertDialogTitle>Leave with unsaved theme changes?</AlertDialogTitle>
+            <AlertDialogDescription>
+              Your theme edits have not been saved. Switching tabs now will discard them.
+            </AlertDialogDescription>
+          </AlertDialogHeader>
+          <AlertDialogFooter>
+            <AlertDialogCancel>Stay on Theme</AlertDialogCancel>
+            <AlertDialogAction
+              onClick={() => {
+                const target = leaveTo
+                setLeaveTo(null)
+                setDirty(false)
+                if (target) setValue(target)
+              }}
+            >
+              Discard changes
+            </AlertDialogAction>
+          </AlertDialogFooter>
+        </AlertDialogContent>
+      </AlertDialog>
+    </ThemeDirtyContext.Provider>
+  )
+}
diff --git a/src/components/theme/mini-theme-preview.tsx b/src/components/theme/mini-theme-preview.tsx
new file mode 100644
index 0000000..5233bae
--- /dev/null
+++ b/src/components/theme/mini-theme-preview.tsx
@@ -0,0 +1,63 @@
+'use client'
+
+import { buildStyleVars } from '@/lib/theme/css'
+import type { ResolvedTheme } from '@/lib/theme/types'
+import { cn } from '@/lib/utils'
+
+/**
+ * MiniThemePreview — spec §8: preset gallery cards AND the editor's live
+ * preview render through the SAME `.event-theme` engine as the runner pages
+ * (EventThemeScope). No token mappings outside the stylesheet whitelist —
+ * the mock consumes themed tokens via Tailwind classes (`text-primary`,
+ * `bg-primary text-primary-foreground`, …) which resolve to the mapped vars.
+ *
+ * Pure CSS vars — no image generation, no client theme logic.
+ */
+export function MiniThemePreview({
+  resolved,
+  eventId,
+  className,
+}: {
+  resolved: ResolvedTheme
+  /** Two-arg form (Task 10 BINDING carry): the themed font family is bound
+   * per event id; P1 fonts are unset so no var emits today, but passing the
+   * real id keeps the preview font-correct when P2 lands. */
+  eventId?: string
+  className?: string
+}) {
+  return (
+    <div
+      className={cn('event-theme rounded-lg border bg-background p-3', className)}
+      style={buildStyleVars(resolved, eventId)}
+    >
+      {/* Themed event-card mock */}
+      <div className="space-y-2 rounded-md border bg-card p-3">
+        <p className="text-sm font-bold text-primary">Riverside Run 2026</p>
+        <div className="flex items-center gap-1.5">
+          <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
+            42.5K
+          </span>
+          <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
+            Open
+          </span>
+        </div>
+        <span className="block w-full rounded-md bg-primary px-3 py-1.5 text-center text-sm font-medium text-primary-foreground">
+          Register
+        </span>
+      </div>
+      {/* Themed leaderboard-row mock */}
+      <div className="mt-2 flex items-center gap-2 rounded-md border bg-card px-3 py-2">
+        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
+          1
+        </span>
+        <span className="flex-1 truncate text-sm">Runner name</span>
+        <span className="text-xs tabular-nums text-muted-foreground">00:42:07</span>
+      </div>
+      {/* Vocabulary live preview — resolved labels (fallbacks filled) as plain text children */}
+      <p className="mt-2 truncate text-xs text-muted-foreground">
+        {resolved.labels.checkpoint_label} · {resolved.labels.medal_label} ·{' '}
+        {resolved.labels.bib_label} #1234
+      </p>
+    </div>
+  )
+}
diff --git a/src/components/theme/theme-editor.tsx b/src/components/theme/theme-editor.tsx
new file mode 100644
index 0000000..ddb10c5
--- /dev/null
+++ b/src/components/theme/theme-editor.tsx
@@ -0,0 +1,454 @@
+'use client'
+
+import { useEffect, useMemo, useState } from 'react'
+import { Button } from '@/components/ui/button'
+import { Input } from '@/components/ui/input'
+import { Label } from '@/components/ui/label'
+import { Badge } from '@/components/ui/badge'
+import { Loader2, Moon, Paintbrush, RotateCcw, Save, Sun } from 'lucide-react'
+import { saveEventTheme } from '@/components/events/actions'
+import { useThemeDirtyReporter } from '@/components/events/event-tabs'
+import { MiniThemePreview } from '@/components/theme/mini-theme-preview'
+import { validateThemeConfig } from '@/lib/theme/validate'
+import { deriveTheme } from '@/lib/theme/resolve'
+import { normalizeThemeDraft, seedThemeDraft, themeDraftEquals } from '@/lib/theme/draft'
+import {
+  LABEL_KEYS,
+  LABEL_MAX,
+  fallbackLabel,
+  labelPreview,
+  sanitizeLabel,
+} from '@/lib/theme/labels'
+import { PLATFORM_BG_HEX, contrastRatio, hexToOklch, oklchToString } from '@/lib/theme/color'
+import type { LabelKey, ThemeTokens } from '@/lib/theme/types'
+import { cn } from '@/lib/utils'
+
+export type ThemePresetOption = {
+  id: string
+  name: string
+  tokens: ThemeTokens
+}
+
+const COLOR_ROLES = ['primary', 'secondary', 'accent', 'ring'] as const
+type ColorRole = (typeof COLOR_ROLES)[number]
+
+const ROLE_LABELS: Record<ColorRole, string> = {
+  primary: 'Primary',
+  secondary: 'Secondary',
+  accent: 'Accent',
+  ring: 'Ring',
+}
+
+// Same strict HEX contract the tokens use (validate.ts / 076).
+const HEX_RE = /^#[0-9a-fA-F]{6}$/
+
+/**
+ * Theme tab (spec §8, plan Task 13): preset gallery + custom color pickers +
+ * vocabulary fields with a live preview — everything renders through the same
+ * `.event-theme` engine as the runner pages. The WCAG gate UX: Save is
+ * hard-blocked only on the validateThemeConfig `errors` (the primary <3:1
+ * rule); secondary/accent/ring warn-and-degrade.
+ */
+export function ThemeEditor({
+  eventId,
+  canEdit,
+  savedPresetId,
+  savedConfig,
+  presets,
+}: {
+  eventId: string
+  canEdit: boolean
+  savedPresetId: string | null
+  savedConfig: ThemeTokens | null
+  presets: ThemePresetOption[]
+}) {
+  const [selectedPresetId, setSelectedPresetId] = useState(savedPresetId)
+  const [draft, setDraft] = useState<ThemeTokens>(() => seedThemeDraft(savedConfig))
+  const [baseline, setBaseline] = useState(() => ({
+    presetId: savedPresetId,
+    config: normalizeThemeDraft(seedThemeDraft(savedConfig)),
+  }))
+  const [saving, setSaving] = useState(false)
+  const [actionError, setActionError] = useState<string | null>(null)
+  const [saveWarnings, setSaveWarnings] = useState<string[]>([])
+  const [dark, setDark] = useState(false)
+
+  const payload = useMemo(() => normalizeThemeDraft(draft), [draft])
+  const validation = useMemo(() => validateThemeConfig(payload), [payload])
+  const dirty =
+    !themeDraftEquals(payload, baseline.config) || selectedPresetId !== baseline.presetId
+
+  const selectedPreset = presets.find((p) => p.id === selectedPresetId) ?? null
+  const previewResolved = useMemo(
+    () => deriveTheme(selectedPreset?.tokens ?? {}, payload, selectedPresetId),
+    [selectedPreset, payload, selectedPresetId],
+  )
+
+  // Dirty-state badge on the tab + leave confirmation (EventPageTabs shell).
+  const reportDirty = useThemeDirtyReporter()
+  useEffect(() => {
+    reportDirty?.(dirty)
+    return () => reportDirty?.(false)
+  }, [dirty, reportDirty])
+
+  function setColor(role: ColorRole, hex: string) {
+    setDraft((d) => ({ ...d, colors: { ...(d.colors ?? {}), [role]: hex } }))
+  }
+
+  // Per-key reset = OMIT the key (carried requirement): the preset value (or
+  // the platform default, for Custom) flows through the merge instead.
+  function resetColor(role: ColorRole) {
+    setDraft((d) => {
+      const colors = { ...(d.colors ?? {}) }
+      delete colors[role]
+      const next = { ...d }
+      if (Object.keys(colors).length > 0) next.colors = colors
+      else delete next.colors
+      return next as ThemeTokens
+    })
+  }
+
+  function setVocab(key: LabelKey, raw: string) {
+    const clean = sanitizeLabel(raw)
+    setDraft((d) => {
+      const vocabulary = { ...(d.vocabulary ?? {}) }
+      if (clean.length === 0) delete vocabulary[key]
+      else vocabulary[key] = clean
+      const next = { ...d }
+      if (Object.keys(vocabulary).length > 0) next.vocabulary = vocabulary
+      else delete next.vocabulary
+      return next as ThemeTokens
+    })
+  }
+
+  async function handleSave() {
+    if (!canEdit || saving || !validation.ok || !dirty) return
+    setSaving(true)
+    setActionError(null)
+    setSaveWarnings([])
+    try {
+      const result = await saveEventTheme(eventId, {
+        theme_preset_id: selectedPresetId,
+        theme_config: payload,
+      })
+      if (result.ok) {
+        setBaseline({ presetId: selectedPresetId, config: payload })
+        setSaveWarnings(result.warnings)
+      } else {
+        setActionError(result.error)
+      }
+    } catch {
+      setActionError('Could not save the theme. Please try again.')
+    } finally {
+      setSaving(false)
+    }
+  }
+
+  return (
+    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
+      <div className="space-y-6">
+        {!canEdit && (
+          <p className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
+            You can only theme events you organize — this tab is read-only.
+          </p>
+        )}
+
+        {/* ── Preset gallery (cards rendered through the same .event-theme engine) ── */}
+        <section className="space-y-3">
+          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
+            Preset
+          </h3>
+          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
+            {presets.map((preset) => (
+              <button
+                key={preset.id}
+                type="button"
+                disabled={!canEdit}
+                onClick={() => setSelectedPresetId(preset.id)}
+                aria-pressed={selectedPresetId === preset.id}
+                className={cn(
+                  'rounded-lg border p-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
+                  selectedPresetId === preset.id
+                    ? 'border-primary ring-2 ring-ring/50'
+                    : 'hover:border-primary/50',
+                )}
+              >
+                <MiniThemePreview resolved={deriveTheme(preset.tokens, null, preset.id)} eventId={eventId} />
+                <p className="mt-1.5 truncate text-xs font-medium">{preset.name}</p>
+              </button>
+            ))}
+            <button
+              type="button"
+              disabled={!canEdit}
+              onClick={() => setSelectedPresetId(null)}
+              aria-pressed={selectedPresetId === null}
+              className={cn(
+                'flex min-h-[80px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-2 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-60',
+                selectedPresetId === null
+                  ? 'border-primary ring-2 ring-ring/50'
+                  : 'hover:border-primary/50',
+              )}
+            >
+              <Paintbrush className="h-4 w-4 text-muted-foreground" />
+              <span className="text-xs font-medium">Custom</span>
+              <span className="text-xs text-muted-foreground">Platform + your overrides</span>
+            </button>
+          </div>
+        </section>
+
+        {/* ── Colors: native picker + HEX, live oklch chip, WCAG meter, per-row reset ── */}
+        <section className="space-y-3">
+          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
+            Colors
+          </h3>
+          <div className="space-y-2">
+            {COLOR_ROLES.map((role) => (
+              <ColorRow
+                key={role}
+                role={role}
+                value={effectiveColor(draft, selectedPreset, role)}
+                overridden={isOverridden(draft, role)}
+                canEdit={canEdit}
+                onChange={(hex) => setColor(role, hex)}
+                onReset={() => resetColor(role)}
+              />
+            ))}
+          </div>
+        </section>
+
+        {/* ── Vocabulary: six inputs, live 40-char cap + sanitized on input ── */}
+        <section className="space-y-3">
+          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
+            Vocabulary
+          </h3>
+          <div className="grid gap-3 sm:grid-cols-2">
+            {LABEL_KEYS.map((key) => {
+              const labelKey = key as LabelKey
+              const override = draft.vocabulary?.[labelKey]
+              const presetValue = selectedPreset?.tokens?.vocabulary?.[labelKey]
+              const effective =
+                override ??
+                (typeof presetValue === 'string' ? presetValue : fallbackLabel(labelKey))
+              return (
+                <div key={key} className="space-y-1">
+                  <div className="flex items-center justify-between">
+                    <Label htmlFor={`vocab-${key}`} className="text-xs">
+                      {fallbackLabel(labelKey)}
+                    </Label>
+                    <span className="text-xs text-muted-foreground">
+                      {(override ?? '').length}/{LABEL_MAX}
+                    </span>
+                  </div>
+                  <div className="flex gap-1.5">
+                    <Input
+                      id={`vocab-${key}`}
+                      value={override ?? ''}
+                      maxLength={LABEL_MAX}
+                      disabled={!canEdit}
+                      placeholder={typeof presetValue === 'string' ? presetValue : fallbackLabel(labelKey)}
+                      onChange={(e) => setVocab(labelKey, e.target.value)}
+                      className="h-8 text-sm"
+                    />
+                    {override !== undefined && (
+                      <Button
+                        type="button"
+                        variant="ghost"
+                        size="icon"
+                        disabled={!canEdit}
+                        aria-label={`Reset ${fallbackLabel(labelKey)}`}
+                        onClick={() => setVocab(labelKey, '')}
+                      >
+                        <RotateCcw className="h-3 w-3" />
+                      </Button>
+                    )}
+                  </div>
+                  <p className="text-xs text-muted-foreground">{labelPreview(effective)}</p>
+                </div>
+              )
+            })}
+          </div>
+        </section>
+      </div>
+
+      {/* ── Sticky live preview + save bar ─────────────────────────────── */}
+      <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
+        <div className="flex items-center justify-between">
+          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
+            Live preview
+          </h3>
+          <Button
+            type="button"
+            variant="ghost"
+            size="icon"
+            aria-label="Toggle dark mode preview"
+            onClick={() => setDark((v) => !v)}
+          >
+            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
+          </Button>
+        </div>
+        {/* `.dark` ancestor + .event-theme descendant = pure-CSS dark re-resolution */}
+        <div className={dark ? 'dark' : undefined}>
+          <MiniThemePreview resolved={previewResolved} eventId={eventId} />
+        </div>
+
+        {canEdit && (
+          <div className="space-y-2 rounded-lg border border-border p-3">
+            <div className="flex items-center justify-between">
+              <span className="text-sm font-medium">Save</span>
+              {dirty && <Badge variant="secondary">Unsaved changes</Badge>}
+            </div>
+            {validation.errors.map((error) => (
+              <p key={error} className="text-xs text-destructive">
+                {error}
+              </p>
+            ))}
+            {[...new Set([...validation.warnings, ...saveWarnings])].map((warning) => (
+              <p key={warning} className="text-xs text-amber-600 dark:text-amber-400">
+                {warning}
+              </p>
+            ))}
+            {actionError && <p className="text-xs text-destructive">{actionError}</p>}
+            <Button
+              type="button"
+              onClick={handleSave}
+              disabled={saving || !validation.ok || !dirty}
+              className="w-full"
+            >
+              {saving ? (
+                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
+              ) : (
+                <Save className="mr-2 h-4 w-4" />
+              )}
+              Save theme
+            </Button>
+          </div>
+        )}
+      </div>
+    </div>
+  )
+}
+
+function isOverridden(draft: ThemeTokens, role: ColorRole): boolean {
+  return typeof draft.colors?.[role] === 'string'
+}
+
+function effectiveColor(
+  draft: ThemeTokens,
+  preset: ThemePresetOption | null,
+  role: ColorRole,
+): string {
+  const override = draft.colors?.[role]
+  if (typeof override === 'string') return override
+  const presetValue = preset?.tokens?.colors?.[role]
+  return typeof presetValue === 'string' ? presetValue : ''
+}
+
+/**
+ * One color row: native picker + HEX field (valid full HEX commits to the
+ * draft mid-typing; invalid input stays local until it is valid or reverted),
+ * live oklch chip, WCAG meter, per-row reset.
+ */
+function ColorRow({
+  role,
+  value,
+  overridden,
+  canEdit,
+  onChange,
+  onReset,
+}: {
+  role: ColorRole
+  value: string
+  overridden: boolean
+  canEdit: boolean
+  onChange: (hex: string) => void
+  onReset: () => void
+}) {
+  const [text, setText] = useState(value)
+  // Follow preset switches / resets: adjust-on-prop-change during render (the
+  // React-documented pattern — avoids a cascading-render effect).
+  const [lastValue, setLastValue] = useState(value)
+  if (value !== lastValue) {
+    setLastValue(value)
+    setText(value)
+  }
+
+  const valid = HEX_RE.test(text)
+  const ratio = valid ? contrastRatio(text, PLATFORM_BG_HEX) : null
+
+  // Mirror of validate.ts's contrastGate verdicts (validate.ts stays the
+  // save-gate authority — this is per-row presentation only).
+  const verdict =
+    ratio === null
+      ? null
+      : ratio < 3
+        ? role === 'primary'
+          ? 'blocked'
+          : 'degrades'
+        : 'pass'
+
+  return (
+    <div className="flex items-center gap-2 rounded-lg border border-border p-2.5">
+      <span
+        aria-hidden
+        className="h-8 w-8 shrink-0 rounded-md border border-border"
+        style={valid ? { backgroundColor: text } : undefined}
+      />
+      <div className="min-w-0 flex-1 space-y-0.5">
+        <div className="flex items-center gap-2">
+          <Label className="text-xs">{ROLE_LABELS[role]}</Label>
+          {valid && (
+            <span className="font-mono text-xs text-muted-foreground">{oklchToString(hexToOklch(text))}</span>
+          )}
+        </div>
+        <p className="text-xs text-muted-foreground">
+          {ratio === null
+            ? 'Enter a 6-digit HEX color'
+            : `${ratio.toFixed(2)}:1 vs platform background${
+                verdict === 'pass'
+                  ? ' — pass'
+                  : verdict === 'blocked'
+                    ? ' — save blocked'
+                    : ' — will degrade to platform color'
+              } · dark mode auto (derived)`}
+        </p>
+      </div>
+      <input
+        type="color"
+        aria-label={`${ROLE_LABELS[role]} color picker`}
+        value={valid ? text : '#000000'}
+        disabled={!canEdit}
+        onChange={(e) => {
+          setText(e.target.value)
+          onChange(e.target.value)
+        }}
+        className="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
+      />
+      <Input
+        aria-label={`${ROLE_LABELS[role]} hex value`}
+        value={text}
+        maxLength={7}
+        disabled={!canEdit}
+        placeholder="Platform"
+        onChange={(e) => {
+          const next = e.target.value
+          setText(next)
+          if (HEX_RE.test(next)) onChange(next)
+        }}
+        onBlur={() => setText(value)} // revert invalid/partial input
+        className="h-8 w-24 font-mono text-xs"
+      />
+      {overridden && (
+        <Button
+          type="button"
+          variant="ghost"
+          size="icon"
+          disabled={!canEdit}
+          aria-label={`Reset ${ROLE_LABELS[role]} to preset`}
+          onClick={onReset}
+        >
+          <RotateCcw className="h-3 w-3" />
+        </Button>
+      )}
+    </div>
+  )
+}
diff --git a/src/lib/theme/draft.ts b/src/lib/theme/draft.ts
new file mode 100644
index 0000000..951cd01
--- /dev/null
+++ b/src/lib/theme/draft.ts
@@ -0,0 +1,88 @@
+/**
+ * Theme-editor draft state (Task 13, spec §8). Isomorphic pure helpers over
+ * the `events.theme_config`-shaped override draft.
+ *
+ * Reset semantics (carried requirements, Tasks 3/9):
+ *  - per-key reset = OMIT the key — explicit JSON nulls are rejected at every
+ *    nesting level (validate.ts mirror + 076 validator), so the editor never
+ *    produces them;
+ *  - a draft with nothing left normalizes to null = full reset (the action
+ *    writes `theme_config: null`, SQL NULL).
+ */
+import { LABEL_KEYS } from './labels'
+import type { ThemeTokens } from './types'
+
+const SECTION_KEYS = ['colors', 'typography', 'assets', 'vocabulary'] as const
+
+// Canonical key order for the sections the P1 editor edits (colors +
+// vocabulary). jsonb row order is not stable; rebuilding in this order keeps
+// equality checks stable. Same list as validate.ts/resolve.ts (kept local,
+// mirroring the codebase's per-module self-containment).
+const COLOR_KEYS = ['primary', 'secondary', 'accent', 'background', 'foreground', 'ring'] as const
+
+function isPlainObject(v: unknown): v is Record<string, unknown> {
+  return typeof v === 'object' && v !== null && !Array.isArray(v)
+}
+
+/**
+ * DB row (untrusted JSONB shape) → a safe editable draft. Non-object sections
+ * (including explicit section nulls) are omitted — they are reset-to-platform
+ * per merge semantics, and carrying them would trip the write validator.
+ */
+export function seedThemeDraft(config: unknown): ThemeTokens {
+  if (!isPlainObject(config)) return {}
+  const out: Record<string, unknown> = {}
+
+  const colors = config.colors
+  if (isPlainObject(colors)) {
+    const c: Record<string, unknown> = {}
+    for (const k of COLOR_KEYS) if (k in colors) c[k] = colors[k]
+    if (Object.keys(c).length > 0) out.colors = c
+  }
+
+  const vocabulary = config.vocabulary
+  if (isPlainObject(vocabulary)) {
+    const v: Record<string, unknown> = {}
+    for (const k of LABEL_KEYS) if (k in vocabulary) v[k] = vocabulary[k]
+    if (Object.keys(v).length > 0) out.vocabulary = v
+  }
+
+  // Sections the P1 editor doesn't manage (P2 assets/typography) pass through
+  // verbatim so a later phase's data survives an earlier-phase edit.
+  for (const section of ['typography', 'assets'] as const) {
+    const value = config[section]
+    if (isPlainObject(value) && Object.keys(value).length > 0) out[section] = { ...value }
+  }
+
+  return out as ThemeTokens
+}
+
+/**
+ * Draft → the exact payload to persist: null leaves/sections omitted, empty
+ * sections dropped, empty draft → null (full reset). Never emits JSON nulls.
+ */
+export function normalizeThemeDraft(draft: ThemeTokens | null): ThemeTokens | null {
+  if (draft === null || !isPlainObject(draft)) return null
+  const out: Record<string, unknown> = {}
+  for (const section of SECTION_KEYS) {
+    const value = draft[section]
+    if (!isPlainObject(value)) continue
+    const clean: Record<string, unknown> = {}
+    for (const [k, v] of Object.entries(value)) if (v !== null) clean[k] = v
+    if (Object.keys(clean).length > 0) out[section] = clean
+  }
+  return Object.keys(out).length > 0 ? (out as ThemeTokens) : null
+}
+
+/** Stable, key-order-independent comparison of two drafts (normalized). */
+export function themeDraftEquals(a: ThemeTokens | null, b: ThemeTokens | null): boolean {
+  return stableStringify(normalizeThemeDraft(a)) === stableStringify(normalizeThemeDraft(b))
+}
+
+function stableStringify(v: unknown): string {
+  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
+  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
+  const obj = v as Record<string, unknown>
+  const keys = Object.keys(obj).sort()
+  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
+}
diff --git a/src/lib/theme/labels.ts b/src/lib/theme/labels.ts
index ca57868..fb52207 100644
--- a/src/lib/theme/labels.ts
+++ b/src/lib/theme/labels.ts
@@ -22,22 +22,23 @@ export const LABEL_KEYS = [
  * (bib_label absent by design) still resolve a full label map. */
 const FALLBACKS: Record<LabelKey, string> = {
   bib_label: 'Bib Number',
   checkpoint_label: 'Checkpoint',
   medal_label: 'Medal',
   run_label: 'Run',
   participant_label: 'Participant',
   certificate_label: 'Certificate',
 }
 
-/** UI cap (Global Constraints) — DB allows 64, the UI shows 40. */
-const LABEL_MAX = 40
+/** UI cap (Global Constraints) — DB allows 64, the UI shows 40. Exported for
+ * the Task 13 editor's live 40-char cap (reviewer-approved carry). */
+export const LABEL_MAX = 40
 
 /**
  * Trim, collapse whitespace, strip HTML markup + stray angle brackets +
  * C0 control characters, cap at 40 chars. Never throws; degenerate input
  * sanitizes to '' (caller applies the fallback).
  */
 export function sanitizeLabel(input: string): string {
   return input
     .replace(/<[^>]*>/g, '') // well-formed <…> markup (incl. <b>Scroll</b>)
     .replace(/[<>]/g, '') // stray unclosed brackets
diff --git a/src/lib/theme/resolve.ts b/src/lib/theme/resolve.ts
index ae9ef66..d044bfe 100644
--- a/src/lib/theme/resolve.ts
+++ b/src/lib/theme/resolve.ts
@@ -170,55 +170,41 @@ export async function getResolvedTheme(
   supabase: SupabaseClient,
   eventRow: EventThemeInput,
 ): Promise<ResolvedTheme> {
   try {
     return await resolveTheme(supabase, eventRow)
   } catch (err) {
     return platformTheme([`theme resolution failed unexpectedly: ${String(err)}`])
   }
 }
 
-async function resolveTheme(supabase: SupabaseClient, eventRow: EventThemeInput): Promise<ResolvedTheme> {
+/**
+ * Pure derivation half of the resolver — preset tokens ⊕ override config →
+ * ResolvedTheme, NO database access. Isomorphic: getResolvedTheme wraps it
+ * with the preset load (below); the editor's live preview (Task 13) calls it
+ * directly with client-side draft state. Never throws on malformed input —
+ * garbage degrades to platform defaults with warnings (spec §5.5).
+ */
+export function deriveTheme(
+  presetTokens: ThemeTokens,
+  rawConfig: ThemeTokens | null,
+  presetId: string | null,
+): ResolvedTheme {
   const warnings: string[] = []
   const overridden: string[] = []
 
   // theme_config is hand-craftable JSONB — never trust its shape (Review
   // Focus #3). Merge runs on allowlisted projections only.
-  if (eventRow.theme_config != null && !isPlainObject(eventRow.theme_config)) {
+  let config: ThemeTokens | null = rawConfig
+  if (rawConfig !== null && !isPlainObject(rawConfig)) {
     warnings.push('theme_config: not an object — ignored')
-  }
-  const config = isPlainObject(eventRow.theme_config) ? (eventRow.theme_config as ThemeTokens) : null
-
-  const presetId =
-    typeof eventRow.theme_preset_id === 'string' && eventRow.theme_preset_id.length > 0
-      ? eventRow.theme_preset_id
-      : null
-  let presetTokens: ThemeTokens = {}
-  let loadedId: string | null = null
-  if (presetId !== null) {
-    try {
-      const { data, error } = await supabase
-        .from('theme_presets')
-        .select('id, tokens')
-        .eq('id', presetId)
-        .maybeSingle()
-      if (error || !isPlainObject(data)) {
-        warnings.push(`theme preset ${presetId} not found — using platform theme`)
-      } else {
-        loadedId = typeof data.id === 'string' ? data.id : null
-        // data is the DB row { id, tokens } — project the tokens blob through
-        // the same known-keys guard (malformed preset tokens degrade, never throw).
-        presetTokens = mergeThemeConfig(data.tokens as ThemeTokens, null)
-      }
-    } catch (err) {
-      warnings.push(`theme preset ${presetId} lookup failed (${String(err)}) — using platform theme`)
-    }
+    config = null
   }
 
   const merged = mergeThemeConfig(presetTokens, config)
   const colors = merged.colors ?? {}
 
   // Surviving override leaves — source.overriddenKeys records keys the EVENT
   // set (post-merge, pre-validation); degraded keys still drop out because
   // marking only happens when a value actually takes effect below.
   const overrideLeaves = new Set<string>()
   if (config !== null) {
@@ -299,13 +285,48 @@ async function resolveTheme(supabase: SupabaseClient, eventRow: EventThemeInput)
   return {
     primary: themedColor('primary'),
     secondary: themedColor('secondary'),
     accent: themedColor('accent'),
     ring: themedColor('ring'),
     background: tint('background'),
     foreground: tint('foreground'),
     fonts: { heading: font('heading_font_url'), body: font('body_font_url') },
     labels,
     warnings,
-    source: { presetId: loadedId, overriddenKeys: overridden },
+    source: { presetId, overriddenKeys: overridden },
   }
 }
+
+async function resolveTheme(supabase: SupabaseClient, eventRow: EventThemeInput): Promise<ResolvedTheme> {
+  const loadWarnings: string[] = []
+
+  const presetId =
+    typeof eventRow.theme_preset_id === 'string' && eventRow.theme_preset_id.length > 0
+      ? eventRow.theme_preset_id
+      : null
+  let presetTokens: ThemeTokens = {}
+  let loadedId: string | null = null
+  if (presetId !== null) {
+    try {
+      const { data, error } = await supabase
+        .from('theme_presets')
+        .select('id, tokens')
+        .eq('id', presetId)
+        .maybeSingle()
+      if (error || !isPlainObject(data)) {
+        loadWarnings.push(`theme preset ${presetId} not found — using platform theme`)
+      } else {
+        loadedId = typeof data.id === 'string' ? data.id : null
+        // data is the DB row { id, tokens } — project the tokens blob through
+        // the same known-keys guard (malformed preset tokens degrade, never throw).
+        presetTokens = mergeThemeConfig(data.tokens as ThemeTokens, null)
+      }
+    } catch (err) {
+      loadWarnings.push(`theme preset ${presetId} lookup failed (${String(err)}) — using platform theme`)
+    }
+  }
+
+  // config shape-guards + warnings live inside deriveTheme; the theme_config
+  // value is handed over raw (garbage → platform + warning, never a throw).
+  const derived = deriveTheme(presetTokens, (eventRow.theme_config ?? null) as ThemeTokens | null, loadedId)
+  return { ...derived, warnings: [...loadWarnings, ...derived.warnings] }
+}
diff --git a/tests/theme/derive-theme.test.ts b/tests/theme/derive-theme.test.ts
new file mode 100644
index 0000000..228bba5
--- /dev/null
+++ b/tests/theme/derive-theme.test.ts
@@ -0,0 +1,50 @@
+import { describe, it, expect } from 'vitest'
+import { deriveTheme } from '@/lib/theme/resolve'
+import type { ThemeTokens } from '@/lib/theme/types'
+import { oklchToString, hexToOklch, deriveDarkVariant } from '@/lib/theme/color'
+
+/**
+ * deriveTheme — the pure, isomorphic derivation half of the resolver. The
+ * editor's live preview (Task 13) runs it client-side with the selected
+ * preset's tokens ⊕ the override draft; getResolvedTheme wraps it with the
+ * preset DB load. Never throws on malformed input (spec §5.5).
+ */
+const BATIK: ThemeTokens = {
+  colors: { primary: '#9C4A1A', secondary: '#3E2C23', accent: '#D4A017', ring: '#C68B2E' },
+  vocabulary: { medal_label: 'Pingat' },
+  meta: { version: 1 },
+}
+
+const PRESET_ID = '11111111-1111-1111-1111-111111111111'
+
+describe('deriveTheme', () => {
+  it('preset only → themed slots, labels filled, source tracked', () => {
+    const resolved = deriveTheme(BATIK, null, PRESET_ID)
+    expect(resolved.primary.light).toBe(oklchToString(hexToOklch('#9C4A1A')))
+    expect(resolved.primary.dark).toBe(deriveDarkVariant('#9C4A1A'))
+    expect(resolved.labels.medal_label).toBe('Pingat')
+    expect(resolved.labels.bib_label).toBe('Bib Number')
+    expect(resolved.source).toEqual({ presetId: PRESET_ID, overriddenKeys: [] })
+  })
+
+  it('override draft wins over the preset (live preview reflects edits)', () => {
+    const resolved = deriveTheme(BATIK, { colors: { primary: '#00807A' } }, PRESET_ID)
+    expect(resolved.primary.light).toBe(oklchToString(hexToOklch('#00807A')))
+    expect(resolved.secondary.light).toBe(oklchToString(hexToOklch('#3E2C23')))
+    expect(resolved.source.overriddenKeys).toEqual(['colors.primary'])
+  })
+
+  it('custom (no preset) + malformed HEX degrades to platform + warning, never throws', () => {
+    const resolved = deriveTheme({}, { colors: { primary: 'nope' } }, null)
+    expect(resolved.source.presetId).toBeNull()
+    expect(resolved.warnings.some((w) => w.includes('colors.primary'))).toBe(true)
+  })
+
+  it('fuzz: garbage draft shapes never throw', () => {
+    for (const cfg of [42, 'x', [], { colors: 5 }, { vocabulary: { bib_label: 42 } }]) {
+      const resolved = deriveTheme(BATIK, cfg as unknown as ThemeTokens, PRESET_ID)
+      expect(resolved.primary).toBeTruthy()
+      expect(resolved.labels.bib_label).toBeTruthy()
+    }
+  })
+})
diff --git a/tests/theme/draft.test.ts b/tests/theme/draft.test.ts
new file mode 100644
index 0000000..1e52e31
--- /dev/null
+++ b/tests/theme/draft.test.ts
@@ -0,0 +1,63 @@
+import { describe, it, expect } from 'vitest'
+import { seedThemeDraft, normalizeThemeDraft, themeDraftEquals } from '@/lib/theme/draft'
+
+/**
+ * Editor draft-state semantics (Task 13, carried requirements from Tasks 3/9):
+ *  - per-key reset = OMIT the key; the editor must never produce nested JSON
+ *    nulls (validate.ts + 076 reject explicit nulls at every level)
+ *  - an empty draft normalizes to null = full reset (theme_config SQL NULL)
+ *  - drafts are compared order-independently (jsonb row order is not stable)
+ */
+describe('seedThemeDraft', () => {
+  it('copies plain-object sections; nulls/garbage sections are omitted (never carried as JSON nulls)', () => {
+    const seeded = seedThemeDraft({
+      colors: { primary: '#123456' },
+      vocabulary: null,
+      typography: 'garbage',
+      meta: { version: 1 },
+      evil: { x: 1 },
+    })
+    expect(seeded).toEqual({ colors: { primary: '#123456' } })
+  })
+
+  it('canonicalizes edited-section key order (jsonb row order is not stable)', () => {
+    const seeded = seedThemeDraft({ colors: { ring: '#000000', primary: '#123456' } })
+    expect(Object.keys(seeded.colors ?? {})).toEqual(['primary', 'ring'])
+  })
+})
+
+describe('normalizeThemeDraft', () => {
+  it('drops empty sections; an empty draft → null (full reset = SQL NULL)', () => {
+    expect(normalizeThemeDraft({ colors: {}, vocabulary: {} })).toBeNull()
+    expect(normalizeThemeDraft({ colors: { primary: '#123456' }, vocabulary: {} })).toEqual({
+      colors: { primary: '#123456' },
+    })
+  })
+
+  it('never emits nested nulls — null leaves are omitted', () => {
+    const payload = normalizeThemeDraft({ colors: { primary: null } } as never)
+    expect(payload).toBeNull()
+  })
+
+  it('null/non-object drafts normalize to null', () => {
+    expect(normalizeThemeDraft(null)).toBeNull()
+    expect(normalizeThemeDraft(42 as never)).toBeNull()
+  })
+})
+
+describe('themeDraftEquals', () => {
+  it('key-order independent', () => {
+    expect(
+      themeDraftEquals(
+        { colors: { primary: '#123456', ring: '#000000' } },
+        { colors: { ring: '#000000', primary: '#123456' } },
+      ),
+    ).toBe(true)
+  })
+
+  it('distinguishes content and null', () => {
+    expect(themeDraftEquals({ colors: { primary: '#123456' } }, { colors: { primary: '#654321' } })).toBe(false)
+    expect(themeDraftEquals(null, { colors: { primary: '#123456' } })).toBe(false)
+    expect(themeDraftEquals(null, null)).toBe(true)
+  })
+})
diff --git a/tests/theme/save-event-theme.test.ts b/tests/theme/save-event-theme.test.ts
new file mode 100644
index 0000000..694f03c
--- /dev/null
+++ b/tests/theme/save-event-theme.test.ts
@@ -0,0 +1,180 @@
+import { describe, it, expect, vi, beforeEach } from 'vitest'
+
+/**
+ * saveEventTheme action pins — plan Task 13 Step 1 + carried requirements:
+ *  - unauthenticated → error (never a write)
+ *  - non-owner → error (Task 2 anti-IDOR carry: the BFF path owns the
+ *    ownership check — the 077 trigger bypasses postgres/service_role)
+ *  - preset reference must be system OR owned by the caller's organizer
+ *  - primary <3:1 vs platform background → blocked w/ structured errors
+ *    (client-side validation is UX only — server re-validates, Task 9 carry)
+ *  - happy path → BOTH columns written + revalidate of organizer, runner
+ *    event, and leaderboard paths (Task 12 carry)
+ */
+
+const { requireAuth, revalidatePath, updatePayload, updateError } = vi.hoisted(() => ({
+  requireAuth: vi.fn(),
+  revalidatePath: vi.fn(),
+  updatePayload: vi.fn(),
+  updateError: vi.fn(),
+}))
+
+vi.mock('@/lib/auth/requireUser', () => ({ requireAuth }))
+vi.mock('next/cache', () => ({ revalidatePath }))
+// actions.ts's module graph pulls server-only modules (supabase/server via
+// createClient, subscription) — never exercised here, stubbed out.
+vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
+vi.mock('@/lib/subscription', () => ({ getOrganizerSubscriptionPrice: vi.fn() }))
+
+type Row = unknown
+
+function makeSupabase(opts: { event?: Row; preset?: Row } = {}) {
+  return {
+    from: (table: string) => ({
+      select: () => ({
+        eq: () => ({
+          single: async () => ({ data: table === 'events' ? (opts.event ?? null) : null, error: null }),
+          maybeSingle: async () => ({
+            data: table === 'theme_presets' ? (opts.preset ?? null) : null,
+            error: null,
+          }),
+        }),
+      }),
+      update: (payload: Record<string, unknown>) => {
+        updatePayload(payload)
+        return { eq: async () => ({ error: updateError() }) }
+      },
+    }),
+  }
+}
+
+const OWNER = { id: 'user-1', app_metadata: { organizer_id: 'org-1' } }
+const OWNED_EVENT = { id: 'event-1', organizer_id: 'org-1' }
+const SYSTEM_PRESET = { id: 'preset-1', kind: 'system', organizer_id: null }
+
+const { saveEventTheme } = await import('@/components/events/actions')
+
+beforeEach(() => {
+  requireAuth.mockReset()
+  revalidatePath.mockReset()
+  updatePayload.mockReset()
+  updateError.mockReset()
+  updateError.mockReturnValue(null)
+})
+
+describe('saveEventTheme', () => {
+  it('unauthenticated → error (requireAuth redirect propagates), never writes', async () => {
+    requireAuth.mockRejectedValue(new Error('NEXT_REDIRECT'))
+    await expect(
+      saveEventTheme('event-1', { theme_preset_id: null, theme_config: null }),
+    ).rejects.toThrow()
+    expect(updatePayload).not.toHaveBeenCalled()
+  })
+
+  it('non-owner → error, never writes (anti-IDOR carry)', async () => {
+    requireAuth.mockResolvedValue({
+      supabase: makeSupabase({ event: { id: 'event-1', organizer_id: 'org-OTHER' } }),
+      user: OWNER,
+    })
+    const result = await saveEventTheme('event-1', { theme_preset_id: null, theme_config: null })
+    expect(result.ok).toBe(false)
+    expect((result as { error: string }).error).toMatch(/organize/i)
+    expect(updatePayload).not.toHaveBeenCalled()
+  })
+
+  it('caller without an organizer profile → error, never writes', async () => {
+    requireAuth.mockResolvedValue({
+      supabase: makeSupabase({ event: OWNED_EVENT }),
+      user: { id: 'user-1', app_metadata: {} },
+    })
+    const result = await saveEventTheme('event-1', { theme_preset_id: null, theme_config: null })
+    expect(result.ok).toBe(false)
+    expect(updatePayload).not.toHaveBeenCalled()
+  })
+
+  it('preset reference that is not system and not owned → error, never writes', async () => {
+    requireAuth.mockResolvedValue({
+      supabase: makeSupabase({
+        event: OWNED_EVENT,
+        preset: { id: 'preset-x', kind: 'organizer', organizer_id: 'org-OTHER' },
+      }),
+      user: OWNER,
+    })
+    const result = await saveEventTheme('event-1', {
+      theme_preset_id: 'preset-x',
+      theme_config: null,
+    })
+    expect(result.ok).toBe(false)
+    expect((result as { error: string }).error).toMatch(/preset/i)
+    expect(updatePayload).not.toHaveBeenCalled()
+  })
+
+  it('primary <3:1 vs platform background → blocked with structured error, never writes', async () => {
+    requireAuth.mockResolvedValue({
+      supabase: makeSupabase({ event: OWNED_EVENT, preset: SYSTEM_PRESET }),
+      user: OWNER,
+    })
+    const result = await saveEventTheme('event-1', {
+      theme_preset_id: 'preset-1',
+      theme_config: { colors: { primary: '#FFD700' } },
+    })
+    expect(result.ok).toBe(false)
+    expect((result as { error: string }).error).toMatch(/colors\.primary.*contrast/i)
+    expect(updatePayload).not.toHaveBeenCalled()
+  })
+
+  it('happy path → both columns written + revalidates organizer, runner event, leaderboard', async () => {
+    requireAuth.mockResolvedValue({
+      supabase: makeSupabase({ event: OWNED_EVENT, preset: SYSTEM_PRESET }),
+      user: OWNER,
+    })
+    const config = { colors: { primary: '#00807A' }, vocabulary: { medal_label: 'Pingat' } }
+    const result = await saveEventTheme('event-1', { theme_preset_id: 'preset-1', theme_config: config })
+    expect(result.ok).toBe(true)
+    expect(updatePayload).toHaveBeenCalledWith({
+      theme_preset_id: 'preset-1',
+      theme_config: config,
+    })
+    expect(revalidatePath).toHaveBeenCalledWith('/organizer/events/event-1')
+    expect(revalidatePath).toHaveBeenCalledWith('/runner/events/event-1')
+    expect(revalidatePath).toHaveBeenCalledWith('/runner/leaderboard')
+  })
+
+  it('happy path with a low-contrast secondary → ok:true with structured warnings', async () => {
+    requireAuth.mockResolvedValue({
+      supabase: makeSupabase({ event: OWNED_EVENT, preset: SYSTEM_PRESET }),
+      user: OWNER,
+    })
+    const result = await saveEventTheme('event-1', {
+      theme_preset_id: null,
+      theme_config: { colors: { primary: '#00807A', secondary: '#FFD700' } },
+    })
+    expect(result.ok).toBe(true)
+    expect((result as { warnings: string[] }).warnings.some((w) => w.includes('colors.secondary'))).toBe(true)
+    expect(updatePayload).toHaveBeenCalled()
+  })
+
+  it('full reset (null/null) is a valid write', async () => {
+    requireAuth.mockResolvedValue({
+      supabase: makeSupabase({ event: OWNED_EVENT }),
+      user: OWNER,
+    })
+    const result = await saveEventTheme('event-1', { theme_preset_id: null, theme_config: null })
+    expect(result.ok).toBe(true)
+    expect(updatePayload).toHaveBeenCalledWith({ theme_preset_id: null, theme_config: null })
+  })
+
+  it('DB write error → structured error', async () => {
+    requireAuth.mockResolvedValue({
+      supabase: makeSupabase({ event: OWNED_EVENT }),
+      user: OWNER,
+    })
+    updateError.mockReturnValue({ message: 'check constraint violated' })
+    const result = await saveEventTheme('event-1', {
+      theme_preset_id: null,
+      theme_config: { colors: { primary: '#00807A' } },
+    })
+    expect(result.ok).toBe(false)
+    expect((result as { error: string }).error).toMatch(/check constraint/i)
+  })
+})
diff --git a/tests/theme/theme-editor.test.tsx b/tests/theme/theme-editor.test.tsx
new file mode 100644
index 0000000..5b556f2
--- /dev/null
+++ b/tests/theme/theme-editor.test.tsx
@@ -0,0 +1,98 @@
+import { describe, it, expect, vi } from 'vitest'
+import { prerender } from 'react-dom/static'
+import { MiniThemePreview } from '@/components/theme/mini-theme-preview'
+import { ThemeEditor } from '@/components/theme/theme-editor'
+import { deriveTheme } from '@/lib/theme/resolve'
+import type { ThemeTokens } from '@/lib/theme/types'
+
+/**
+ * Task 13 render smoke (prerender convention from event-theme-scope.test.tsx):
+ * the gallery cards + live preview render through the SAME `.event-theme`
+ * engine, and the editor mounts read-only vs editable without crashing.
+ * The interactive click-through (save → runner page themed) stays a manual
+ * smoke — see task-13 report.
+ */
+
+const EVENT_ID = '9b2f4c1e-abcd-4321-9876-abcdef012345'
+const PRESET_ID = '11111111-1111-1111-1111-111111111111'
+
+const BATIK: ThemeTokens = {
+  colors: { primary: '#9C4A1A', secondary: '#3E2C23', accent: '#D4A017', ring: '#C68B2E' },
+  vocabulary: { medal_label: 'Pingat', checkpoint_label: 'Kampung' },
+  meta: { version: 1 },
+}
+
+const PRESETS = [{ id: PRESET_ID, name: 'Batik Heritage', tokens: BATIK }]
+
+async function toHtml(node: React.ReactElement): Promise<string> {
+  const { prelude } = await prerender(node)
+  let html = ''
+  const reader = prelude.getReader()
+  const decoder = new TextDecoder()
+  for (;;) {
+    const { done, value } = await reader.read()
+    if (done) break
+    html += decoder.decode(value, { stream: true })
+  }
+  return html + decoder.decode()
+}
+
+// saveEventTheme is a 'use server' action whose module graph pulls
+// server-only modules — never executed in these render smokes.
+vi.mock('@/components/events/actions', () => ({ saveEventTheme: vi.fn() }))
+vi.mock('@/components/events/event-tabs', () => ({ useThemeDirtyReporter: () => null }))
+
+describe('MiniThemePreview (SSR through the .event-theme engine)', () => {
+  it('renders the themed scope with inline --et-* vars (two-arg buildStyleVars)', async () => {
+    const resolved = deriveTheme(BATIK, null, PRESET_ID)
+    const html = await toHtml(<MiniThemePreview resolved={resolved} eventId={EVENT_ID} />)
+    expect(html).toContain('event-theme')
+    expect(html).toContain('--et-primary:oklch(')
+    // whitelist consumption via Tailwind classes, not ad-hoc token mapping
+    expect(html).toContain('bg-primary')
+  })
+
+  it('shows resolved vocabulary (fallbacks filled) as text', async () => {
+    const resolved = deriveTheme(BATIK, null, PRESET_ID)
+    const html = await toHtml(<MiniThemePreview resolved={resolved} />)
+    expect(html).toContain('Kampung')
+    expect(html).toContain('Pingat')
+    expect(html).toContain('Bib Number')
+  })
+})
+
+describe('ThemeEditor (SSR mount smoke)', () => {
+  it('editable mode: gallery + color rows + vocab + save bar render', async () => {
+    const html = await toHtml(
+      <ThemeEditor
+        eventId={EVENT_ID}
+        canEdit
+        savedPresetId={PRESET_ID}
+        savedConfig={null}
+        presets={PRESETS}
+      />,
+    )
+    expect(html).toContain('Batik Heritage')
+    for (const role of ['Primary', 'Secondary', 'Accent', 'Ring']) {
+      expect(html).toContain(role)
+    }
+    expect(html).toContain('Save theme')
+    // Batik preset selected → its vocabulary seeds the live label preview
+    expect(html).toContain('Your Kampung #1234')
+    expect(html).toContain('Your Bib Number #1234')
+  })
+
+  it('read-only mode (non-owner): banner shown, no save button', async () => {
+    const html = await toHtml(
+      <ThemeEditor
+        eventId={EVENT_ID}
+        canEdit={false}
+        savedPresetId={null}
+        savedConfig={null}
+        presets={PRESETS}
+      />,
+    )
+    expect(html).toContain('read-only')
+    expect(html).not.toContain('Save theme')
+  })
+})
```


### .superpowers/sdd/2026-10-28-event-themes-p1/task-13-report.md

# Task 13 Report — Theme tab MVP + `saveEventTheme`

**Status:** DONE (no blockers) · **Branch:** `feat/event-themes-p1` · **Commits:** `209bdfe..365e98d` (single commit `365e98d`) · **Date:** 2026-10-29

## Files changed (12 in commit `365e98d`)

**Created:**
- `src/components/theme/theme-editor.tsx` — client Theme tab: preset gallery (6 system presets + Custom tile), per-role color rows (native picker + HEX field with valid-full-HEX-commit typing, live oklch chip, WCAG meter, per-row reset), six vocabulary inputs (live 40-char cap via `LABEL_MAX`, sanitized on input, live `labelPreview`), sticky live preview with light/dark toggle, save bar (dirty badge, structured errors/warnings as text children, Save gated on `validateThemeConfig`). Read-only mode when `canEdit` is false.
- `src/components/theme/mini-theme-preview.tsx` — themed event-card + leaderboard-row + vocabulary mock rendered through the SAME `.event-theme` engine (`buildStyleVars(resolved, eventId)` — two-arg BINDING carry honored). No token mappings outside the whitelist; themed tokens consumed via Tailwind classes (`bg-primary text-primary-foreground`, …).
- `src/components/events/event-tabs.tsx` — controlled-Tabs client shell for the organizer event page (server page passes tab contents as serializable nodes). Provides the dirty-context reporter, the dirty dot badge on the Theme trigger, `beforeunload` guard for real navigation, and the AlertDialog leave-confirm for in-app tab switches (plan requirement).
- `src/lib/theme/draft.ts` — isomorphic draft semantics: `seedThemeDraft` (untrusted JSONB → safe editable draft, canonical key order, null/garbage sections omitted), `normalizeThemeDraft` (null leaves/sections dropped, empty sections dropped, empty → `null` = full reset SQL NULL), `themeDraftEquals` (order-independent). Encodes the Task 3/9 carried reset semantics — the editor structurally cannot emit nested JSON nulls.
- `tests/theme/save-event-theme.test.ts`, `tests/theme/draft.test.ts`, `tests/theme/derive-theme.test.ts`, `tests/theme/theme-editor.test.tsx`

**Modified:**
- `src/components/events/actions.ts` — `saveEventTheme(eventId, { theme_preset_id, theme_config }): Promise<SaveEventThemeResult>` (`{ok:true, warnings} | {ok:false, error}`): `requireAuth()` → organizer-claim check → **event ownership verification server-side** (Task 2 anti-IDOR carry) → **preset-reference check** (system OR own organizer — same trigger-bypass rationale) → **`validateThemeConfig` re-run server-side** (Task 9 carry; client validation is UX only) → writes BOTH columns → `revalidatePath` organizer + runner event + **`/runner/leaderboard`** (Task 12 carry). Auth redirect propagates (never caught).
- `src/lib/theme/resolve.ts` — refactor: extracted the pure derivation half of `resolveTheme` into **exported `deriveTheme(presetTokens, config, presetId)`** (no DB, isomorphic, never throws) so the editor's live preview can resolve client-side. `getResolvedTheme` behavior preserved (preset-load warnings concatenated before derivation warnings; `source.presetId` still the loaded id). All 13 existing resolve tests pass unchanged.
- `src/lib/theme/labels.ts` — `LABEL_MAX` exported (reviewer-approved carry; used for the editor's live 40-char cap).
- `src/app/organizer/events/[id]/page.tsx` — Theme tab added to the existing Tabs (via `EventPageTabs`); system-preset gallery query (076 RLS: system presets publicly readable); `canEdit = user.app_metadata.organizer_id === event.organizer_id`; `EventDetail` type extended with `organizer_id/theme_preset_id/theme_config`.

## Patterns reused

- Server-action result-object + `requireAuth` style from `actions.ts`; test mocking style from `tests/reliability/payments-action-ownership.test.ts` (hoisted mocks, table-row fixtures, `next/cache` mock).
- Prerender convention from `tests/theme/event-theme-scope.test.tsx` (`react-dom/static`).
- Radix UI shell components (`tabs`, `alert-dialog`) already in `components/ui`.
- Color math exclusively from `src/lib/theme/color.ts` (no new deps; zero npm additions).

## Verification (all green)

| Gate | Result |
|---|---|
| `pnpm exec vitest run` | **401/401 across 38 files** (baseline 377/34 → +24 tests, 4 new files) |
| `pnpm exec tsc --noEmit` | clean |
| `pnpm run lint` | 0 errors / 20 warnings — all pre-existing (was 20 pre-existing + 1 introduced → fixed in-review by switching ColorRow sync to the React adjust-on-prop-change render pattern; final count 20) |
| New action tests | unauth → rejects w/o write; non-owner → `{ok:false}` w/o write; no organizer claim → error; preset not permitted → error; primary <3:1 (`#FFD700`) → blocked w/ structured `colors.primary` error; happy path → BOTH columns written + all 3 revalidate paths; low-contrast secondary → `ok:true` + warning; full reset null/null → valid write; DB error → structured error |
| Docker smoke | `pelikat-web-web-1` hot-reloads this checkout; `/organizer/events/<uuid>` + `/runner/leaderboard` compile and serve (307 → `/login` unauth, no compile errors in container logs). Interactive authed click-through (select Batik → save → runner page visually themed) is NOT safely doable headless against the shared cloud DB — deferred to Task 14 phase-gate smoke along with the Task 11 visual FOUC check. Compensating render smokes: gallery + editor SSR via prerender (`.event-theme` scope, inline `--et-primary:oklch(`, vocab preview "Your Kampung #1234", read-only mode hides Save). |

## Carried requirements honored (checklist)

1. **Task 2 anti-IDOR** — `saveEventTheme` verifies event ownership server-side before writing ✔ (plus preset-reference check for the same trigger-bypass).
2. **Task 3/9 JSON nulls** — per-key reset = key omitted; empty draft → `theme_config: null`; editor structurally cannot emit nested nulls (`normalizeThemeDraft` strips) ✔.
3. **Task 9 structured strings** — errors/warnings rendered as text children only (no `dangerouslySetInnerHTML` anywhere in the editor/preview) ✔.
4. **Task 12** — `revalidatePath('/runner/leaderboard')` included ✔.
5. **Task 10 two-arg forms** — all `buildStyleVars` call sites pass `eventId` (2nd arg) ✔; `buildFontFace` not called by Task 13 code (P1 fonts unset; EventThemeScope remains its only caller).
6. **`LABEL_MAX` export** — used for the editor's live cap ✔.
7. Test-path convention `tests/` ✔; component tests via `prerender` ✔.

## ⚠ Spec/carry conflict found (report, not improvised)

The Task 3/9 ledger line and my brief claim whole-section nulls (`{"colors": null}`) are **storable** in `events.theme_config`. Reading migration 076: `v_section := tokens -> 'colors'` returns a scalar jsonb `'null'` (not SQL NULL) for an explicit JSON null, so `v_section is not null` is true and `jsonb_typeof(v_section) <> 'object'` → the validator **rejects** section nulls; the 077 CHECK (`validate_theme_tokens(theme_config, false)`) therefore rejects them too. `validateThemeConfig` (the TS mirror) likewise errors (`colors: must be an object of HEX strings`).

**Impact on Task 13: none** — the editor uses omit-only resets (omission is semantically identical to a section null under the merge's `jsonb_strip_nulls` read semantics, and is accepted by both validators). Recommend @manager confirm which reading is intended before P2 touches reset semantics; the merge-side null tolerance (read-side leniency for hand-crafted rows) remains unaffected.

## Deferred minors (for the ledger)

1. `theme-editor.tsx`: gallery card previews recompute `deriveTheme` per render (6 × pure math — sub-ms; memo only if a profile shows it).
2. `event-tabs.tsx`: `beforeunload` uses `e.preventDefault()` only (Chromium requires no `returnValue` since v119+; older browsers may not prompt).
3. Editor draft preserves P2 passthrough sections (`typography`/`assets`) verbatim so future data survives a P1 edit; `meta` is dropped on edit (system-managed, optional in the non-strict CHECK, always version 1 today).
4. If a saved event references a preset missing from the gallery (deactivated), the preview degrades to platform colors for the missing preset silently — acceptable until P2 defines deactivation semantics (same ledger carry as Task 3).

## Commit

```
365e98d feat(theme): organizer Theme tab MVP + saveEventTheme
```
Not pushed; `main`/`master` untouched. Left untracked: `supabase/.branches/` (pre-existing Task 1 artifact, already on the ledger).


### .superpowers/sdd/2026-10-28-event-themes-p1/task-14-report.md

# Task 14 Report — Event Themes P1 Phase Gate

**Branch:** `feat/event-themes-p1` · **Commits:** `365e98d..becd500` (one commit: `feat(theme): P1 phase gate hardening + verification`)
**Date:** 2026-10-28 · **DB:** local `supabase db reset` only — **cloud `ugexrrslijmwtieevjbs` untouched.**

---

## (a) Hardening sweep (single commit, all carried findings)

| # | Item | File | Change | Verification |
|---|------|------|--------|--------------|
| 1a | NULL-unsafe status gate | `supabase/migrations/078_theme_rpc.sql` (up block) | `v_status <> 'published' and v_status <> 'closed'` → `v_status is distinct from 'published' and v_status is distinct from 'closed'`. A NULL-status event was **storable** (column nullable, CHECK passes on NULL) and skipped the gate entirely (`NULL <> 'published'` → NULL → gate skipped → theme resolved for **anon**). | Before/after proof below. |
| 1b/2 | NULL-unsafe organizer compare | same file | Deny arm extended to `(v_organizer_id is null or v_caller_org is null or v_caller_org <> v_organizer_id)` — a NULL-organizer event made `v_caller_org <> v_organizer_id` evaluate NULL → fall-through → theme resolved for any organizer-id'd caller. | Before/after proof below. |
| 3 | setup-storage.sql replay abort | `supabase/setup-storage.sql` | Added `drop policy if exists `"X"` on storage.objects;` before each of the three ic-documents policies (069 precedent) — migration **041** creates identically-named policies first, so whole-file replay aborted at line ~63. **`event-themes` addendum section untouched** (semantics unchanged). | Full clean `supabase db reset` (001→079 + seed) then `psql -v ON_ERROR_STOP=1 -f supabase/setup-storage.sql` → **exit 0** (3× DROP POLICY + 3× CREATE POLICY + 4× CREATE POLICY for event-themes). |
| 4 | `%2e%2e%2f` traversal | `src/lib/theme/css.ts:85` | Traversal guard extended to reject `%2f` on **both sides** of the dot-dot run: leader `(?:^|\/|%2f|\?)`, follower `(?:\/|%2f|\?|#|$)`. The follower alone was not enough — my own expanded vector `…/storage/v1%2f..%2fevil.woff2` exposed the leader gap (encoded-slash-preceded dot-dot), caught by vitest and fixed before commit. | Test vectors: `https://fonts.gstatic.com/%2e%2e%2fx.woff2` and `${SUPABASE_URL}/storage/v1%2f..%2fevil.woff2` → `buildFontFace` returns `''`. |
| 5 | belt-check symmetry | `tests/theme/css.test.ts` | `--foreground` added to the raw-substring belt list (line 224). Verified safe: `--primary-foreground` LHS does not contain the `--foreground` substring (single dash). | vitest suite still 20/20 in css.test.ts. |
| 6 | Safari beforeunload | `src/components/events/event-tabs.tsx:51` | `e.returnValue = ''` added alongside `preventDefault()` (some Safari versions ignore preventDefault alone). | tsc green; header comment updated. |
| 7a | Silent error swallow | `src/app/runner/leaderboard/page.tsx` | `console.warn('[leaderboard] themed event fetch failed for ${scopedId}')` when a scoped fetch yields no row (degrades to neutral scope as before, now observable). | lint 0 errors. |
| 7b | Publication-check duplication | `src/app/runner/leaderboard/scope.ts` | Header comment cross-references the page's `resultsLocked` derivation (same events rows, two consumers — keep in sync). | — |
| 8 | `.gitignore` | `.gitignore` | `supabase/.branches/` added (CLI artifact churn since Task 1). | `git status` clean after commit. |

**078 applied to local DB via edit-then-reset** (migration file edited first, `supabase db reset` replays the edited file) — the clean path requested; also replayed the file once more via psql for the after-proof restore.

### 078 before/after probe evidence (raw DB, local)

Seeded probe rows: `probe-preset` (system, `colors.primary #111111`), events published/closed/draft (org A), **status-NULL event**, **organizer-NULL draft event**, organizers A + B. Scripts: `/tmp/opencode/task14-probes.sql`, `/tmp/opencode/task14-old-body.sql`, `/tmp/opencode/task14-seed.sql`.

**BEFORE (old vulnerable body, kept verbatim in `/tmp/opencode/task14-old-body.sql` and applied via psql):**

```
anon × NULL-status event          → anon_null_status_resolved_bug   = t   (THEME LEAKED)
org-B × NULL-organizer draft      → otherorg_null_org_resolved_bug  = t   (THEME LEAKED)
```

**AFTER (hardened body restored from the edited 078):**

```
── sanity matrix (no §12.3 regressions) ──
anon: published ok / closed ok / draft hidden            = t / t / t
owner (org A claims): draft resolves                      = t
other organizer (org B claims): draft hidden              = t

── hardening probes ──
PROBE 1  anon × NULL-status event        anon_null_status_denied          = t
         org-B × NULL-status event       otherorg_null_status_denied      = t
PROBE 2  org-B × NULL-organizer draft    otherorg_null_organizer_denied   = t
         anon × NULL-organizer draft     anon_null_organizer_denied       = t
         service_role claim × NULL-org draft resolves                     = t
machine verdict: NOTICE PASS: hardening probes verified
```

Cleanup verified: 0 probe rows remain.

### Mixed-view payload guarantee (Task 12 review carry)

Code inspection (`src/app/runner/leaderboard/page.tsx`): `scopedEvent = scopedId ? (await supabase .from('events').select('id, theme_preset_id, theme_config')…) : null` — when `scopedLeaderboardEventId` returns null (**no event_id / 'all' / stale / unpublished**), the ternary short-circuits and **no query at all** is issued; the themed fetch is the ONLY query carrying `theme_config`, and the leaderboard rows come from `leaderboard_virtual` (`select '*'`). The existing 6 predicate tests (`tests/theme/leaderboard-scope.test.ts`: single-published → scoped; missing/'all'/stale/unpublished/failed-events → null) pin every shape that reaches this ternary. A query-count assertion was judged **not cheap** (would require mocking the server client module end-to-end; low marginal value over the 6 predicates + ternary inspection) — recorded as inspection evidence here.

---

## (b) §12 verification matrix — results

**§12.1 — clean reset:** `supabase db reset` ✔ 001→079 all applied (incl. edited 078) + `supabase/seed.sql`; "Finished supabase db reset on branch feat/event-themes-p1." Full log cited in session; then SETUP.md flow replay of `setup-storage.sql` exit 0 (§a-3).

**§12.2 — validator matrix (re-ran live on the reset DB, `/tmp/opencode/task14-verify-124.sql`):**

| Case | Result |
|---|---|
| accept full tokens | t ✔ |
| accept minimal (3 required colors + meta, strict) | t ✔ |
| accept partial + vocabulary label | t ✔ |
| reject bad hex (`00807A` no `#`) | t ✔ |
| reject `javascript:` URL | t ✔ |
| reject `..` path | t ✔ |
| reject unknown key | t ✔ |
| reject wrong `meta.version` (2) | t ✔ |
| reject 65-char label | t ✔ |

Note encountered: strict mode requires **all three** colors + meta (Task 1 A3); vocabulary section key is **`vocabulary`** (my first draft used `labels` → unknown-key reject for the wrong reason); table CHECK on `theme_presets.tokens` re-confirmed strict.

**§12.3 — get_event_theme visibility:** re-ran live (see 078 before/after above): anon × published/closed ✔ visible, anon/other-organizer × draft ✔ hidden, owner × draft ✔ visible, service_role (claim-driven) × draft ✔ visible — including for the degenerate NULL-organizer row. Matches Task 3 report evidence (`task3-verify.out` role probes), unaffected by the hardening.

**§12.4 — RLS (re-ran live):** org-A reads own custom preset ✔; org-B cannot **read** org-A's custom preset ✔ (`theme_presets` RLS); org-B cannot **attach** org-A's custom preset ✔ — `events_validate_theme_refs: theme_preset_id … not found or not permitted` (anti-IDOR, invoker-rights lookup + RLS); organizer forging `kind='system'` insert denied ✔ (`PASS: insert denied by RLS`); published event without slug auto-slugs ✔ (`slug like 'rls-probe-event-%'`).

**§12.5 — storage paths (re-ran live, `/tmp/opencode/task14-verify-125.sql`):** own event path ✔ accepted; forged event uuid ✔ denied (`is not true`); wrong-shape path ✔ denied; other organizer's event path ✔ denied. Probing note (pre-existing 017 quirk, **no change made**): `is_admin()` returns NULL (not false) for non-admin authenticated callers — RLS policy checks treat NULL as fail so policy behavior is safe, and 078 already `coalesce`s; probes normalize with `is not true`. Task 5 report evidence (upload API probes) re-cited unchanged.

**§12.6 — frontend:** re-verified via the committed test suite (vitest 401/401): contrast meters + WCAG gate (`tests/theme/*`, `theme-editor.test.tsx`), SSR inline both-mode vars pre-hydration (zero FOUC by construction — `event-theme-scope.test.tsx` prerender asserts light+dark pairs inline), whitelist hard boundary (css.test reads `event-theme.css` source: exactly 7 brand tokens declared + belt substring check), font 404→Geist (resolve degrade tests). **FOUC/dark-toggle *visual* check + authed click-through smoke remain carried for the controller** (documented in §c below).

---

## (c) Local seeded smoke (SSR-level, no browser)

**Seed (local psql, `/tmp/opencode/task14-seed-smoke.sql`):** org `Smoke Org`; event `f1a5e1c0-0000-4000-8000-000000000001` "Smoke Batik Event", **published**, virtual, `theme_preset_id` = Batik Heritage (`03c7d417-…`), `theme_config = {"colors":{"primary":"#C1272D","ring":"#0B5EA8"},"vocabulary":{"run_label":"Lari"}}`.

**1. Canonical DB resolution `get_event_theme(id)` — ✔ merged exactly as specified:**

```
colors: primary #C1272D (override WINS) · ring #0B5EA8 (override WINS)
        secondary #3E2C23 · accent #D4A017 · background #FBF6EC · foreground #2B2118 (Batik inherited)
vocab:  run_label "Lari" (override WINS) · Pingat/Kampung/Sijil/Peserta (inherited)
anon also resolves the published event (visibility ✔, returns #C1272D)
```

**2. Runner-page SSR at the resolve/css layer — ✔** (auth-bypassed render): temporary vitest run (kept as `/tmp/opencode/task14-smoke.test.tsx.txt`, **not committed** — requires the local stack). Chain was fully REAL: seeded row fetched via local PostgREST with the anon key (RLS-checked, output: `{"theme_preset_id":"03c7d417-…","theme_config":{…#C1272D…}}`) → `EventThemeScope` → `getResolvedTheme` fetches Batik tokens through the same anon client → app-layer merge → `buildStyleVars` → `react-dom/static` prerender:

```
<div class="event-theme" style="--et-primary:oklch(0.529 0.189 25);  ← override #C1272D wins
 --et-primary-dark:oklch(0.68 0.161 25);… --et-secondary:oklch(0.311 0.031 47.7); ← Batik inherited
 --et-accent:oklch(0.92 0 0);                        ← Batik #D4A017 WARN-AND-DEGRADED (<3:1, §5.5)
 --et-ring:oklch(0.479 0.139 252.2);                 ← override #0B5EA8 wins
 --et-*-fg / -dark / -fg-dark present for all 4 roles (16 vars, pre-hydration)">…</div>
```

Notable live confirmation: Batik's gold `#D4A017` accent **warn-and-degrades to the platform accent** vs `#fafafa` background (<3:1) — spec §5.5 semantics exercised end-to-end, overriding keys win, inherited keys survive. No preset's `#9C4A1A`/`#C68B2E` appear (override really wins).

**What could NOT be verified headless (carried to controller):**
- **Browser-level first-paint / dark-toggle FOUC** and Runner-visible visual theme (needs real session + paint).
- **HTTP-level SSR of `/runner/events/{id}`**: dev server IS live and the route auth-walls (`307 → /login?redirect=%2Frunner%2Fevents%2Ff1a5e1c0-…`) — the inline-var markup above==what the page emits post-login; verifying the full page HTML requires an authed session.
- **Authed click-through**: Batik → Theme tab → save → runner themed + leaderboard revalidate (Task 13 carry; the smoke event is LEFT SEEDED in the local DB for that: task says clean reset wipes it).
- Cloud `update event-themes` bucket state not touched (unchanged).

---

## Gates

| Gate | Result |
|---|---|
| `pnpm exec tsc --noEmit` | ✔ 0 errors |
| `pnpm exec vitest run` | ✔ **401/401 across 38 files** (baseline 401/401 — new vectors folded into existing tests; temporary smoke test removed from the suite) |
| `pnpm run lint` | ✔ 0 errors, 20 warnings (pre-existing) |
| `supabase db reset` | ✔ clean 001→079 + seed, incl. edited 078 |
| `setup-storage.sql` whole-file replay | ✔ exit 0 |
| Branch discipline | ✔ one commit `becd500` on `feat/event-themes-p1`, no push, remote branches untouched |

## Carried / notes for the controller

1. Sandbox smoke fixtures left in LOCAL db only: smoke event + `Smoke Org` (auto-cleaned by next `supabase db reset`); `/tmp/opencode/task14-*.sql/.out` artifacts for re-run.
2. `is_admin()` NULL quirk (017, pre-existing, behavior-safe) — flagged, no change.
3. Cloud-side 076–079 *application* remains @db-specialist/@manager scope (P1 cloud apply was never part of Task 14; Task 1 report's migration-drift note still stands: use MCP `apply_migration`, not `db push`).


### .superpowers/sdd/2026-10-28-event-themes-p1/task-2-report.md

# Task 2 Report — Migration 077 `events theme columns + slug backfill + triggers`

**Implementer:** @db-specialist (subagent) · **Date:** 2026-10-28
**Status:** DONE (all gates green; no conflicts between brief and spec found — two interpretation calls documented below)

## BASE commit
`176392c3ddaad89a1e7ae91c14fbf495edcb00d8` (branch `main`, clean tree apart from the known untracked `supabase/.branches/` CLI artifact left uncommitted per Task 1's deferral)

## HEAD
`6d1ca1021dcc6357311c26ad2eaa073a7d600248` — `feat(theme): 077 events theme columns + slug backfill + triggers`

## Commits (local `main`, NOT pushed — Direct In-Place mandate)
| SHA | Message | Scope |
|---|---|---|
| `6d1ca10` | `feat(theme): 077 events theme columns + slug backfill + triggers` | Task 2 deliverable: `supabase/migrations/077_events_theme_slug.sql` (214 lines, exactly the plan's message) |

## File created
`supabase/migrations/077_events_theme_slug.sql` (only file in the commit)

### up outline (executes in this order)
1. **`public.event_slug_base(p_name text)`** — shared kebab-case helper (immutable, `set search_path = ''`): lowercase → collapse non-`[a-z0-9]` runs to `-` → trim `-` → fallback `'event'` when nothing survives → **capped at 55** so base + `-` + 8-hex suffix is always ≤ 64 chars total (see "Interpretation calls" below). Used by BOTH the backfill and the auto-slug trigger so they can't drift.
2. **Single `ALTER TABLE public.events`** (one lock pass):
   - `theme_preset_id uuid` FK → `theme_presets(id) ON DELETE SET NULL` (auto-named `events_theme_preset_id_fkey`)
   - `theme_config jsonb` + `events_theme_config_valid` CHECK: `theme_config is null or public.validate_theme_tokens(theme_config, false)` — validator called **positionally** (p_strict=false → all-optional partial shape, per 076's interface; SQL NULL legal, JSON `null` rejected as non-object)
   - `slug text` + `events_slug_format` CHECK: null, or (`char_length(slug) <= 64` AND `slug ~ '^[a-z0-9]+(-[a-z0-9]+)*-[0-9a-f]{8}$'`)
3. `create index events_theme_preset_id_idx` (FK support: preset deletes → SET NULL lookups).
4. **Backfill for ALL existing events** (runs BEFORE the triggers exist, so the mass UPDATE can't re-enter them): `event_slug_base(name) || '-' || substr(md5(id::text), 1, 8)`; **dedupe-safe** via a collision-rank window: rows are partitioned by `(base, substr(digest,1,8))` and the 8-hex window slides through the 32-char digest by `1 + ((rn-1) % 25)` (25 valid 8-char windows). The `events_slug_key` UNIQUE constraint is added after the backfill as the loud backstop.
5. **Trigger `events_validate_theme_refs`** on `before insert or update of theme_preset_id, organizer_id` → fn `validate_event_theme_refs()` (`security invoker`, `set search_path = ''`, 070 guard precedent):
   - bypass for `postgres`/`service_role` (Django/BFF trusted writers; ownership verified app-side by `saveEventTheme` per plan Task 13)
   - null preset → pass; preset lookup under caller's RLS; **NOT FOUND raises 23503** — this is what closes the FK-bypass: RLS hides another tenant's preset from the caller, and the plain FK cannot see RLS and would accept any existing id
   - anti-IDOR: preset must be `kind='system'` OR `preset.organizer_id` = `events.organizer_id` (`is distinct from` comparison; raises 23514 otherwise)
6. **Trigger `events_published_needs_slug`** on `before insert or update of slug, status, name` → fn `enforce_published_slug()`: when `slug is null` and status ∈ ('published','closed') → auto-derive kebab + first free 8-hex window of `md5(id)` (25-window loop, existence-checked per candidate; UNIQUE constraint is the concurrency arbiter).

### down block (commented, reverse order — repo convention)
```sql
-- drop trigger events_published_needs_slug; drop function enforce_published_slug();
-- drop trigger events_validate_theme_refs;      drop function validate_event_theme_refs();
-- alter table events drop constraint events_slug_key / events_slug_format / columns slug, theme_config, theme_preset_id;
-- drop function event_slug_base(text);
```

## Validation
### `supabase db reset` (full replay gate)
```
Applying migration 076_theme_presets.sql...
Applying migration 077_events_theme_slug.sql...
Seeding data from supabase/seed.sql...
Restarting containers...
Finished supabase db reset on branch main.
```
One iteration was needed: first reset failed with `function substr(text, bigint, integer) does not exist` (`row_number()` is bigint) — fixed by casting `row_number()` to `int` in the backfill CTE, then the replay above ran clean, 001→077 + seed.

### Matrix (psql, `ON_ERROR_STOP=1`, single txn with rollback; DO-block exception capture; JWT simulation via `set local role authenticated` + `set_config('request.jwt.claims', …, true)` — Task 1 precedent)

**M1 backfill (over 11 seed events):** 10 slugged / 1 draft-null; `unpublished_null_slugs = 0`; `distinct_slugs = 10`; `len_ok = t`; `fmt_ok = t`. **M1b** formula-exact: `slug is distinct from event_slug_base(name)||'-'||substr(md5(id::text),1,8)` mismatches = **0**. **M1c** forced-collision dry run (3 synthetic digests sharing the first 8 hex) → **3 distinct** format-valid slugs (window-slide works).

**Shape:** columns `{slug text, theme_config jsonb, theme_preset_id uuid}` all nullable ✓; constraints `events_slug_format(c)`, `events_slug_key(u)`, `events_theme_config_valid(c)`, `events_theme_preset_id_fkey(f)` ✓; indexes `events_slug_key`, `events_theme_preset_id_idx` ✓; non-internal triggers `audit_events, events_published_needs_slug, events_validate_theme_refs` ✓.

| Case | SQLSTATE / result | Expected |
|---|---|---|
| D1 organizer A attaches B's custom preset **by raw uuid** | 23503 (trigger: not found/permitted) | raise ✓ (§12.4 anti-IDOR; FK-bypass closed) |
| D2 A attaches nonexistent preset uuid | 23503 | raise ✓ |
| D3 A inserts `kind='system'` preset (Task 1 S3 regression) | 42501 (RLS with-check) | raise ✓ |
| D4 `theme_config` unknown top-level key | 23514 (`events_theme_config_valid`) | raise ✓ |
| D5 `theme_config` bad hex `#ZZZZZZ` | 23514 | raise ✓ |
| D6 `theme_config` JSON `null` | 23514 | raise ✓ |
| D7 A hand-forges malformed slug `'Not A Slug!'` | 23514 (`events_slug_format`) | raise ✓ |
| P1 A attaches OWN custom preset | ok=true | ✓ |
| P2 A attaches system preset | ok=true | ✓ |
| P3 A writes valid partial `theme_config` | ok=true | ✓ |
| P3b SQL NULL `theme_config` stays legal | ok=true | ✓ |
| P4 published event w/o slug **auto-slugs** (draft→published) | ok=true, slug = formula-exact | ✓ |
| P5 two same-name events → distinct slugs | ok=true | ✓ |
| P6 forced duplicate slug (as postgres, RLS bypassed) | **23505** `events_slug_key` | raise ✓ |
| T1 postgres attaches B's preset (documented trusted path) | ok=true | ✓ |
| T2 `delete preset` → `theme_preset_id` NULL (FK ON DELETE SET NULL) | ok=true | ✓ |

**MATRIX SUMMARY: 16 passed / 0 failed.**

Test-harness notes (no migration impact): D1 initially returned NO-ERROR because the id-lookup *subquery* was itself RLS-filtered (A couldn't reference B's preset by slug → NULL → trigger passed through) — the test was rewritten to simulate the realistic IDOR (attacker already holds the raw uuid, fixed fixture id literal). P6 initially raised 42501 from events RLS because it ran before `reset role`; moved after it so the unique constraint itself (23505) is what's proven. M1c's first synthetic digests (`repeat('a',32)`) were degenerate (all 25 windows identical) — replaced with realistic shared-prefix digests.

### Per-task gate (Global Constraints)
- `tsc --noEmit` → exit 0
- `vitest run` → **Test Files 27 passed (27), Tests 267 passed (267)**

## Spec-conflict check (brief vs spec §4–§5)
No conflicts found. Interpretation calls (spec §4.1/§13 wording vs brief wording):
1. **Slug length budget:** spec §4.1 says "slug text (kebab-case ≤64, name-derived + 8-hex suffix…)" while the task phrasing says "kebab-case ≤64 + '-' + 8-hex suffix" — the former reads as total ≤64, the latter could mean kebab-part ≤64 (total ≤73). Resolved so BOTH readings hold: kebab base capped at 55 → total ≤ 64 (the DB CHECK enforces total ≤64; base 55 satisfies "≤64" as a subset). A slug of length 65–73 is therefore rejected — flagged here rather than improvised silently.
2. **`events_published_needs_slug` covers 'closed' too:** spec §4.3 names the trigger for "published" events, but §12.3 makes `closed` publicly visible (published/closed → public), so closed events are slug-complete as well. Commented in the migration; no matrix case regresses.
3. **`events_slug_format` CHECK added beyond the brief's "text UNIQUE":** spec §4.1/§13 define the slug format explicitly; the CHECK makes that format a DB invariant (and was itself matrix-tested in D7). Not a conflict — brief is silent on format.

## Concerns (for @manager / @reviewer)
1. **Cloud apply remains out of scope for this task** (per Task 1 ruling): 077 reaches cloud `ugexrrslijmwtieevjbs` via MCP `apply_migration` ONLY, never `db push` — @db-specialist in the phase-gate sitting, after 078/079 exist.
2. **Backfill on cloud:** the single-statement UPDATE rewrites all event rows + a unique-index build under `ACCESS EXCLUSIVE`/`UNIQUE` locks — fine at current event counts; apply during the one-sitting window per plan.
3. **Trusted-writer bypass in `events_validate_theme_refs`** (postgres/service_role): mirrors the 070 precedent; `saveEventTheme` (Task 13) must keep its server-side ownership verification, which is the actual IDOR guard for the BFF path.
4. **Auto-slug TOCTOU under concurrency:** the trigger's existence probe is best-effort; the `events_slug_key` UNIQUE constraint is the arbiter (P6 proves it). A concurrent double-publish race would surface as a 23505 to one caller — acceptable, loud.
5. Untracked `supabase/.branches/` remains uncommitted (Task 1 deferral; `.gitignore` fix still owed).

## Ledger
`- Task 2: implementer DONE (commits 176392c..6d1ca10)` appended to progress.md.


### .superpowers/sdd/2026-10-28-event-themes-p1/task-3-report.md

# Task 3 Report — Migration 078_theme_rpc (get_event_theme + jsonb_deep_merge)

**Status: DONE** · **Branch:** `feat/event-themes-p1` (local only, NOT pushed) · **Commits:** `6d1ca10..91d8d13`

- BASE: `6d1ca1021dcc6357311c26ad2eaa073a7d600248` (077 tip, as expected)
- HEAD: `91d8d13d3f4a11516dd068d5821e26ef24add2b4`
- Commit message: `feat(theme): 078 theme resolution RPC` (per plan Task 3 Step 5)
- File created: `supabase/migrations/078_theme_rpc.sql` (141 lines, up + commented down)

## What was implemented (spec §4.3, §9; plan Task 3 lines 66–77)

1. **`public.jsonb_deep_merge(a jsonb, b jsonb) returns jsonb`** — `IMMUTABLE`, `language plpgsql`, pinned `search_path = ''`, schema-qualified recursion.
   - b (event `theme_config`) wins; two objects merge key-by-key recursively (deep, not shallow); scalar/array overrides replace wholesale.
   - **jsonb_strip_nulls semantics implemented as removal directives:** a JSON null in the override removes that key from the result at any depth (`v_base - v_key`) → the platform default survives at render; a-side nulls are stripped via `jsonb_strip_nulls(a)`. (First implementation stripped nulls from `b` pre-merge — the verification matrix caught that preset values then survived instead of being dropped; fixed and re-verified. See "Bug caught by verification" below.)
   - Edge cases verified: both sides NULL → NULL (→ RPC returns "no theme"); either side NULL → the other; scalar b over object a → b; array b over object a → b.

2. **`public.get_event_theme(event_id uuid) returns jsonb`** — `STABLE`, `SECURITY DEFINER`, pinned `search_path = ''`.
   - Resolution = `preset.tokens ⊕ events.theme_config` via `jsonb_deep_merge` (left join theme_presets; missing preset → config alone; missing both → NULL; unknown event → NULL).
   - **Visibility gate (spec §12.3):** `published`/`closed` → public; anything else (draft) → only owning organizer (`get_my_organizer_id()` = `events.organizer_id`), platform admin (`is_admin()`), or service_role. Deny returns NULL — indistinguishable from "no theme", so draft existence never leaks.
   - **SECURITY DEFINER caller identity:** `current_user` is the function owner inside the call, so service_role is detected via the `request.jwt.claim.role` GUC (PostgREST sets it from the JWT; 077-precedent GUC, but claim-based — 077's `current_user` bypass deliberately NOT transferred; that trigger is security invoker). Helpers `get_my_organizer_id()`/`is_admin()` referenced schema-qualified (valid under pinned empty search_path; their bodies only touch the schema-qualified `auth.jwt()`).
   - NULL-safety: gate uses `coalesce(...)`/`is distinct`-style null discipline so anon (all-NULL JWT reads) is denied, not accidentally allowed.

3. **Grants (spec §9 "RPC escalation" mitigation):** `revoke all on function public.get_event_theme(uuid) from public` → `grant execute ... to anon, authenticated, service_role`. `jsonb_deep_merge` explicitly revoked from `public, anon, authenticated, service_role` (Supabase default privileges grant EXECUTE on new functions to the API roles — observed in verification §4 — so the helper is kept out of the public API surface; the RPC executes it as definer).

4. **Down block (commented, repo convention):** revoke grants + `drop function public.get_event_theme(uuid)` + `drop function public.jsonb_deep_merge(jsonb, jsonb)`.

## How it was verified

### 1. Full local replay — clean
`supabase db reset` → 001→078 applied clean (incl. 0625_/0635_ renumbered migrations and `seed.sql`), no errors, no warnings. Tail: `Applying migration 078_theme_rpc.sql... Finished supabase db reset on branch feat/event-themes-p1.`

### 2. Verification matrix (plan Task 3 Steps 3–4, spec §12.3) — psql, raw output captured
Script: `/tmp/opencode/task3-verify.sql`, raw output: `/tmp/opencode/task3-verify.out` (full dump embedded at the bottom of this report). Simulated callers via the GUCs PostgREST sets in production (`request.jwt.claims` + `request.jwt.claim.role`); machine verdicts via DO blocks with `ON_ERROR_STOP`.

**Visibility matrix — ALL 18 CELLS PASS** (`NOTICE: VISIBILITY MATRIX: ALL 18 CELLS PASS`):

| caller \ status | draft | published | closed |
|---|---|---|---|
| anon | hidden | visible | visible |
| runner (authenticated, no app_metadata) | hidden | visible | visible |
| owner (org A) | **visible** | visible | visible |
| other-organizer (org B) | hidden | visible | visible |
| admin | **visible** | visible | visible |
| service_role | **visible** | visible | visible |

Raw per-persona psql rows (booleans = draft/published/closed theme visible) match the matrix above exactly — see §6 of the raw dump.

**Merge correctness — ALL 24 ASSERTS PASS** (`NOTICE: MERGE + METADATA ASSERTS: ALL 24 PASS`):
- event key wins: `colors.primary` `#AA0000` over preset `#111111`; `vocabulary.bib_label` `EventBib` over `PresetBib`
- deep, not shallow: preset siblings survive inside merged sections (`colors.accent` `#333333`, `colors.ring` `#444444`→ event adds `#445566` alongside, `typography.heading_font_url`, `vocabulary.run_label` `PresetRun`); `meta.version` 1 survives
- null override drops preset value (exercised directly on `jsonb_deep_merge` — see note below): `{"colors":{"secondary":null}}` → `secondary` ABSENT from result; nested `{"vocabulary":{"bib_label":null}}` → key dropped, sibling `run_label` intact
- operand-shape edges: both null → null; either null → other; scalar/array override replaces section wholesale
- config-only event (its preset deleted → `theme_preset_id` NULL via ON DELETE SET NULL): `merge(NULL, config) = config`
- published event with no theme at all → NULL; unknown event id → NULL (no existence leak)
- metadata: `jsonb_deep_merge` provolatile `i`; `get_event_theme` `prosecdef = t`, provolatile `s`, proconfig `{search_path=""}`
- ACL: `get_event_theme` EXECUTE = anon, authenticated, service_role (+ postgres row from Supabase default privileges — superuser, not API-exposable, cosmetic); `jsonb_deep_merge` = postgres only, **no** PUBLIC/anon/authenticated/service_role rows (assert 13)

Raw merged theme (anon, published event) — event wins + preset survivors coexist:
```
{"meta": {"version": 1}, "colors": {"ring": "#445566", "accent": "#333333", "primary": "#AA0000", "secondary": "#222222"}, "typography": {"heading_font_url": "https://fonts.gstatic.com/s/preset.woff2"}, "vocabulary": {"bib_label": "EventBib", "run_label": "PresetRun"}}
```

### 3. Role-level execution probes (stronger than ACL introspection)
Script: `/tmp/opencode/task3-role-probes.sql`, raw output: `/tmp/opencode/task3-role-probes.out`. `SET ROLE` to the real PostgREST roles:
- AS `anon`: published theme resolves (`colors.primary` = `#111111`); draft → NULL ✓
- AS `anon`: `jsonb_deep_merge` → `permission denied for function jsonb_deep_merge` — machine-verified `PASS: anon denied on jsonb_deep_merge (insufficient_privilege)` via DO-block exception handler ✓
- AS `authenticated` (no claims): published ok; draft hidden ✓
- AS `service_role` **with** its JWT claim set (as PostgREST does): draft resolvable ✓
- AS `anon` **without** the service claim: draft hidden → gate is claim-driven (correct for SECURITY DEFINER), not role-name-driven ✓

### 4. Per-task gate (Global Constraints)
`npx tsc --noEmit` → clean; `npx vitest run` → `Test Files 27 passed (27), Tests 267 passed (267)`. (SQL-only change; gates confirm baseline untouched.)

### 5. Cleanup
Matrix seed rows deleted (cascade-verified); `leftover_matrix_events = 0`. Probe rows deleted. Local DB left clean; only the known-untracked `supabase/.branches/` CLI artifact remains in git status (deferred minor from Task 1, not committed).

## Bug caught by verification (fixed before commit)
First `jsonb_deep_merge` draft applied `jsonb_strip_nulls` to the override **pre-merge**, which made a null override a no-op: `merge(preset, {"colors":{"secondary":null}})` kept the preset's `secondary` instead of dropping it — the exact plan Step 4 assertion ("null in override → preset value dropped → platform default") FAILED. Root cause: strip-nulls must apply to the **result** (null override = removal directive), not to the inputs. Rewritten (`v_base - v_key` on null, recursion preserved), full `db reset` + matrix re-run → 18/18 + 24/24 PASS. This is also why the stored-config seed was corrected: 076's validator rejects JSON-null color values in `theme_config` (non-string → invalid), so null-drop semantics live in the merge contract and are asserted there directly.

## Notes / concerns for @manager & @reviewer
1. **No cloud apply in this task** (per dispatch): 078 awaits MCP `apply_migration` to `ugexrrslijmwtieevjbs` together with 076/077/079 in one sitting (@db-specialist). `db push` remains forbidden (remote history missing 062/063 while their effects are live).
2. **Stored `theme_config` cannot carry JSON nulls** (076 validator, partial mode, rejects non-string color values — by design, reviewed in Task 1). Consequence for **Task 13**: the editor's per-key "reset to preset" must send a *stripped* config (omit the key) or strip nulls server-side before writing `theme_config`; it cannot rely on writing JSON nulls. The RPC-level null-drop contract is still fully implemented and tested (direct `jsonb_deep_merge` calls), matching the plan's interface definition.
3. **`is_active` not filtered** in `get_event_theme`: spec §4.3 defines resolution purely as `tokens ⊕ config`; no deactivation semantics are specified anywhere. Flagging in case P2 wants inactive presets to stop resolving — one-line change (`and p.is_active`).
4. **service_role gate is claim-based** (`request.jwt.claim.role`), not `current_user`-based — required inside SECURITY DEFINER (current_user = owner during execution). Verified both directions (claim present → draft visible; same role without claim → hidden). PostgREST sets the claim for every request, so production behavior is unaffected.
5. `postgres` appears in `get_event_theme` ACL — Supabase default privileges; superuser, not reachable via PostgREST; cosmetic only.
6. Spec/plan conflict scan: none found — implemented signatures, grant order, visibility rules, merge semantics and commit message match plan lines 66–77 + spec §4.3/§9/§12.3 verbatim.

## Raw evidence (verbatim psql output)

### Full verification run (`task3-verify.out`)
```
── 0. auth.jwt() reads the claims GUC (sanity) ──
SET
                  owner_jwt_app_metadata                  
----------------------------------------------------------
 {"organizer_id": "11111111-1111-1111-1111-111111111111"}

RESET
── 1. Seed: orgs A/B, system preset S, config-only preset T ──
INSERT 0 2
INSERT 0 2
── 2. Seed events (all owned by org A) ──
INSERT 0 5
   → config-only event loses its preset (ON DELETE SET NULL):
DELETE 1
                  id                  | preset_id_nulled |            slug            
--------------------------------------+------------------+----------------------------
 aaaaaaaa-0000-0000-0000-000000000005 | t                | matrix-configonly-6c978413

── 3. Function metadata (immutability / security definer / pinned search_path) ──
     proname      | volatility | security_definer |      proconfig       
------------------+------------+------------------+----------------------
 get_event_theme  | stable     | t                | {"search_path=\"\""}
 jsonb_deep_merge | immutable  | f                | {"search_path=\"\""}

── 4. ACL: get_event_theme granted to anon/authenticated/service_role (postgres row = owner via default privileges, not API-exposable) ──
     proname      |    grantee    | privilege_type 
------------------+---------------+----------------
 get_event_theme  | anon          | EXECUTE
 get_event_theme  | authenticated | EXECUTE
 get_event_theme  | postgres      | EXECUTE
 get_event_theme  | service_role  | EXECUTE
 jsonb_deep_merge | postgres      | EXECUTE

── 5. Raw merged theme (anon, published event) ──
SET
SET
                                                                                                                               merged_published                                                                                                                                
-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 {"meta": {"version": 1}, "colors": {"ring": "#445566", "accent": "#333333", "primary": "#AA0000", "secondary": "#222222"}, "typography": {"heading_font_url": "https://fonts.gstatic.com/s/preset.woff2"}, "vocabulary": {"bib_label": "EventBib", "run_label": "PresetRun"}}

── 6. Visibility matrix — raw per-persona rows (draft | published | closed) ──

SET
SET
 caller | draft_theme_visible | published_theme_visible | closed_theme_visible 
--------+---------------------+-------------------------+----------------------
 anon   | f                   | t                       | t

SET
SET
         caller          | draft_theme_visible | published_theme_visible | closed_theme_visible 
-------------------------+---------------------+-------------------------+----------------------
 runner(no app_metadata) | f                   | t                       | t

SET
SET
    caller     | draft_theme_visible | published_theme_visible | closed_theme_visible 
---------------+---------------------+-------------------------+----------------------
 owner (org A) | t                   | t                       | t

SET
SET
         caller          | draft_theme_visible | published_theme_visible | closed_theme_visible 
-------------------------+---------------------+-------------------------+----------------------
 other-organizer (org B) | f                   | t                       | t

SET
SET
 caller | draft_theme_visible | published_theme_visible | closed_theme_visible 
--------+---------------------+-------------------------+----------------------
 admin  | t                   | t                       | t

SET
SET
    caller    | draft_theme_visible | published_theme_visible | closed_theme_visible 
--------------+---------------------+-------------------------+----------------------
 service_role | t                   | t                       | t

── 7. Visibility matrix — machine verdict (18 cells, spec §12.3) ──
psql:/tmp/opencode/task3-verify.sql:167: NOTICE:  VISIBILITY MATRIX: ALL 18 CELLS PASS
DO
── 8. Merge correctness + function metadata asserts (machine verdict) ──
psql:/tmp/opencode/task3-verify.sql:273: NOTICE:  MERGE + METADATA ASSERTS: ALL 24 PASS
DO
── 9. Cleanup ──
DELETE 1
DELETE 2
 leftover_matrix_events 
------------------------
                      0

── VERIFICATION SCRIPT COMPLETE ──
```

### Role probes (`task3-role-probes.out`)
```
INSERT 0 1
INSERT 0 1
INSERT 0 2
── AS anon: published theme resolvable, draft hidden ──
SET
 anon_published_primary 
------------------------
 #111111

 anon_draft_hidden 
-------------------
 t

── AS anon: jsonb_deep_merge must be PERMISSION DENIED ──
psql:/tmp/opencode/task3-role-probes.sql:26: NOTICE:  PASS: anon denied on jsonb_deep_merge (insufficient_privilege)
DO
RESET
── AS authenticated (no claims): published ok, draft hidden ──
SET
 auth_published_ok 
-------------------
 t

 auth_draft_hidden 
-------------------
 t

RESET
── AS service_role (with its JWT claim set, as PostgREST does): draft resolvable ──
SET
SET
 svc_draft_ok 
--------------
 t

RESET
RESET
── AS anon WITHOUT the service claim: draft must stay hidden (claim-driven, not role-driven) ──
SET
 no_claim_draft_hidden 
-----------------------
 t

RESET
DELETE 1
DELETE 1
── ROLE PROBES COMPLETE ──
```

### Per-task gate
```
TSC GREEN

 Test Files  27 passed (27)
      Tests  267 passed (267)
   Start at  22:42:56
   Duration  3.56s (transform 3.43s, setup 7.71s, import 5.65s, tests 1.64s, environment 23.41s)
```


### .superpowers/sdd/2026-10-28-event-themes-p1/task-4-report.md

# Task 4 report — Migration 079_seed_theme_presets (Event Themes P1)

- **Status:** implementer DONE
- **Branch:** `feat/event-themes-p1` (verified with `git branch --show-current`) — commits **91d8d13..334aa0f**, committed locally ONLY, never pushed, main/master untouched, cloud DB untouched (076–079 cloud apply is @db-specialist via MCP `apply_migration`).
- **File created:** `supabase/migrations/079_seed_theme_presets.sql` (172 lines; live up block + commented `-- ══ down ══` block per repo convention from 076–078).

## What was built

Six system presets, `kind='system'`, `organizer_id NULL`, fixed uuids committed as literals (repo-wide grep confirmed zero collisions with any existing uuid — protects the 077 `events.theme_preset_id` FK):

| # | slug | fixed uuid | colors (finalized) | vocabulary |
|---|---|---|---|---|
| 1 | `pelikat-classic` | `b7d4dfdd-0c4d-4427-b561-b989f370008d` | primary `#00807A`, secondary `#115E59`, accent `#C62A2F`, ring `#00807A` | — |
| 2 | `wizard-academy` | `e2c9ba7d-4751-4101-a2e8-b27c86c61a1b` | primary `#4C1D95`, secondary `#5B21B6`, accent `#A16207`, ring `#4C1D95` | bib "Spell Number", medal "House Crest", certificate "Diploma of Magic" |
| 3 | `hidden-village` | `04b5923b-d10d-49fe-ad74-7c5705f92179` | primary `#166534`, secondary `#365314`, accent `#4D7C0F`, ring `#166534` | checkpoint "Waypoint", run "Trail" |
| 4 | `galaxy-runner` | `bd39de2a-0ff0-455e-bb27-047bca7b8194` | primary `#1E1B4B`, secondary `#312E81`, accent `#0891B2`, ring `#1E1B4B` | bib "Crew ID", medal "Star Shard" |
| 5 | `sunset-marathon` | `e4fb2e41-ad2c-4e1f-a8a9-cf334acd72ca` | primary `#C2410C`, secondary `#9A3412`, accent `#BE185D`, ring `#C2410C` | — |
| 6 | `batik-heritage` | `03c7d417-d02a-4104-9299-2f03be5c4d66` | **verbatim §4.6**: `#9C4A1A`/`#3E2C23`/`#D4A017`/`#FBF6EC`/`#2B2118`/`#C68B2E` | **verbatim §4.6**: Kampung/Pingat/Larian/Peserta/Sijil |

Up block = single multi-row `insert … on conflict (slug) do nothing` (plan-mandated; doubles as an idempotency guard). Down block = `delete … where id in (<six fixed uuids>)` — commented, since a live delete at file bottom would erase the seeds on every replay; exercised manually in verification (T4.5).

### Design decisions & spec-conflict notes (no improvisation — flagged)

1. **`typography`/`assets` sections OMITTED from all six seeds** — the plan brief's phrasing ("heading Prata / body Inter" as tokens) conflicts with spec §4.2, which has **no font-family key** — only `heading_font_url`/`body_font_url` (https-only URLs; 076's strict validator rejects any other key in `typography`). Fonts and assets are explicitly **P2 scope** (plan Roadmap: "P2 — Assets + fonts"; §4.6 header: tokens "indicative; final at seed time"). Options were (a) fabricate family-name keys → validator REJECT (CHECK violation), (b) fabricate `fonts.gstatic.com` woff2 URLs → invented hash paths, guaranteed 404s in committed data, (c) omit → contract-valid, P2 gate revisits. Chose (c); documented in the migration header.
2. **Colors for presets 1–5 finalized by this seed** — §4.6 gives roles not hexes for those five ("final at seed time"). Chosen values: primaries all **≥3:1 vs platform background** (computed WCAG 2.1 sRGB: 4.61–15.32:1; secondary/accent 3.53–8.61:1), so the §5.5 save-gate philosophy holds for every seeded palette. Pelikat Classic primary is the **exact platform brand primary** `oklch(0.51 0.16 190)` → `#00807A` (converted with the standard Ottosson matrices, per the Task 6 contract); secondary `#115E59` deep teal, accent `#C62A2F` "race-day red".
3. **Batik verbatim golds are sub-3:1 and kept** — accent `#D4A017` = 2.28:1, ring `#C68B2E` = 2.82:1 vs `#FAFAFA`. Spec-verbatim wins; §5.5 prescribes exactly warn-and-degrade for secondary/accent and warn-only for ring. Batik primary vs **its own** background `#FBF6EC` = 5.72:1 (the §12 pair Task 9 asserts) — well above the hard-block threshold.
4. **Batik vocabulary = 5 of 6 keys** — §4.6 specifies no `bib_label` for Batik; kept verbatim (no invented "Batik" bib term). Downstream is safe: 078 merge base omits the key → Task 8 `resolveLabels` fills the platform fallback.
5. **Copyright-safe archetypes** — roster names are generic ("Wizard Academy", "Hidden Village", "Galaxy Runner"); no franchise themes (§4.6/§10.1). Batik Heritage is Malaysian batik-*inspired* palette + Malay run vocabulary, no protected traditional-expression reproduction.
6. **`on conflict (slug) do nothing` semantics** — plan-mandated clause; if a slug collision ever existed (e.g. an organizer preset squatting the slug), that preset's seed silently no-ops rather than erroring. Accepted per plan; noted for the phase gate.

### Merge-base completeness (078 consumer contract)

Every preset's tokens carry `colors.primary/secondary/accent` (strict-CHECK-enforced) + `meta {"version": 1}`, so `get_event_theme`'s `jsonb_deep_merge(preset.tokens, event.theme_config)` always merges from a complete color base; `vocabulary` present exactly where §4.6 specifies values (partial keys fine — resolve fills fallbacks); `ring` themed in all six; `background/foreground` only where §4.6 gives them (Batik), elsewhere null → platform tokens per §5.1.

## How it was verified

### 1. Full local replay — clean
`supabase db reset` (in `pelikat-web`) applied 001→079 + `seed.sql` with no errors; tail: `Applying migration 079_seed_theme_presets.sql... Finished supabase db reset on branch feat/event-themes-p1.`

### 2. Verification matrix (plan Task 4 Step 2 + brief subset) — psql, raw output captured
Script `/tmp/opencode/task4-verify.sql` + `/tmp/opencode/task4-restore-check.sql`; full raw dump: `/tmp/opencode/task4-verify.out` (embedded below). psql `ON_ERROR_STOP` + DO-block exception asserts.

| # | Check | Result |
|---|---|---|
| T4.1 | 6 rows present, correct fixed uuids/slugs/names, `kind='system'`, `organizer_id` NULL, `is_active=t` | PASS |
| T4.2 | `validate_theme_tokens(tokens, true)` = `t` for all six (strict CHECK path re-proven) | PASS 6/6 |
| T4.3 | Palette + vocabulary record per preset (for reviewer reference) | recorded |
| T4.4 | Machine asserts: count=6; all system/anon/active/strict-valid; uuid set == committed literals; slug roster exact; Batik tokens jsonb-equal to §4.6 verbatim | `NOTICE: T4 ASSERTS: ALL PASS` |
| T4.5 | Down reverses: `DELETE 6` by fixed uuids → 0 rows remain | `NOTICE: DOWN REVERSAL: 0 rows remain — PASS` |
| T4.6 | Re-up restores: re-applying the migration file after manual down → `INSERT 0 6`, 6 rows | PASS |
| T4.7 | Idempotency: migration file applied twice more → `INSERT 0 0` (on conflict (slug) do nothing), still exactly 6 rows | PASS |
| T4.8 | Strict validator green on all restored rows | PASS 6/6 |

`git status --porcelain` after verification: only `?? supabase/migrations/079_seed_theme_presets.sql` (the `supabase/.branches/` CLI artifact is the known Task 1 deferred item, untouched).

## Raw evidence (verbatim psql output — `/tmp/opencode/task4-verify.out`)

```
=== T4.1 seeds present (6 rows, kind/organizer_id/is_active) ===
                  id                  |      slug       |      name       |  kind  | organizer_id | is_active 
--------------------------------------+-----------------+-----------------+--------+--------------+-----------
 03c7d417-d02a-4104-9299-2f03be5c4d66 | batik-heritage  | Batik Heritage  | system |              | t
 bd39de2a-0ff0-455e-bb27-047bca7b8194 | galaxy-runner   | Galaxy Runner   | system |              | t
 04b5923b-d10d-49fe-ad74-7c5705f92179 | hidden-village  | Hidden Village  | system |              | t
 b7d4dfdd-0c4d-4427-b561-b989f370008d | pelikat-classic | Pelikat Classic | system |              | t
 e4fb2e41-ad2c-4e1f-a8a9-cf334acd72ca | sunset-marathon | Sunset Marathon | system |              | t
 e2c9ba7d-4751-4101-a2e8-b27c86c61a1b | wizard-academy  | Wizard Academy  | system |              | t
(6 rows)

=== T4.2 strict validator accepts every preset (CHECK path re-proven) ===
      slug       | strict_ok 
-----------------+-----------
 batik-heritage  | t
 galaxy-runner   | t
 hidden-village  | t
 pelikat-classic | t
 sunset-marathon | t
 wizard-academy  | t
(6 rows)

=== T4.3 palette finalization record (primary per preset) ===
      slug       | primary_hex |                                                                  vocabulary                                                                   
-----------------+-------------+-----------------------------------------------------------------------------------------------------------------------------------------------
 batik-heritage  | #9C4A1A     | {"run_label": "Larian", "medal_label": "Pingat", "checkpoint_label": "Kampung", "certificate_label": "Sijil", "participant_label": "Peserta"}
 galaxy-runner   | #1E1B4B     | {"bib_label": "Crew ID", "medal_label": "Star Shard"}
 hidden-village  | #166534     | {"run_label": "Trail", "checkpoint_label": "Waypoint"}
 pelikat-classic | #00807A     | 
 sunset-marathon | #C2410C     | 
 wizard-academy  | #4C1D95     | {"bib_label": "Spell Number", "medal_label": "House Crest", "certificate_label": "Diploma of Magic"}
(6 rows)

=== T4.4 machine asserts: roster identity + strict CHECK + Batik verbatim ===
psql:/tmp/opencode/task4-verify.sql:88: NOTICE:  T4 ASSERTS: ALL PASS (6 rows, system/anon/active, strict CHECK, fixed uuids, slugs, Batik verbatim)
DO
=== T4.5 DOWN reversal: delete the six by fixed uuid (from down block) ===
DELETE 6
 remaining_seed_rows 
---------------------
                   0
(1 row)

psql:/tmp/opencode/task4-verify.sql:106: NOTICE:  DOWN REVERSAL: 0 rows remain — PASS
DO

## re-up: re-applying 079 migration file after manual down
INSERT 0 6
## re-up again (idempotency probe)
INSERT 0 0

=== T4.6 RE-UP restore (migration file re-applied after manual down) ===
 seed_rows_after_reup 
----------------------
                    6
(1 row)

=== T4.7 idempotency: up applied twice more (on conflict (slug) do nothing) ===
 seed_rows_after_idempotent_reruns | strict_valid 
-----------------------------------+--------------
                                 6 |            6
(1 row)

=== T4.8 strict validator green on all restored rows ===
      slug       | strict_ok 
-----------------+-----------
 batik-heritage  | t
 galaxy-runner   | t
 hidden-village  | t
 pelikat-classic | t
 sunset-marathon | t
 wizard-academy  | t
(6 rows)

psql:/tmp/opencode/task4-restore-check.sql:22: NOTICE:  RE-UP RESTORE + IDEMPOTENCY: PASS (6 rows, all strict-valid)
DO
```

### WCAG contrast evidence (advisory; computed per WCAG 2.1 sRGB vs platform `--background oklch(0.985 0 0)` ≈ `#FAFAFA`)

| preset | primary | secondary | accent | ring |
|---|---|---|---|---|
| pelikat-classic | #00807A 4.61:1 | #115E59 7.27:1 | #C62A2F 5.33:1 | #00807A 4.61:1 |
| wizard-academy | #4C1D95 10.50:1 | #5B21B6 8.61:1 | #A16207 4.72:1 | #4C1D95 10.50:1 |
| hidden-village | #166534 6.83:1 | #365314 8.37:1 | #4D7C0F 4.78:1 | #166534 6.83:1 |
| galaxy-runner | #1E1B4B 15.32:1 | #312E81 10.94:1 | #0891B2 3.53:1 | #1E1B4B 15.32:1 |
| sunset-marathon | #C2410C 4.96:1 | #9A3412 7.00:1 | #BE185D 5.78:1 | #C2410C 4.96:1 |
| batik-heritage (§4.6 verbatim) | #9C4A1A 5.90:1 | #3E2C23 12.66:1 | #D4A017 2.28:1 * | #C68B2E 2.82:1 * |

Batik primary vs own background #FBF6EC = 5.72:1 (≥3:1 hard-block threshold). *Spec-verbatim golds — warn-and-degrade per §5.5.

## Concerns / handoff to @manager

1. **Typography conflict (resolved by omission, flag for overrule):** plan Task 4 lists "heading Prata / body Inter" as Batik tokens; the §4.2 contract has no family-name key and fonts are P2. Seeds omit `typography`/`assets` entirely. If @manager wants stub sections (`"typography": {}`) or real gstatic URLs, that's a one-line amendment at the P2 gate — say so and I'll amend.
2. Batik `bib_label` intentionally absent (not in §4.6); platform fallback applies.
3. Presets 1–5 colors are seed-time finalizations (§4.6 authorizes: "final at seed time"); reviewer may want to eyeball T4.3/T4.8 tables.
4. `on conflict (slug) do nothing` can silently skip a preset if a slug-squatting row exists (plan-mandated clause; acceptable).
5. Per task scope: cloud DB `ugexrrslijmwtieevjbs` was NOT touched — 076–079 cloud apply happens via MCP `apply_migration` in one sitting after phase review.


### .superpowers/sdd/2026-10-28-event-themes-p1/task-5-report.md

# Task 5 — Storage addendum: `event-themes` bucket + RLS (report)

**Branch:** `feat/event-themes-p1` · **BASE:** `334aa0f` · **HEAD:** `de09dc4` · **Committed locally, never pushed.** Cloud DB untouched (per Cloud rule).

## Files changed (commit de09dc4)
- `supabase/setup-storage.sql` — appended `── EVENT THEMES BUCKET (Event Themes P1 — spec §6)` addendum (~105 lines): bucket insert with full config, `can_manage_theme_path(p_name text)` security-definer helper, 4 RLS policies on `storage.objects` (insert/select/update/delete), commented `-- down (addendum only)` block. Purely additive.
- `supabase/seed.sql` — §1 STORAGE BUCKETS: one additional full-config upsert for `event-themes` (existing 3-column block untouched), so a bare `db reset` + seed is self-contained per §1's stated purpose. Uses `on conflict (id) do update` so the limits/mimes land regardless of statement ordering.

## What was implemented
1. **Bucket** `event-themes`: `public=true`, `file_size_limit=10485760` (10 MB), `allowed_mime_types={image/png,image/jpeg,image/webp,font/woff,font/woff2,font/ttf}` — spec §6 verbatim.
2. **Helper** `can_manage_theme_path(p_name text) returns boolean` — `language sql stable security definer set search_path=public`; body: `is_admin() or exists (select 1 from events e where e.organizer_id = get_my_organizer_id() and (storage.foldername(p_name)) = array['organizers', get_my_organizer_id()::text, 'events', e.id::text])`. Canonical-lowercase-uuid + exact 4-segment shape enforced by array text-equality; event ownership by DB exists-check (forged uuid fails); admin bypass inside the helper so all four policies share it. System preset paths (`organizers/system/presets/…`) are service_role-only (bypasses RLS) — outside the validator by design.
3. **Policies** on `storage.objects`, all `to authenticated` and `bucket_id='event-themes' and can_manage_theme_path(name)`: insert (`with check`), select (`using`), update (`using`+`with check` — covers Storage `upsert:true`), delete (`using`). Deliberately NO public select policy → bucket not listable; public read is bucket-level `public:true`.

## Validation evidence (all local, raw outputs in /tmp/opencode/t5/matrix-b.log + conversation)
Setup: `supabase db reset` full replay 001→079 + seed **clean**; addendum applied via psql (SETUP.md manual-step convention). Fixtures from seed: org A `…011`/user `…0b1`/event `…021`; org B `…012`/user `…0b2`/event `…022`; admin `…0a1`. JWT claims emulated via `SET LOCAL role authenticated; SET LOCAL request.jwt.claims = '{…app_metadata…}'`.

**Bucket flags:** `event-themes | t | 10485760 | {image/png,image/jpeg,image/webp,font/woff,font/woff2,font/ttf}` (present after bare reset via seed.sql §1; identical after addendum).

**Helper shape:** `prosecdef=t`, `provolatile=s`, `proconfig={search_path=public}`.

**Matrix B — SQL policy probes (every cell as expected):**
- helper truth table: own path `t`; forged uuid / cross-tenant-org / cross-tenant-event / UPPERCASE uuid / shallow shape / deep subdir / system presets → all `f`; admin on system path `t`.
- INSERT: org A own path `INSERT 0 1`; forged, ×tenant(×2), UPPERCASE, shallow, deep, system, anon, org-B-on-A → `new row violates row-level security policy` (42501); admin for org B `INSERT 0 1` (bypass).
- SELECT: org A sees own row; org B 0 rows; anon 0 rows.
- UPDATE (upsert:true): org A own `UPDATE 1`; org B on A `UPDATE 0`; rename to forged/xtenant path → RLS violation (with check blocks path reassignment).
- SQL DELETE: blocked for **everyone** incl. postgres by local `storage.protect_delete()` trigger ("Use the Storage API instead") — matches spec note "hosted Supabase blocks direct SQL deletes"; delete policy exercised via API below.

**Matrix C — real Storage API round trip (minted HS256 JWTs, local dev secret):**
- owner upload own path → 200; public GET **no auth** → 200 with correct bytes.
- anon LIST → `[]` (200, zero rows — not listable); anon direct GET by known path → 200 (see Nuances).
- cross-tenant upload (org B → org A path) → 400 `new row violates row-level security policy`.
- mime gate: `text/plain` upload → 400 `invalid_mime_type`; size gate: 11 MB → 413 `EntityTooLarge`.
- owner LIST own prefix → 200 (sees files); owner re-upload `x-upsert: true` → 200 (update policy path; note: upsert flag is the `x-upsert` header on this storage version, `?upsert=` query param is NOT honored → 409); owner DELETE → 200 `Successfully deleted`; public GET after delete → `{"statusCode":"404","code":"NoSuchKey"}` (HTTP 400 envelope).

**Per-task gates:** `tsc --noEmit` exit 0; `vitest run` 27 files / 267 tests passed. Final canonical replay: fresh `db reset` → bucket via seed ✓ → addendum apply clean → matrix re-run pristine ✓.

## Findings / notes for reviewer (no improvisation, per brief)
1. **Bug found & fixed by the matrix — parameter shadowing:** with the brief's literal signature `can_manage_theme_path(name text)`, the bare `name` inside `exists (… from events e …)` resolves to the **`events.name` column** (Postgres: column names outrank SQL-function parameter names). `foldername(e.name)` = empty array → helper **always-false for non-admins** (admin only "worked" via the `is_admin()` short-circuit). Proven differentially (identical body with param `p_name` → true) and visually (`e.name` bound into foldername). Fix: param renamed to `p_name` — positional-call-compatible (policies pass `name` positionally; call signature `can_manage_theme_path(text)` unchanged). Deviation from the brief's interface string is documented in a code comment + this report. **This was the plan's Review Focus #1 trap; the forged-uuid test caught it.**
2. **Pre-existing replay drift (NOT introduced here):** `psql -f supabase/setup-storage.sql` after a fresh reset aborts at line 65 — `policy "runner uploads own ic document" already exists` (migration 041 creates it; 069/026/027 similarly overlap avatar/race-photo policies). Reproduced identically at BASE — this has always failed mid-file. Workaround for validation: apply the addendum section alone (`sed -n '/── EVENT THEMES BUCKET/,$p'`). Cloud apply (@db-specialist, post-review) is unaffected — cloud already has the migration-created policies and takes the addendum cleanly. Suggest carrying a fix (drop-if-exists guards or aligning the script to 041/069) to the Task 14 phase gate.
3. **Spec nuance — public-bucket download semantics:** with `public:true`, the storage-api serves individual-object GETs on ANY route to anon (verified: direct `/object/event-themes/…` GET → 200). What RLS controls is **listing** (anon LIST → `[]`) and mutations. Spec §6's "API list/download stays owner+admin-scoped" is implementable for list; anonymous fetch of a *known* path is inherent Supabase public-bucket behavior (paths are unguessable uuids). Flagging so the reviewer can confirm this matches spec intent ("served unauthenticated" implies it).
4. **seed.sql §1 registration** added per the plan's "follow existing conventions" clause (§1 exists exactly to make reset+seed self-contained for buckets living in setup-storage.sql). The addendum's bucket insert stays `on conflict (id) do nothing` (file style); §1's upsert carries the full config.
5. **Storage-api upsert flag:** on this local storage version the upsert trigger is the `x-upsert: true` header; `?upsert=true` query param silently becomes a 409 on existing keys. Worth confirming which flag supabase-js sends in P2 uploader work.
6. Leftover local state: one seeded probe row (`…/logo.png`) persists in local storage.objects (SQL deletes trigger-blocked); wiped by next `db reset`. No cloud impact.

## Handoff
- Cloud apply of the addendum = @db-specialist via MCP after phase review (together with migrations 076–079), per plan Task 5 Note.
- Task 6+ can proceed; no app code depends on this task until P2 uploaders.


### .superpowers/sdd/2026-10-28-event-themes-p1/task-6-report.md

# Task 6 Report — Vendored Color Module (TDD)

Plan: `docs/superpowers/plans/2026-10-28-event-themes-p1.md` §Task 6 (lines 99–110) · Spec: `docs/event-themes-design.md` §5.2 (`color.ts` row) + Global Constraints.

## Status: DONE

- **Branch:** `feat/event-themes-p1` (verified via `git branch --show-current` before starting)
- **BASE:** `de09dc4` (`de09dc4c847e7602750b5a6e84f67902bc1f9370`) — Task 5 head, as expected
- **HEAD:** `5006a78` (`5006a781e47de491b235bea5edf3329a1402c9f4`)
- **Commit:** `feat(theme): vendored oklch/wcag color module` — local only, **not pushed**, main/master untouched
- **Files:** `src/lib/theme/color.ts` (133 lines, zero deps) · `tests/theme/color.test.ts` (175 lines, 21 tests)

## Exports (signatures verbatim per brief / spec §5.2 line 127)

| Export | Signature | Notes |
|---|---|---|
| `hexToOklch` | `(hex: string) => { l: number; c: number; h: number }` | standard sRGB→linear (0.04045)→OKLab (Ottosson M1/M2)→OKLCH, h normalized [0,360) |
| `oklchToString` | `(o: {l,c,h}) => string` | `oklch(L C H)`, l/c 3 decimals, h 1 decimal, trailing zeros trimmed |
| `hexToRgb255` | `(hex: string) => [number, number, number]` | cert payload |
| `relativeLuminance` | `(hex: string) => number` | WCAG 2.1 sRGB (0.03928 threshold, per WCAG 2.1 text) |
| `contrastRatio` | `(a: string, b: string) => number` | order-independent; malformed → 1 |
| `pickForeground` | `(fill: string) => string` | white if `contrastRatio(fill,'#ffffff') ≥ 4.5`, else `oklch(0.145 0 0)` |
| `deriveDarkVariant` | `(hex: string) => string` | same hue, L clamp [0.68, 0.82], chroma ×0.85 cap 0.20 → **oklch() string** |

No imports from npm packages; no new dependencies (lockfile untouched).

## TDD evidence

**Step 1–2 (RED):** tests written first; `pnpm exec vitest run tests/theme/color.test.ts`:
```
Failed to resolve import "@/lib/theme/color" from "tests/theme/color.test.ts"
 Test Files  1 failed (1)
      Tests  no tests
```
(Second intermediate red: 3 failed / 18 passed — missing `hexToRgb255` export, fixed.)

**Step 4 (GREEN):** `pnpm exec vitest run tests/theme/color.test.ts`:
```
 Test Files  1 passed (1)
      Tests  21 passed (21)
```

Full gates:
```
pnpm exec vitest run        → Test Files 28 passed (28) / Tests 288 passed (288)
pnpm exec tsc --noEmit      → green (no output)
pnpm exec eslint <both files> → green
```
Baseline 267 tests / 27 files + 21 new / 1 file = 288 / 28. Exact match.

## Test vectors covered (plan-mandated + extras)

- `hexToOklch('#FF0000')` → L 0.628 / C 0.258 / h 29.2 (`toBeCloseTo` 2/2/1 digits) — plan vector ✓
- `hexToOklch('#9C4A1A')` → L≈0.505 / C≈0.124 / h≈46.9 (hand-derived Batik parity vector) ✓
- black `{0,0,0}`, white L≈1 C<0.001; case-insensitivity + optional `#` ✓
- `contrastRatio('#000000','#ffffff')` = 21 (`toBeCloseTo(21, 10)`); symmetric; self→1; malformed→1 ✓
- `pickForeground('#FFD700')` → `oklch(0.145 0 0)`; white branch proven to fail (≈1.40:1 < 4.5); dark-fg ≥4.5 proven analytically (achromatic oklch(0.145 0 0) → WCAG lum = 0.145³ ≈ 0.00305 → ≈14.1:1). Plus `pickForeground('#9C4A1A')` → `#ffffff` (6.16:1) ✓
- `deriveDarkVariant('#9C4A1A')` → hue preserved (vs source h), L∈[0.68,0.82] (=0.68), C≤0.20 (×0.85 reduction asserted); `#FFD700` clamps down to exactly L 0.82 ✓
- Malformed/no-throw matrix: `{undefined, null, 42, {}, '#', '#12G45Z'}` across **all 7 fns** → safe fallbacks, never throws (spec §5.5.4) ✓
- `oklchToString` format/rounding: `{0.628,0.258,29.2}` → `oklch(0.628 0.258 29.2)`; zeros → `oklch(0 0 0)` ✓

## Deviations & decisions (flag for @reviewer/@manager)

1. **Test path:** plan says colocate at `src/lib/theme/color.test.ts`, but this repo's `vitest.config.ts` includes only `tests/**/*.{test,spec}.*` — a colocated file can never run, breaking the plan's own Step 2 gate. Placed tests at **`tests/theme/color.test.ts`** (new category dir, consistent with `tests/{security,usability,integration,reliability}`), imported via `@/lib/theme/color` alias. Consider updating the plan text for the archival copy.
2. **Two linearization thresholds:** OKLCH path uses 0.04045 (standard sRGB/CSS — parity with culori/CSS Color 4); luminance path uses 0.03928 (WCAG 2.1 text verbatim). Both tiny closures with comments; spec wins.
3. **`deriveDarkVariant` returns an oklch() string, not hex:** the module intentionally has no inverse OKLCH→sRGB (spec function list has none; ~120-line budget), and spec §5.1 defines dark slots as oklch strings. Param is `hex` per brief.
4. **`pickForeground` semantics:** white is *measured* (≥4.5:1 gate); dark fg `oklch(0.145 0 0)` is the final fallback (not measured — would require the inverse conversion). Matches "first of … / …" reading; the ≥4.5 guarantee for the dark fallback is unit-tested analytically.
5. **Fallbacks on malformed input:** hexToOklch→`{0,0,0}`; hexToRgb255→`[0,0,0]`; relativeLuminance→0; contrastRatio→1; pickForeground→`oklch(0.145 0 0)`; deriveDarkVariant→`oklch(0.68 0 0)` (neutral at clamp floor). Warnings are resolve.ts's job (Task 7); color.ts only never-throws.

## Not done (out of scope)

- No push, no PR, no main/master contact. Containers untouched.
- `untracked supabase/.branches/` CLI artifact noted in Task 1 ledger — pre-existing, left as-is.


### .superpowers/sdd/2026-10-28-event-themes-p1/task-7-report.md

# Task 7 Report — Theme Types + Resolver (TDD)

Branch: `feat/event-themes-p1` · Commits: **5006a78..9cb5f13** (`9cb5f13 feat(theme): ResolvedTheme resolver`) · No push, no new deps.

## Files
- Created `src/lib/theme/types.ts` — `ThemeTokens` (§4.2 shape), `BrandSlot { light, dark, fgLight, fgDark }` (§5.1, oklch strings), `ResolvedTheme` (4 BrandSlots primary/secondary/accent/ring, nullable background/foreground pairs, `fonts`, fully-resolved `labels`, `warnings[]`, `source { presetId, overriddenKeys }`), `LabelKey` union.
- Created `src/lib/theme/resolve.ts` — `mergeThemeConfig(preset, override | null)` (known-keys allowlist both sides, plain-object guard, null leaf/section → drop, never throws, `__proto__`-safe by construction); `getResolvedTheme(supabase: SupabaseClient, eventRow)` (load preset → merge → HEX-validate → contrast precheck → derive dark → fill labels/fonts/tints; outer try/catch → platform theme + warning).
- Created `tests/theme/resolve.test.ts` — 16 tests. **Path deviation from plan** (`src/lib/theme/resolve.test.ts`): vitest include glob is `tests/**` — a src-co-located test never runs; followed Task 6's established `tests/theme/` convention.

## TDD evidence (exact commands)
1. RED — `npx vitest run tests/theme/resolve.test.ts` → `Test Files 1 failed (1) · Tests no tests` (transform error: failed to resolve import `@/lib/theme/resolve`).
2. Iterations after implementation (test-driven bug discovery, each fixed in impl, not by loosening tests):
   - 3 failed / 16 → (a) null SECTION override didn't drop the section → added section-level `null` reset per §4.3/`jsonb_strip_nulls` semantics; (b) preset never loaded — passed the DB row `{id, tokens}` where `mergeThemeConfig` expects the tokens blob → project `data.tokens`.
   - 2 failed / 16 → `source.overriddenKeys` recorded preset-sourced keys; now only surviving override leaves that actually took effect (degraded keys excluded — warnings cover them).
3. GREEN — `npx vitest run tests/theme/resolve.test.ts` → `Test Files 1 passed (1) · Tests 16 passed (16)`.
4. Gate — `npx tsc --noEmit` → exit 0 · `npm test` (full suite) → `Test Files 29 passed (29) · Tests 304 passed (304)` · `npx eslint <3 new files>` → exit 0.

## Carried requirement honored (Task 6 review)
`fgDark = DARK_FG ('oklch(0.145 0 0)')` assigned **directly** in `brandSlot()` — `pickForeground` only ever receives validated HEX. Comment at both `DARK_FG` and the assignment site explains why (parseHex is HEX-only; silent-dark-fg would mask bugs; dark variants ≥ ~6.9:1). Test pins `fgDark === 'oklch(0.145 0 0)'` and `fgLight` behavior on both a mid-tone (`#777777` → dark companion, passes 3:1 at 4.07:1) and a dark fill (`#3E2C23` → white).

## Spec-interpretation notes (no improvisation beyond these, flag if wrong)
1. **Contrast precheck at resolve**: §5.5's hard-block is save-time (Task 9). Resolve mirrors its semantics — primary/secondary/accent <3:1 vs platform light background degrade to platform + warning (a bypassed `#FFD700`-class fill renders nothing readable); ring warns only. Precheck uses HEX proxy `#f4f4f4` ≈ `oklch(0.985 0 0)` because `contrastRatio` is HEX-only (dark side needs no gate: derived L∈[0.68,0.82] vs dark bg trivially >3:1).
2. **ThemeTokens all-optional in TS**: §4.2 marks colors.primary/secondary/accent required — that requiredness is the DB validator's write-time job; the merge output legitimately expresses dropped keys, so the type can't claim them required (documented in types.ts).
3. **Ring as full BrandSlot**: §5.1 lists ring separately from "per-role BrandSlot", but plan Task 10 emits the 4-var pattern `× primary/secondary/accent/ring` — ring carries all four slots (superset, Task 10 consumes or skips fg).
4. **background.dark / foreground.dark always null** at resolve: no dark-tint derivation exists in color.ts (`deriveDarkVariant` clamps L to the brand-fill band [0.68,0.82]); §5.5 dark tint range [0.05,0.12] is save-time/P2.

## Carried to later tasks
- **→ Task 8**: label fallbacks currently inline (`LABEL_FALLBACKS` in resolve.ts, raw passthrough — safe: labels render as text children only); dedupe onto `labels.ts` `fallbackLabel`/`resolveLabels` + wire `sanitizeLabel` when it lands.
- **→ Task 10/11**: font allowlist at resolve is the https-only floor (spec §5.4 full origin + `.woff2` narrowing needs storage origin → enforce at `buildFontFace` consumer). `ResolvedTheme.background` is carried but unused by Task 10's var list.
- **→ Tests-as-drift-alarm**: platform slot literals (impl + tests) mirror `globals.css` `:root`/`.dark`; changing globals will fail these tests intentionally.

## Verification summary
`tsc --noEmit` ✅ exit 0 · `vitest run` ✅ 304/304 (29 files) · eslint ✅ clean · commit `9cb5f13` local-only on `feat/event-themes-p1` (base `5006a78`).


### .superpowers/sdd/2026-10-28-event-themes-p1/task-8-report.md

# Task 8 Report — Labels Module (`labels.ts`, TDD)

**Status:** DONE · **Branch:** `feat/event-themes-p1` · **Commits:** `9cb5f13..201eb6b` (single commit `201eb6b` `feat(theme): label sanitization + fallbacks`) · **Pushed:** NO (local only)

## Files changed
- **Created** `src/lib/theme/labels.ts` — `LABEL_KEYS` (6 keys), `sanitizeLabel`, `fallbackLabel`, `resolveLabels`, `labelPreview`. Zero dependencies.
- **Created** `tests/theme/labels.test.ts` — 17 tests.
- **Modified** `src/lib/theme/resolve.ts` — dedupe (carried Task 7 requirement): inline `LABEL_FALLBACKS` removed; `platformTheme` now uses `resolveLabels(null)`; label loop uses `resolveLabels(vocab)`; local `VOCABULARY_KEYS` list removed in favor of imported `LABEL_KEYS` (single source of label truth, spec §5.2); unused `LabelKey` import dropped. Net −17 lines in resolve.ts.

## TDD evidence
1. **Failing first:** `pnpm exec vitest run tests/theme/labels.test.ts` → `Test Files 1 failed (1), Tests no tests` (module did not exist — transform error).
2. **Implement → green:** same command → `Tests 17 passed (17)`.
3. **Resolve untouched-green through refactor:** `pnpm exec vitest run tests/theme/labels.test.ts tests/theme/resolve.test.ts` → `2 passed, Tests 33 passed (33)` (16 existing resolve tests all green).
4. **Full suite:** `pnpm test` → `Test Files 30 passed (30), Tests 321 passed (321)` (baseline 304/304 across 29 files + 17 new).
5. **Typecheck:** `pnpm exec tsc --noEmit` → green (exit 0).

## Design decisions (spec/brief interpretations)
- **Tag stripping vs char stripping:** brief says "strip `<`/`>` HTML chars", but the plan's own test vector `"  <b>Scroll</b>\u0000 "` → `"Scroll"` is only reachable by removing whole `<…>` tags (char-only stripping yields `"bScroll/b"`). `sanitizeLabel` removes well-formed `<[^>]*>` markup AND any stray unclosed `<`/`>` chars — satisfies both the vector and the brief's language. Spec (§5.2 "strip HTML/control chars") + plan test treated as authority. **Noted, not improvised beyond the vector.**
- **Pipeline order:** tags → stray `<>` → collapse `\s+` → strip C0 (`\u0000-\u001F`) → trim → `slice(0, 40)`. Collapse runs BEFORE C0-strip so tabs/newlines become single spaces (words don't fuse: `"Bib\tNumber"` → `"Bib Number"`) while non-whitespace controls are removed.
- **C0 strictly U+0000–U+001F per spec** — DEL (U+007F) is not C0 and passes through. Harmless under the text-children-only invariant; flag if the reviewer wants it stripped.
- **`fallbackLabel(unknown)` → `''`** ("unknown key ignored"; signature is `string → string`).
- **`resolveLabels` runtime-hardened:** non-string values (e.g. `42` from hand-crafted JSONB) and empty-after-sanitize values → fallback; output is always exactly the 6 keys.
- **Preview:** `labelPreview(label)` → `` `Your ${label} #1234` ``; verified exact string `labelPreview(resolveLabels(null).bib_label) === 'Your Bib Number #1234'`. Plan left the signature loose; kept minimal — Task 13 can parameterize the sample when the editor needs a real bib number.
- **Carried Task 4 requirement honored:** bib→"Bib Number" fallback ships (Batik Heritage has no `bib_label` by design); covered by "Batik vocab passes through; bib_label absent → 'Bib Number'" test.
- **`overriddenKeys` semantics preserved:** a vocab key is marked when the raw merged value is a string (value flowed into resolveLabels) — matches existing resolve behavior; all 16 resolve tests unchanged and green.

## Interfaces handed forward
- **Tasks 10/11:** `ResolvedTheme.labels` is plain sanitized strings — render as text children only, never `dangerouslySetInnerHTML` (stated in labels.ts header + Global Constraints).
- **Task 13 vocab editor:** consumes `LABEL_KEYS` (6), `LABEL_MAX`-equivalent 40-char cap (cap enforced inside `sanitizeLabel`; constant is private — expose later only if the editor needs the number), `labelPreview` for live preview.
- **Task 9:** per ledger carried note — validate.ts must match resolve's platform-background decision (`#f4f4f4` proxy) — unchanged by this task.

## Verification commands
- `pnpm exec vitest run tests/theme/labels.test.ts` (fail → pass, above)
- `pnpm exec vitest run tests/theme/labels.test.ts tests/theme/resolve.test.ts`
- `pnpm test` — 321/321 across 30 files
- `pnpm exec tsc --noEmit` — green

## Concerns
- None blocking. Two notes for the reviewer: (1) tag-vs-char stripping interpretation above; (2) DEL/U+007F not stripped (C0-only per spec).
- Untracked `supabase/.branches/` (supabase CLI noise) left out of the commit deliberately.


### .superpowers/sdd/2026-10-28-event-themes-p1/task-9-report.md

# Task 9 — Theme Validation Module (TDD) — Implementer Report

Branch: `feat/event-themes-p1` · BASE `201eb6b` → HEAD `8212cec` (2 commits, local only, never pushed)

## Status: DONE

| Commit | Message |
|---|---|
| `8c04c35` | fix(theme): one shared PLATFORM_BG_HEX (#fafafa) for save-gate + resolve precheck |
| `8212cec` | feat(theme): server-side save validation |

## Files changed

- **Create** `src/lib/theme/validate.ts` — `validateThemeConfig(config: unknown): { ok: boolean; errors: string[]; warnings: string[] }` (+ exported `ThemeValidation` type)
- **Create** `tests/theme/validate.test.ts` — 23 tests
- **Modify** `src/lib/theme/color.ts` — new exported `PLATFORM_BG_HEX = '#fafafa'` (single shared decision)
- **Modify** `src/lib/theme/resolve.ts` — consumes the shared constant (local proxy deleted); two stale comments fixed
- **Modify** `tests/theme/resolve.test.ts` — boundary gray swap `#909090` → `#949494` + ratio-comment updates (16 tests intact)

## Carried requirement (Task 7) — shared platform-background decision

- Picked the **true** light `--background` = `oklch(0.985 0 0)` = **`#fafafa`** (neutral gray, Y = 0.985³ → sRGB 250/255; verified numerically). Old proxy `#f4f4f4` had ΔY = 0.051 (measured 0.9047 vs 0.9560) and flipped verdicts in the 3.0–3.06:1 band.
- `PLATFORM_BG_HEX` is exported **once** from `color.ts` (the leaf module both already import) and used by BOTH `validate.ts` (save gate) and `resolve.ts` (render-degrade precheck). No second constant exists.
- Stale resolve.ts comment fixed: the "<0.1% delta" claim is gone with the proxy; the precheck comment now documents the shared-constant decision and the dark-side rationale (dark variants L∈[0.68,0.82] trivially clear 3:1 vs oklch(0.07 0 0), so only light mode is gated).
- Resolve test adjustment documented in-line: `#909090` sits at **3.06:1** vs the true background (would have stopped degrading = save-gate/render disagreement precisely as flagged); replaced with `#949494` (2.91:1, degrades under both backgrounds). Test title/behavior unchanged.

## DB-mirror verification (empirical, not assumed)

Probed the **live** local 076 `validate_theme_tokens(…, false)` via psql before writing the mirror:

| input | DB result | client mirror |
|---|---|---|
| `{"colors": null}` | **f** | error |
| `{"colors": {"primary": null}}` | f | error |
| `{"meta": null}` / `{"meta": {"version": null}}` / `{"meta": {}}` | f / f / f | error |
| `{"colors": {}}` | t | ok |
| `'null'::jsonb` (top) | f | error |
| `null` column value (077 CHECK: `theme_config is null or …`) | valid | `validateThemeConfig(null)` → ok |

Consequence: resolve.ts's old comment "DB allows `{\"colors\": null}`" was **wrong** — fixed in `8c04c35` (merge keeps read-side leniency per §5.5.4 "resolve never throws"; writes are strict). Validate rejects explicit JSON nulls at every nesting level.

## §12.2 matrix mirror (validate.test.ts)

- **ACCEPT**: full (all 5 sections, zero errors/warnings), partial (any section subset), minimal `{}`, column-NULL `null`/`undefined`.
- **REJECT**: bad HEX (`not-a-hex`, `#12345`, `123456`, `#GGGGGG`, 7-digit, non-string), `javascript:`/`http:` font URLs, `..` asset traversal, off-charset asset paths (space, `;`, empty), `javascript:` assets (charset route, 076-faithful), unknown keys top-level + every section, wrong `meta.version` (2, `"1"`, missing, non-object meta), 65-char labels (64 ok), >64 KB payload, non-object configs, JSON-null nesting.
- **Never throws**: cyclic input → structured `ok:false`.

## WCAG gate (§5.5 / §13 ④) — measured vs shared `PLATFORM_BG_HEX`

| case | ratio vs #fafafa | result |
|---|---|---|
| primary `#949494` | 2.91:1 | **BLOCKED** (only hard block; no duplicate warning) |
| primary `#919191` | 3.02:1 | ok — boundary pin (was 2.87:1 = blocked under old proxy; pins the shared constant) |
| primary `#929292` | 2.98:1 | blocked |
| primary `#777777` | 4.29:1 | **ok — see conflict note** |
| Batik `#9C4A1A` on `#FBF6EC` | 5.90:1 platform (≈5.72:1 themed bg) | ok, no warnings |
| secondary `#949494` / accent `#D4A017` | 2.91 / 2.28 | ok:true + warn-and-degrade warning |
| ring `#949494` | 2.91 | ok:true + "(recommended)" warning |
| background `#FBF6EC`/`#FAFAFA`/`#050505` | L 0.974/0.985/0.115 | tints accepted, no warning |
| background `#FFD700`/`#000000` | L 0.887/0.000 | warn + will-ignore (outside L windows) |
| foreground `#FFD700` | — | no gate (§5.5 defines none) — pinned |

## ⚠️ Spec/plan conflict (noted, spec wins — not improvised)

**Plan Task 9 Step 1: "`#777777` primary on white → blocked (<3:1)" is mathematically wrong.** WCAG 2.1: `#777777` = 4.48:1 vs white, 4.29:1 vs `#fafafa` — comfortably ≥3:1. The locked spec §5.5 gate therefore does NOT block it, and Task 7's reviewed resolve test already pins `#777777` as *passing* the gate ("mid-tone: passes the 3:1 fill-vs-background gate"). Implementing the plan's example verbatim would have produced a validator contradicting both the spec and the existing green tests. Resolution: spec §5.5 math wins; `#777777` acceptance is pinned as an explicit test with the full conflict note; the genuinely-blocked boundary is covered by `#949494`/`#929292`. @manager may want to correct the plan text.

Other judgment calls (documented in code):
- Mirror is **non-strict** (077's `events.theme_config` CHECK mode). Strict-mode preset validation stays the DB's job (`theme_presets` CHECK).
- 64 KB cap measured via `JSON.stringify` + `TextEncoder` — a few % from `octet_length(jsonb::text)` at the exact boundary; DB stays authoritative on write.
- `meta.version` requires JSON number 1 (`Number.isInteger` → `"1"`/`true`/`1.5` rejected; `1.0` ok — matches jsonb numeric equality).
- LABEL_MAX (40) **not** exported (brief doesn't require it; per Task 8 ledger note, waits for Task 13's brief). Validate enforces the DB 64 cap.
- No new dependencies; consumes Task 6 `contrastRatio`/`hexToOklch` + Task 8 `LABEL_KEYS` only.

## TDD evidence

1. `npx vitest run tests/theme/validate.test.ts` (before implementation) → **FAIL**:
   `Error: Failed to resolve import "@/lib/theme/validate" from "tests/theme/validate.test.ts". Does the file exist?` (1 failed, no tests)
2. After implementation → **PASS**: `Test Files 1 passed (1) · Tests 23 passed (23)`

## Gates

| gate | command | result |
|---|---|---|
| full tests | `npx vitest run` | **344/344 passed, 31 files** (baseline 321/30 + 23/1 new; resolve 16 intact) |
| types | `npx tsc --noEmit` | green |
| lint | `npm run lint` | 0 errors (20 pre-existing warnings, none in theme files) |

Worktree: only untracked `supabase/.branches/` (supabase-CLI runtime state, unrelated — left alone).



---

# SECTION: 2026-10-29-event-themes-p2

## .superpowers/sdd/2026-10-29-event-themes-p2

### .superpowers/sdd/2026-10-29-event-themes-p2/_task-0-report.md

# Task 0 report — Event Themes P2 (re-run, post-merge amendment)

Executed per amended instructions: Direct In-Place in `/home/hfizmzr/pelikat/pelikat-web`, no worktrees, nothing pushed, no migrations applied, nothing committed.

## Phase A — plan amendments (`docs/superpowers/plans/2026-10-29-event-themes-p2.md`)

11 edits, exactly the amended scope:

1. **Global Constraints (l.18):** `080_seed_preset_typography.sql` → `081_seed_preset_typography.sql`; tip changed `079_seed_theme_presets.sql` → `080_fix_slug_base_trailing_dash.sql`; "clean replay 001→latest" kept verbatim.
2. **Global Constraints (l.27):** baseline `401/401` → `418/418` (38 files kept).
3. **Task 0 (l.44):** obsolete "verify main still lacks P1" step → "Verify `main` contains P1 (merge commit d3295d2 ancestor: `git fetch origin; git merge-base --is-ancestor 6600128ac0c2818aaf8ed7f3755ffdb2b70635dc origin/main` → expected exit 0)."
4. **Task 0 (l.47):** `401/401` → `418/418`; `supabase db reset` clean `001→079` → `001→080`.
5. **Task 1 title (l.50):** `080_seed_preset_typography.sql` → `081_seed_preset_typography.sql`.
6. **Task 1 Files (l.52):** same rename.
7. **Task 1 Step 3 (l.58):** `replays 001→080` → `replays 001→081`.
8. **Task 1 Step 4 (l.59):** commit message `feat(theme): 080 seed…` → `feat(theme): 081 seed preset font URLs (Prata/Inter for Batik)`.
9. **Task 4 title (l.78):** `080-cloud apply` → `081-cloud apply`.
10. **Task 4 body (l.82):** `applies 080_seed_preset_typography.sql` → `081_seed_preset_typography.sql` (migration *name* `seed_preset_typography` unchanged — still applies from 081 file).
11. **Task 11 (l.142, l.143):** §12-matrix `db reset clean 001→080` → `001→081`; `Cloud apply of 080 verified` → `081`.

Left verbatim (not in the amended list), flagged for @manager:
- **l.13 Branch/execution** still says "stacked on `feat/event-themes-p1` tip `becd500` (P1 is NOT yet merged to main …)". Now factual ly superseded by the ledger Ruling (P2 sits on origin/main d3295d2). One-line follow-up edit for @manager's next amendment if desired.
- **l.143 Task 11 gate** still reads "vitest all-green (401+new)" — stale baseline token ("401/401" replacement was scoped to Task 0 + Global Constraints only). Should read 418+new.

## Phase B — branch setup (evidence)

- `git fetch origin`: `b0a20fd..d3295d2 main -> origin/main`.
- `git merge-base --is-ancestor 6600128ac0c2818aaf8ed7f3755ffdb2b70635dc origin/main` → **exit=0** (P1 fix waves in main).
- Prior state: checkout was `feat/event-themes-p1` @6600128; `feat/event-themes-p2` existed @becd500 with ZERO own commits (confirmed: becd500 = P1 phase-gate commit, already ancestor of origin/main, exit=0).
- `git checkout feat/event-themes-p2` → `git reset --hard origin/main` →
  - HEAD = `d3295d256cd29d1a407bf8ab742adec93099a75a` (= origin/main tip d3295d2) ✓
  - `git merge-base --is-ancestor becd500 HEAD` → exit=0 ✓
  - `git merge-base --is-ancestor 6600128… HEAD` → exit=0 ✓
  - `git status`: clean tree on `feat/event-themes-p2`.
- Migration tip (`ls supabase/migrations | tail -3`):
  ```
  078_theme_rpc.sql
  079_seed_theme_presets.sql
  080_fix_slug_base_trailing_dash.sql
  ```
  Highest = `080_fix_slug_base_trailing_dash.sql` ✓ (next free number = 081).

## Phase C — baseline gates (raw tails)

1. `pnpm exec tsc --noEmit` → exit=0 (no output).
2. `pnpm exec vitest run` (tail):
   ```
   Test Files  38 passed (38)
        Tests  418 passed (418)
     Duration  4.41s
   ```
   exit=0 ✓ 418/418, 38 files.
3. `pnpm run lint` (tail):
   ```
   ✖ 20 problems (0 errors, 20 warnings)
   ```
   exit=0 ✓ 0 errors, 20 pre-existing warnings (last: `tests/usability/payments-checkout.test.tsx 84:17 warning '_name' is defined but never used`).
4. `supabase db reset` (tail):
   ```
   Applying migration 076_theme_presets.sql…
   Applying migration 077_events_theme_slug.sql…
   Applying migration 078_theme_rpc.sql…
   Applying migration 079_seed_theme_presets.sql…
   Applying migration 080_fix_slug_base_trailing_dash.sql…
   Seeding data from supabase/seed.sql…
   Restarting containers…
   Finished supabase db reset on branch feat/event-themes-p2.
   ```
   exit=0 ✓ clean replay 001→080 + seed.

## Phase D — SDD ledger

`/home/hfizmzr/pelikat/.superpowers/sdd/2026-10-29-event-themes-p2/` created (prior cancelled run had left nothing; rewritten cleanly). `progress.md` first line exactly:
`# SDD ledger — plan: docs/superpowers/plans/2026-10-29-event-themes-p2.md`
followed by the two amended Ruling/Task-0 lines verbatim from the dispatch.

## Commits

**None** — Task 0 has no commits by design. `git status` clean.


### .superpowers/sdd/2026-10-29-event-themes-p2/pr32-fixwave-report.md

# PR #32 CodeRabbit Fix Wave — Evidence Report

Branch `feat/event-themes-p2`, base HEAD `add48ad` → fix commit **`f92a5ce`**
(single commit, 4 files). NOT pushed (reviewer pushes). No new deps, no cloud calls.

## Thread → fix mapping

| Thread | Location | Verdict | Fix |
|---|---|---|---|
| PRRT_kwDOSFI0as6xa2iK | src/app/organizer/events/[id]/page.tsx:116 + theme-editor gallery | **FIXED** | Gallery query now `.or(is_active.eq.true, id.eq.<saved-preset-uuid>)` — the CURRENT event's referenced preset is fetched even when deactivated (guarded by local `UUID_RE` so a malformed stored id degrades to the active-only filter; save-side is_active rejection untouched). Editor gallery: the deactivated-but-SAVED preset renders as a distinctly marked disabled card (`grayscale` + `(deactivated)` marker + `disabled`), keyed off `savedPresetId` so it survives a draft switch to Custom; other inactive presets stay hidden. |
| PRRT_kwDOSFI0as6xa2iW | src/app/sw.ts:40 | **FIXED** | Theme rule ONLY: `CacheableResponsePlugin({ statuses: [0, 200] })` with a comment explaining opaque handling (bucket without CORS → opaque status-0 response, not an error; binary asset read-only caching is safe). Matcher scope exact & unchanged; `defaultCache` untouched. |
| PRRT_kwDOSFI0as6xa2if | src/components/theme/theme-editor.tsx (Save) | **FIXED** | Reused existing `uploading` state (`ThemeAssetKind \| null`, set around `handleUpload` try/finally) as the in-flight tracker: `handleSave` guard + Save button `disabled` include `uploading`; hint text "Upload in progress…" renders in the save bar. Symmetric reciprocal gate (raised by local `cr` run): `handleUpload` also guards `saving` and both Asset/Font rows pass `canEdit={canEdit && !saving}` — prevents the same data-loss class where an upload finishing mid-save is deleted by post-save cleanup. |
| PRRT_kwDOSFI0as6xa2il | src/components/theme/theme-editor.tsx | **FIXED** | New exported pure helper `fontDefaultLabel(presetValue)`: `'Preset default'` when the selected preset defines the slot, `'Platform default'` otherwise. Display-only; `onValueChange` behavior unchanged. `FontRow` gets `presetValue={selectedPreset?.tokens?.typography?.[slot.urlKey]}`. |
| PRRT_kwDOSFI0as6xa2in | src/lib/theme/assets.ts:204 | **SKIPPED (justified)** | Signature-sniffing is not a security boundary: the bucket enforces the MIME allowlist server-side at S3 accession + RLS; a mislabeled upload renders the safe gradient fallback via `ThemedImage` error recovery. (@manager triage ruling — reply to be posted in the thread by reviewer/manager.) |

## Tests added (tests/theme/theme-editor.test.tsx, 10 → 16 tests)

1. `the deactivated-but-REFERENCED preset stays visible as a disabled card` (SSR: name, `(deactivated)`, `grayscale`, `disabled=""`)
2. `still hides a deactivated preset the event does NOT reference` (Task 8 invariant regression-guard)
3. `the saved inactive preset card survives a draft switch to Custom` (interactive: card persists after Custom click, still `disabled`)
4. `Save is disabled while an upload is in flight` (interactive: `saveBefore.disabled === false` isolation, never-settling `uploadThemeAsset` stub → Save disabled + "Upload in progress…" hint renders)
5. `reciprocal gate: upload controls are disabled while a save is in flight` (never-settling `saveEventTheme` → all 6 file inputs disabled)
6. `font default option reads 'Preset default' when the preset defines the slot` (pure-helper unit test — Radix dropdown items are client-only, SSR-invisible)

## Verification gates (exact)

- `pnpm exec tsc --noEmit` → **0** (ran 3× after each mutation)
- `pnpm exec vitest run` → **524 passed / 524, 42 files** (baseline 518 + 6 new = 524) — all green
- `pnpm exec eslint src tests` → **0 errors**, 20 warnings (all pre-existing; my 4 files clean on direct run)
- `cr --prompt-only --type uncommitted` → **3 runs completed** (no rate-limit hit; completed well within the ~17 min window):
  - Run 1: 2 findings — (a) reciprocal save/upload direction gate: **VALID, fixed**; (b) opaque-404 + CacheFirst: **justified skip** (versioned `-v{ts}` URLs mean a given URL's object is either present or permanently deleted — no transient self-heal case exists, and the original thread's bug was assets never cached at all).
  - Run 2: 1 minor — saved-referenced card hidden after draft switch: **VALID, fixed** (exception key moved from `selectedPresetId` to `savedPresetId`).
  - Run 3: 4 "major" findings — all **stale-revision false positives**: each cites the reviewed revision `add48ad` and describes code as if only the test hunks landed; all four claims are verifiably false against the working tree (export exists, both gates in place, gallery exception keyed on savedPresetId). No code change warranted.

## Files changed

- `src/app/organizer/events/[id]/page.tsx` — gallery query uuid-guarded `.or` (FIX 1)
- `src/app/sw.ts` — theme-rule `statuses: [0, 200]` + comment (FIX 2)
- `src/components/theme/theme-editor.tsx` — gallery exception card, save/upload two-way gate + hint, `fontDefaultLabel` (FIX 1/3/4)
- `tests/theme/theme-editor.test.tsx` — 6 new tests

## Concerns for @manager

1. PRRT_kwDOSFI0as6xa2in reply justification is captured above; the thread reply itself is owned by the reviewer/manager step.
2. Run-3 `cr` false positives (4× "major") are stale-revision artifacts — screenshot evidence only; do not loop on them.
3. The deactivated referenced card is visible-but-NOT reselectable (Task 8 fail-closed ruling kept); the later `cr` run suggests making it selectable to reinstall the selection — that would contradict the standing Task 8 ruling, so left as-is.
4. The save-side `is_active` rejection in `saveEventTheme` is untouched, per dispatch.
5. Commit `f92a5ce` is local-only on `feat/event-themes-p2` — awaiting reviewer push.


### .superpowers/sdd/2026-10-29-event-themes-p2/progress.md

# SDD ledger — plan: docs/superpowers/plans/2026-10-29-event-themes-p2.md
- Ruling: P2 re-based onto merged main (P1 merged via PR #31 at d3295d2 after coderabbit autopilot, commits 5434251 + 6600128); stacked-branch plan text superseded — cost if wrong: none, documented
- Task 0: implementer DONE (plan amended: migration renumber 080→081 + baselines 418/418; branch feat/event-themes-p2 = origin/main d3295d2; baseline gates tsc 0 / vitest 418/418 / lint 0 err / db reset clean 001→080)
- Task 1: IN PROGRESS (081_seed_preset_typography)
- Task 1: implementer DONE (commits d3295d2..b2f1349)
- Task 2: implementer DONE (commits b2f1349..520713a)
- Task 3: IN PROGRESS (font URL enforcement save+resolve)
- Task 3: implementer DONE (commits 520713a..cc07b9c)
- Task 5: IN PROGRESS (fg-companion secondary/accent)
- Task 5: implementer DONE (commits cc07b9c..b3b3648)
- Task 3: complete (commits 520713a..cc07b9c, review approved; minor: drop-to-null wording vs plan undefined — equivalent)
- Task 4: complete (cloud apply seed_preset_typography v20261029012322; file md5 3f19f83f…; history 82→83; Batik Prata/Inter 12/12 woff2)
- Task 6: IN PROGRESS (ThemedImage)
- Task 6: implementer DONE (commits b3b3648..603aeb1)
- Task 7: IN PROGRESS (serwist + uploader engine)
- Task 7: implementer DONE (commits 603aeb1..1a6d9e7)
- Task 6: complete (commits b3b3648..603aeb1, cr 0 findings, unreviewed-separately-by-dispatch—covered by Task 7 integration review surface)
- Task 7: complete (commits 603aeb1..1a6d9e7, review approved; 0 functional defects — minors: plan Task 7 line "woff2 upload ≤300 KB" is stale vs the pinned FONT_LIMIT 3145728 (3 MiB); FAMILY_FONT_URLS duplicates migration 081 by design, drift documented + test-pinned)
- Task 8: IN PROGRESS (is_active filtering)
- Task 8: implementer DONE (commits 1a6d9e7..1a6c2d2)
- Task 9: IN PROGRESS (body font face)
- Task 9: implementer DONE (commits 1a6c2d2..eed4b56)
- Task 10: IN PROGRESS (banner/logo rendering)
- Task 10: implementer DONE (commits eed4b56..1297f70)
- Task 8: complete (commits 1a6d9e7..1a6c2d2, review approved)
- Task 9: complete (commits 1a6c2d2..eed4b56, review approved)
- Task 10: complete (commits eed4b56..1297f70, review approved; minor: tests/theme/css.test.ts full-ResolvedTheme literals now miss the required `assets` field — outside the tsc include gate (tsconfig covers src/** only), runtime-safe since buildStyleVars ignores assets)
- Task 11: IN PROGRESS (phase gate riders)
- Task 11: rider (asset value shape fix; commit 1170d7f). Designer smoke found the editor drafting the upload's absolute publicUrl → assetValueOk rejected it on any http dev origin → Save hard-disabled (mixed-content https-only contract). Fix per ruling option a: editor drafts `result.path` (the 076-legal bucket-relative `organizers/{org}/events/{evt}/{kind}-v{ts}.{ext}` — verified against DB 076 CHECK which requires only charset+no-`..`, no prefix; no rule changes to assetValueOk), new `storageAssetUrl()` in lib/theme/assets.ts expands at consume (https passthrough / env-origin+basepath expansion / junk → null) wired into editor thumbnails, EventThemeScope banner/logo, mini-theme-preview; font slots keep publicUrl (§5.4 https allowlist can never accept a bucket path). Gates: tsc 0; vitest 518/518 (42 files; baseline 506 + 11 new); lint 0 errors (20 pre-existing warnings, baseline-identical); cr --prompt-only uncommitted run 1 → 1 minor (supabase base-path prefix dropped by .origin) → fixed (origin+pathname base) → run 2 0 findings. NOT touched: sw/serwist matcher (documented smoke-only local gap, ticket-level), assetValueOk rules. Report: task-11b-asset-path-fix-report.md
- Task 11: smoke re-verified PASS (B/C/D + CR-1 + CR-3; CR-2 FAIL) — containers restored. CR-2 cleanup did NOT fire: 4 stale objects remain (banner-v1793246032459, logo-v1793246196524, banner-v1793246246396, banner-v1793247083114) beside the 2 referenced ones. Code paths verified intact (saveEventTheme tail → cleanupThemeAssets, `{kind}-v` prefix match, refs from fresh DB read; impersonated smoke-user JWT list/DELETE policies pass, folder tenancy + organizer_id match). Suspect the final save that wrote theme_config (after the 04:14:13Z banner upload) never executed the cleanup tail — direct/service-role write during smoke, or removal rejected at Storage-API level with warnings unnoticed. CodeRabbit smoke: awaiting @manager ruling; NOT marked complete (final review pending)
- Task 11: CR-2 diagnosis bench — root cause found in cleanupThemeAssets: Storage remove() resolves prefixes from the BUCKET ROOT but the code passed the bare listed name (`remove([name])`) → bulk DELETE matched 0 rows and returned `{data:[], error:null}` (silent no-op; proven via raw REST `200 []`). Re-prefixing with the tenant folder (`${folder}/${name}`) deletes for real (verbatim removals + survivors = exactly the 2 referenced objects). Wiring (actions.ts tail) and `{kind}-v`/refs parsing are CORRECT — no per-call parse bug, no bypass. Fix implemented in src/lib/theme/assets.ts (hoisted `folder`, prefixed remove path) + updated 2 assertions in tests/theme/assets.test.ts that had baked in the wrong paths; bench PRs deleted final 5 stale orphans; LOCAL-only, no commits, throwaway artifacts in /tmp/opencode. (diag bench file deleted; doit artifact: full run output above.)
- Task 11: rider (remove-path bug fixed; commit add48ad; bench-verified live, 5/6 pre-existing orphans deleted)
- Task 11: complete (phase gate: riders ba3e9f9 + asset-path fix 1170d7f + cleanup fix add48ad; gates tsc 0/vitest 518/518(42)/lint 0 new; smoke B/C/D + CR-1/CR-3 PASS, CR-2 root-caused (storage-js bucket-root remove paths) + bench-verified; final whole-branch review MERGE READY (d3295d2..add48ad))
- Ruling: bench-proven cleanup fix suffices for phase gate — no second in-app env-surgery cycle; deploy-time smoke exercises cleanup on real env.
- PR32 fix wave: (sha f92a5ce) 4 fixed + 1 justified skip (file-type sniff = non-boundary; bucket mime allowlist + graceful fallback)
- PR32: merged (fix wave f92a5ce; 5/5 CodeRabbit threads resolved w/ bot confirmation; merge sha 2227c2c; gate: 0 unresolved + completed review on head)
- Plan complete.


### .superpowers/sdd/2026-10-29-event-themes-p2/task-1-report.md

# Task 1 report — 081_seed_preset_typography.sql (Event Themes P2)

Status: **DONE** · Commit: `b2f1349a8e13eac7a62243deb1a15fa24d44c3f7` (range `d3295d2..b2f1349`, single commit, only the migration file)
Branch: `feat/event-themes-p2` · Local docker validation rig only (cloud DB untouched, nothing pushed).

## STEP 0 bookkeeping + plan-doc repairs

- Ledger appended: `- Task 1: IN PROGRESS (081_seed_preset_typography)` → later `- Task 1: implementer DONE (commits d3295d2..b2f1349)`.
- Plan-doc repairs applied per controller approval:
  1. Line ~13 Branch/execution → `**Branch/execution:** Direct In-Place on \`feat/event-themes-p2\`, reset to merged \`main\` at \`d3295d2\` (P1 merged via PR #31 after the CodeRabbit autopilot; P1 fix waves = commits 5434251 + 6600128).`
  2. Line ~143 `(401+new)` → `(418+new)`.

## URL resolution (Step 1)

`curl -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" "https://fonts.googleapis.com/css2?family=Prata&family=Inter&family=Cinzel&family=Source+Sans+3&family=Bebas+Neue&family=Orbitron&family=Poppins&family=Roboto&family=Barlow&display=swap"` — returned CSS with per-face blocks; latin-subset, weight-400 `fonts.gstatic.com` .woff2 URL extracted per family. Every URL verified HTTP 200 with non-zero woff2 body before pinning:

| Family | Latin .woff2 (400) |
|---|---|
| Prata | `https://fonts.gstatic.com/s/prata/v22/6xKhdSpbNNCT-sWPCm4.woff2` |
| Inter | `https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiA.woff2` |
| Cinzel | `https://fonts.gstatic.com/s/cinzel/v26/8vIU7ww63mVu7gtR-kwKxNvkNOjw-tbnfY3lDQ.woff2` |
| Source Sans 3 | `https://fonts.gstatic.com/s/sourcesans3/v20/nwpBtKy2OAdR1K-IwhWudF-R9QMylBJAV3Bo8Ky462EK9Cs.woff2` |
| Bebas Neue | `https://fonts.gstatic.com/s/bebasneue/v16/JTUSjIg69CK48gW7PXoo9Wlhyw.woff2` |
| Orbitron | `https://fonts.gstatic.com/s/orbitron/v35/yMJMMIlzdpvBhQQL_SC3X9yhF25-T1nyGy6BoWgz.woff2` |
| Poppins | `https://fonts.gstatic.com/s/poppins/v24/pxiEyp8kv8JHgFVrJJfecg.woff2` |
| Roboto | `https://fonts.gstatic.com/s/roboto/v51/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWubEbVmUiAo.woff2` |
| Barlow | `https://fonts.gstatic.com/s/barlow/v13/7cHpv4kjgoGqM7E_DMs5.woff2` |

## Migration (Step 2)

`supabase/migrations/081_seed_preset_typography.sql` — up: 6 per-preset `DO $$ … $$` blocks; each reads the row by fixed uuid, builds
`tokens || jsonb_build_object('typography', jsonb_build_object('heading_font_url', <url>, 'body_font_url', <url>))`, aborts on missing row or `not validate_theme_tokens(v_candidate, true)` (**positional** — p_strict reserved-word ruling), then `UPDATE theme_presets SET tokens = v_candidate WHERE id = <uuid>`; `jsonb ||` merge ⇒ idempotent re-runs. Down: 6 commented per-uuid `SET tokens = tokens - 'typography'` statements.

Preset map (uuids verbatim from 079):

| Slug | uuid | heading / body |
|---|---|---|
| wizard-academy | `e2c9ba7d-4751-4101-a2e8-b27c86c61a1b` | Cinzel / Source Sans 3 |
| hidden-village | `04b5923b-d10d-49fe-ad74-7c5705f92179` | Bebas Neue / Roboto |
| galaxy-runner | `bd39de2a-0ff0-455e-bb27-047bca7b8194` | Orbitron / Roboto |
| sunset-marathon | `e4fb2e41-ad2c-4e1f-a8a9-cf334acd72ca` | Poppins / Roboto |
| pelikat-classic | `b7d4dfdd-0c4d-4427-b561-b989f370008d` | Barlow / Barlow |
| batik-heritage | `03c7d417-d02a-4104-9299-2f03be5c4d66` | **Prata / Inter** |

## Validation (Step 3)

### Clean replay

```
supabase db reset: Applying migration 078…079…080…081_seed_preset_typography.sql…
Seeding data from supabase/seed.sql… Finished supabase db reset on branch feat/event-themes-p2.
```

### psql matrix after full replay (slug | strict | has_typography | heading_url | body_url)

```
batik-heritage  |t|t| https://fonts.gstatic.com/s/prata/v22/6xKhdSpbNNCT-sWPCm4.woff2 | https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiA.woff2
galaxy-runner   |t|t| https://fonts.gstatic.com/s/orbitron/v35/yMJMMIlzdpvBhQQL_SC3X9yhF25-T1nyGy6BoWgz.woff2 | https://fonts.gstatic.com/s/roboto/v51/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWubEbVmUiAo.woff2
hidden-village  |t|t| https://fonts.gstatic.com/s/bebasneue/v16/JTUSjIg69CK48gW7PXoo9Wlhyw.woff2 | https://fonts.gstatic.com/s/roboto/v51/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWubEbVmUiAo.woff2
pelikat-classic |t|t| https://fonts.gstatic.com/s/barlow/v13/7cHpv4kjgoGqM7E_DMs5.woff2 | https://fonts.gstatic.com/s/barlow/v13/7cHpv4kjgoGqM7E_DMs5.woff2
sunset-marathon |t|t| https://fonts.gstatic.com/s/poppins/v24/pxiEyp8kv8JHgFVrJJfecg.woff2 | https://fonts.gstatic.com/s/roboto/v51/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWubEbVmUiAo.woff2
wizard-academy  |t|t| https://fonts.gstatic.com/s/cinzel/v26/8vIU7ww63mVu7gtR-kwKxNvkNOjw-tbnfY3lDQ.woff2 | https://fonts.gstatic.com/s/sourcesans3/v20/nwpBtKy2OAdR1K-IwhWudF-R9QMylBJAV3Bo8Ky462EK9Cs.woff2
```

- **6/6 strict-valid WITH typography** ✓
- Batik = Prata / Inter ✓
- URL shape: all 12 slots (9 distinct URLs) `like 'https://fonts.gstatic.com/%.woff2'` → 12× OK ✓

### Idempotent re-run

Re-applied the migration file verbatim through psql (`ON_ERROR_STOP=1`, 6× `DO`) → `6/6 re-run strict-valid WITH typography`, Batik unchanged.

### Down → re-up cycle

Down statements uncommented from the migration's down section, applied via psql → `UPDATE 1` ×6 → **0/6** rows carrying `typography`. Re-applied the up file → 6× `DO` → **6/6 re-up strict-valid WITH typography**, Batik back to `6xKhdSpbNNCT-sWPCm4.woff2` / `UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiA.woff2`. ✓

## Gates (tails)

- `pnpm exec tsc --noEmit` → exit 0 (no output)
- `pnpm exec vitest run` → `Test Files 38 passed (38) / Tests 418 passed (418)`
- `pnpm run lint` → exit 0, `20 problems (0 errors, 20 warnings)` (pre-existing warnings only; SQL-only change, no TS touched)

## Commit

```
b2f1349 feat(theme): 081 seed preset font URLs (Prata/Inter for Batik)
 1 file changed, 206 insertions(+)
 supabase/migrations/081_seed_preset_typography.sql
```

Working tree clean after commit; branch = `feat/event-themes-p2` at `b2f1349`, parent `d3295d2`.

## Concerns

- None blocking. Note (cosmetic): two earlier down-extraction attempts failed only in my validation shell script (uncommented sed / no exec) — the migration file itself was never changed; the final cycle in this report is the authoritative one.
- Google Fonts v-versions of gstatic URLs are content-CDN versions — stable for GitHub.com consumption; resolve-time allowlist (Task 2/3) accepts any gstatic host, so a future version bump would only affect preset rendering, not validation.


### .superpowers/sdd/2026-10-29-event-themes-p2/task-10-report.md

# Task 10 report — banner/logo rendering on runner page + upgraded preview

Branch `feat/event-themes-p2`, commit range `eed4b56..1297f70` (tip `1297f70`,
message exactly `feat(theme): banner/logo rendering on runner page + asset preview`).
Direct In-Place, no new deps, no migrations, no SQL.

## Files

- `src/lib/theme/types.ts` — `ResolvedTheme` gains a REQUIRED `assets` slot:
  `{ banner: string | null; logo: string | null }` (post-merge asset URLs;
  null → no themed asset). Badge/certificate keys intentionally NOT resolved —
  no renderer consumes them in P2 (noted in the type comment; YAGNI).
- `src/lib/theme/utils.ts` — `assetValueOk` moved here from `validate.ts`
  (ONE implementation, same pattern as `themeFontUrlOk`): https URL or clean
  bucket path ([A-Za-z0-9/_.-]+, no `..`, off-charset `:` kills javascript:/http:).
- `src/lib/theme/validate.ts` — now imports `assetValueOk` from `utils.ts`;
  local copies (regex + function) deleted. No behavior change.
- `src/lib/theme/resolve.ts` — `deriveTheme` resolves the two slots via a new
  `asset()` slot-resolver mirroring the font-slot degrade contract: absent →
  silently null; hostile/non-string value → null + structured warning
  `assets.<key>: not a valid asset value — using no themed asset` (no throw,
  no `markOverridden` on the warning path — degraded keys don't count as
  overrides, same as fonts). `platformTheme` returns `assets: { banner: null,
  logo: null }`. Bucket-path values may pass the write-rule — they render as a
  relative img src that fails the onError fallback (post-P2 ticket 1 closes the
  host allowlist).
- `src/components/theme/event-theme-scope.tsx` — new OPTIONAL prop
  `showAssets?: boolean` (default false). When false → `{ banner: null, logo: null }`
  → the ternary chain evaluates to null → React renders NOTHING new.
  When true AND a resolved value exists:
  - banner (non-null): leading `<div class="relative">` above children with
    `<ThemedImage src alt="Event banner" aspect={THEME_ASPECTS.banner} />`;
    if logo also exists it overlaps top-right in a 64px (`w-16` + aspect-1/1)
    box — the "near the page heading" slot, overlaid on the banner it belongs to.
  - banner null but logo set: small `w-16` ThemedImage slot directly under the
    scope start (the ER's documented fallback placement).
  - No-asset / leaderboard renders: asset expression = null → byte-identical
    to the P1 output (nulls emit nothing in JSX children).
  - Unthemed events: the `hasTheme` early return happens BEFORE the prop is
    consulted — `showAssets` can never wrap an unthemed event (test pinned).
- `src/app/runner/events/[id]/page.tsx` — one-line: `<EventThemeScope
  event={event} showAssets>`.
- `src/app/runner/leaderboard/page.tsx` — NOT touched (passes nothing) →
  default false, zero asset rendering.
- `src/components/theme/mini-theme-preview.tsx` — the event-card mock gains the
  same banner + logo-overlay reserved-box engine fed from `resolved.assets`
  (`?? undefined` → null-safe src). Seed presets carry no assets in P2 → the
  gradient fallback layer renders (the exercised engine; real-banner rendering
  is Task 11's live smoke). Broken/dead srcs stay graceful via the ThemedImage
  onError fallback.

## Tests

+13 new tests (0 deleted, no assertion weakened; baseline 493 → 506 exactly delta 13):

- `tests/theme/derive-theme.test.ts` — NEW "assets slot" describe (5): no
  assets → nulls; https values → both slots resolved + `overriddenKeys`
  tracked; preset-assets + override-null drop → merge semantics; hostile/junk
  values (`javascript:`/`http:`/traversal/number) degrade to null + warning
  without throw and WITHOUT counting as overrides; assets-section fuzz never
  throws.
- `tests/theme/event-theme-scope.test.tsx` — NEW "showAssets" describe (6):
  unthemed + showAssets → `'<p>child</p>'` exact (no query); DEFAULT (no prop)
  + theme CARRYING assets → no `<img`, no `aspect-ratio` (leaderboard/P1
  contract); showAssets with NO resolved values → SSR string `toBe` the
  default render (byte-for-byte); showAssets + banner+logo → `aspect-ratio:3/1`
  + both real img srcs + `w-16` overlay + banner before children; banner-only /
  logo-only → each slot independently; hostile IT value → `toBe` the baseline
  render (degrade preserved byte-for-byte). `render()` helper extended with the
  optional showAssets arg (all pre-existing vectors unaffected).
- `tests/theme/theme-editor.test.tsx` — NEW (2): MiniThemePreview with no
  assets → reserved boxes present (`aspect-ratio:3/1` + `aspect-ratio:1/1`),
  NO `<img`, gradient fallback layer rendered; with override draft assets →
  real img srcs flow from deriveTheme through the preview (same engine, the
  exercised fallback-vs-real contract on both sides).

## Gates

- `npx tsc --noEmit` → 0 output (clean, run twice — pre-commit verified).
- `npx vitest run` → **Test Files 42 passed (42); Tests 506 passed (506)**.
- `npm run lint` → **0 errors, 20 warnings** and the output is
  `diff`-byte-identical to the `git stash` baseline run
  (`/tmp/opencode/lint-baseline.txt`) — zero new findings.
- `cr --prompt-only --type uncommitted` → completed with **1 minor finding**
  (see Concerns #1); all 10 touched files reviewed; not rate-limited.

## Ledger

Appended to `.superpowers/sdd/2026-10-29-event-themes-p2/progress.md`:
`- Task 10: IN PROGRESS (banner/logo rendering)` and
`- Task 10: implementer DONE (commits eed4b56..1297f70)`.

## Concerns (≤5)

1. **cr minor — banner placement vs the existing hero placeholder.** The runner
   detail page keeps its P1 `h-48` hero block (gradient + status headline); with
   a themed banner the scope renders the banner ABOVE it, so the two banners
   stack. The plan pins "banner as a leading section above children" and the
   scope wrapper owns resolution — reaching into the child subtree to swap the
   hero is a page-level redesign that belongs with @designer (Task 11 live
   smoke ② verifies the actual look against the dev tunnel). Not fixed here —
   deliberate trade-off, reversible one-header-move once @designer rules.
2. The overlapping logo in the logo-only case (no banner) renders as a 64px box
   directly under the scope start (ER-approved fallback placement). If the
   logo-only look matters, Task 11's smoke cover it.
3. Bucket-path asset values (076 write-rule-legal, but not full URLs) resolve
   through and render as a relative img src that will 404 → onError gradient
   fallback. Post-P2 ticket 1 (asset host allowlist) is the proper close; the
   degradation is safe and exercised (ThemedImage fallback path).
4. The runner page change is covered indirectly (scope SSR vectors embed the
   exact `showAssets` contract the page relies on); a route-level page test
   would need heavy Supabase route mocking — skipped per "tests as needed".
5. `types.ts` `ResolvedTheme` gained a required `assets` field — any external
   hand-constructed ResolvedTheme (outside `.event-theme` consumers; grep shows
   none beyond resolve + editor + preview) would be a tsc error, making this a
   compile-time-visible contract change rather than a silent one.


### .superpowers/sdd/2026-10-29-event-themes-p2/task-11a-report.md

# Task 11a rider report — phase-gate fixes + §12.6 verification matrix

Branch `feat/event-themes-p2`, base tip `1297f70` (Task 10). Direct In-Place,
single rider commit. Scope per dispatch: Task 10 review-finding fix
(stale `ResolvedTheme` literals), scratch-tsc audit over `tests/**`, gates,
§12.6 matrix recording (items delegated to @manager/@designer excluded).

## 1. Stale test literals — fixes (2 sites + 2 follow-through)

Task 10 review finding: `tests/theme/css.test.ts` base literal
`const resolved: ResolvedTheme = {...}` predated the required `assets` slot.
Invisible to gates because the repo tsconfig `include` covers `src/**` only.

- `tests/theme/css.test.ts` — base literal gains
  `assets: { banner: null, logo: null }` (the 4 spread literals inherit it).
- `tests/theme/resolve.test.ts` — `{ colors: { primary: null } }` passed to
  `mergeThemeConfig`/`deriveTheme` is type-invalid (null-drop test path);
  cast added matching the file's existing idiom
  (`{ vocabulary: null } as unknown as ThemeTokens`, same line 78).
- `tests/theme/derive-theme.test.ts` — same pattern for
  `{ assets: { logo_url: null } }` → `as unknown as ThemeTokens`.
- `tests/theme/assets.test.ts` — `vi.fn(async () => …)` upload mock had an
  argument-less signature, making `mock.calls.map(c => c[0])` indexing a
  zero-tuple (TS2493). Typed `async (path: string)` with `void path`
  (repo eslint rule flags `_`-prefixed params; `void path` consumes cleanly).
- `tests/theme/themed-image.test.tsx` — 3× `toHaveAttribute` assertions
  (matcher typing missing repo-wide: setup.ts does runtime-only
  `expect.extend(matchers)` with no type augmentation). Rewritten to
  `img?.getAttribute(...)` reads — runtime-identical, matches the file's
  other assertion style, type-clean.

## 2. Scratch-tsc audit (throwaway tsconfig — NOT committed)

Config: `/tmp/opencode/tsconfig-scratch.json` (extends the repo tsconfig,
`include` = repo src + `tests/**/*.ts(x)` + `.next` types, non-incremental;
node_modules symlinked into /tmp/opencode for `types` resolution). Repo
tsconfig untouched.

Result: **theme tests clean — 0 errors in `tests/theme/**`** after the five
fixes above. All remaining errors (75 output lines) are in non-theme test
files (`usability/payments-checkout` 29, `security/admin-users` 21,
`security/ic-encrypt-route` 11, `security/admin-settings-pricing` 6,
`reliability/subscription-pricing` 4, `security/nric-validation` 3,
`security/role-claim` 1) — pre-existing repo-wide raw-mock SupabaseClient
objects and runtime-extended jest-dom matchers. Out of rider scope; repo
tsconfig deliberately excludes tests. Follow-up ticket candidate, not part
of P2.

## 3. Gates

- `tsc --noEmit` (repo tsconfig): **0 errors**.
- `vitest run` (full): **506/506 passed, 42 files** — exact baseline
  (506/506/42) preserved; 15 theme files = 239 tests after fixes.
- `eslint .`: **0 errors, 21 warnings** — baseline was 20 warnings all
  pre-existing in non-theme files; 0 added by this rider
  (`eslint tests/theme/` = 0 problems; verified by stash comparison).
- `cr --committed --base-commit 1297f70`: **review_completed, findings 0**
  over the exactly-5 rider test files (after one rate-limit retry; see §5).
- `supabase db reset`: clean — all migrations applied through
  `081_seed_preset_typography.sql` + `seed.sql`; after reset
  `public.theme_presets` = 6 rows, every `is_active = true`, all six carry
  081 typography (heading_font_url seeded, e.g. Batik Prata gstatic URL).
- `cr --prompt-only --type uncommitted`: see §5.

## 4. §12.6 verification matrix — recorded

| # | Matrix item | Method | Result |
|---|---|---|---|
| 1 | db reset clean 001→081 | `supabase db reset` ×2 (idempotent) | PASS: 83 migration lines applied (81 numbered + seed chain), finished clean; 081 typography seeded into 6 presets (PSQL verified) |
| 2 | font-404 → Geist | css.test.ts buildFontFace vectors + live probe | PASS (CSS-level degradation): resolve eligibility keeps any valid-shaped URL — it cannot know a path is dead beforehand; live probe confirms valid-shaped-but-dead gstatic path → HTTP 404 while the seeded presets' real URLs → HTTP 200. Degradation path: browser 404 inside `@font-face` = face never instantiated → `font-display: swap` + family stacks (`var(--font-geist)` in vars, `var(--font-sans)` in event-theme.css) render the fallback — no broken glyph, no JS involvement, self-healing |
| 3 | asset-404 → ThemedImage fallback | `tests/theme/themed-image.test.tsx` onError test (dead URL fixture) | PASS (in 506): error swaps img → gradient fallback div, alt stays accessible |
| 4 | upload happy path | `tests/theme/assets.test.ts` | PASS (in 506): valid path → upload + publicUrl (`-v{ts}` cache-bust) |
| 5 | upload blocked paths | `tests/theme/assets.test.ts` | PASS (in 506): oversized/invalid type/failed upload → structured error + warn, never throws |
| 6 | 409 → remove + retry | `tests/theme/assets.test.ts` "conflict error removes the same path once and re-uploads once (warn logged)" | PASS (in 506): exactly 2 upload calls `[path, path]`, `remove([path])`, warn surfaced |
| 7 | is_active filtering | gallery: `theme-editor.test.tsx` "gallery excludes an inactive preset; actives remain"; save block: `save-event-theme.test.ts` "inactive preset → rejected with structured error, never writes" + "already-referenced inactive preset → still saves (selection-only gating)" | PASS (in 506): selection-only gating semantics (deactivation hides from gallery + blocks (re)selection; already-themed events keep rendering) |
| 8 | Batik gold companion render (Ruling #10) | `tests/theme/resolve.test.ts` "Batik gold #D4A017 accent RENDERS: fill kept, dark-text companion ≥4.5:1, no warning" + scope SSR suite (16 inline `--et-*` vars asserted verbatim); DB post-reset: Batik Heritage preset present with `#D4A017` | PASS (in 506) |
| 9 | Serwist matcher + cache policy | `tests/theme/serwist.test.ts`: exact escaped storage origin + event-themes prefix; never matches certificates bucket / other hosts / http / unset (`""` disables rule); policy pinned (60 entries, 604800 s) + live `sw.ts` wired via `runtimeCaching` | PASS (in 506) |
| 10 | precache integrity | Inspection of `src/app/sw.ts`: `precacheEntries: self.__SW_MANIFEST` (Serwist auto-manifest) only — no manual event-theme.css entry, so app-scope precache (build-hashed statics incl. event-theme.css) semantics untouched | PASS |

Not ran here (dispatch-excluded): live browser smoke and cloud-apply-verify —
@manager/@designer lanes per plan Task 11 (matrix items ①–⑤ smoke and
"Cloud apply of 081 verified" cite the Task 4 evidence).

## 5. `cr --prompt-only` status

- First attempt (uncommitted): CodeRabbit CLI rate-limit
  (`Rate limit exceeded`, recoverable, waitTime 15 min).
- Before any review could run again, the rider changes were committed as
  `ba3e9f9 fix(theme): phase-gate riders (stale test literals + matrix)`
  (11:07:47, action not initiated by this subagent — content verified
  byte-identical to this rider's intended diff; author flag normal).
  Consequence: subsequent `--type uncommitted` runs report
  `review_skipped — no uncommitted changes detected` (correct behavior, gate
  target moved to the COMMIT).
- Final gate probe: `cr review --committed --prompt-only --base-commit
  1297f70` — targeted at exactly this commit's diff. First attempt
  rate-limited (waitTime 8m11s); retried after the wait →
  **`review_completed`, findings: 0** over surfaces
  `[assets, css, derive-theme, resolve, themed-image] (all tests/theme/)`.
  GATE CLEARED for the rider commit `ba3e9f9`.
```

## 6. Continuation session — independent re-verification + rider commit (2026-10-29)

Prior implementer ended without committing (retry loop gone). This session
re-verified everything end-to-end and committed the rider.

- Inventory: 5 test-only files vs `1297f70`, no `src/**` changes
  (assets/css/derive-theme/resolve/themed-image tests — exactly the §1 fixes).
- `pnpm exec tsc --noEmit` (repo tsconfig): **0 errors** (exit 0).
- `pnpm exec vitest run`: **506/506 passed, 42 files**, ~5.0 s — exact
  baseline (506/506/42) preserved.
- `npm run lint`: **0 errors, 20 warnings** — matches baseline, 0 new.
- Scratch-tsc re-run (`pnpm exec tsc -p /tmp/opencode/tsconfig-scratch.json
  --noEmit`, config verified present, extends repo tsconfig with src+tests
  include, log at `/tmp/opencode/scratch-tsc-rerun.log`): **75 error lines,
  0 in `tests/theme/**`, 0 in `src/**`** — confirms §2 exactly; spread:
  `usability/payments-checkout` 29, `security/admin-users` 21,
  `security/ic-encrypt-route` 11, `security/admin-settings-pricing` 6,
  `reliability/subscription-pricing` 4, `security/nric-validation` 3,
  `security/role-claim` 1. All pre-existing non-theme test files; no fix
  required, rider scope unchanged.
- `cr --prompt-only --type uncommitted` (single retry this session):
  **rate-limited again** — `Rate limit exceeded`, recoverable, waitTime
  ~12 min 58 s; "all 3 included reviews used"; org not seat-linked
  (dashboard link in CLI output). NOT retried further; remains an OPEN
  gate item for @manager.
- Rider commit: **`ba3e9f9`** on `feat/event-themes-p2`
  (`fix(theme): phase-gate riders (stale test literals + matrix)`), 5 files
  changed, +8/−6; working tree clean afterwards.
- Status: **Task 11 remains IN PROGRESS** (CodeRabbit uncommitted review
  still outstanding due to rate limit).


### .superpowers/sdd/2026-10-29-event-themes-p2/task-11b-asset-path-fix-report.md

# Task 11 rider — asset value shape fix (smoke-found defect) — report

**Branch:** `feat/event-themes-p2` (parent `ba3e9f9`) · **Commit:** `1170d7f` · **Type:** rider commit, phase-gate · **Mode:** Direct In-Place (never pushed)

## Defect (designer smoke)

`theme-editor.tsx` drafted `assets[key] = result.publicUrl` after upload — an **origin-absolute** URL
(e.g. `http://host:3000/...` on a local stack). `assetValueOk()` (`src/lib/theme/utils.ts:33`) accepts only
`https://` URLs or bucket-relative paths (`[A-Za-z0-9/_.-]+`, no `..`), so on ANY http dev environment:

- the drafted value failed `validateThemeConfig` → validation `ok:false`
- → the Save button stayed hard-disabled (the mixed-content https-only contract is better served by the
  076-legal *path* shape, which is origin-portable). Cloud incidentally passed — but the store-side
  contract must not depend on which origin the editor runs on.

## Fix (ruling option a)

### 1. Write side — draft `result.path`, not `result.publicUrl`

- `uploadThemeAsset` already returns `{ path, publicUrl }`; nothing in the engine changed.
- `theme-editor.tsx` (`handleUpload`): image asset kinds now draft `result.path`
  (`organizers/{orgId}/events/{evtId}/{kind}-v{ts}.{ext}` — the exact `assetPath()` output);
  **font slots keep `publicUrl`** — §5.4's `themeFontUrlOk` requires an https URL on the platform storage
  origin / fonts.gstatic.com, so a bucket path can never be a legal font value (out of this ruling's scope).
- **DB 076 is the binding authority — verified, not bent**: `supabase/migrations/076_theme_presets.sql`
  assets branch requires only `https://` OR path charset `[A-Za-z0-9/_.-]+` with no `..` — **no prefix
  requirement**. `assetValueOk()` is unchanged (read-side floor untouched per instruction 4); it already
  accepts the path shape. No rule loosening needed, none applied.

### 2. Read side — expand at consume: `storageAssetUrl(value: string | null): string | null`

New export in `src/lib/theme/assets.ts` (single home, next to the upload engine):

- `null` → `null`
- `https://` → passthrough (external/legacy references, unchanged behavior)
- otherwise: `NEXT_PUBLIC_SUPABASE_URL` → `origin` + pathname (base-path preserved — see cr finding below),
  malformed env → `null`; value re-gated by `assetValueOk` → junk → `null`; expands to
  `${base}/storage/v1/object/public/event-themes/${value}` — the same shape Storage's `getPublicUrl`
  produces, which also still matches the SW cache matcher only on https and the require-prefix https SW
  macro stays untouched (expanded URLs on https cloud carry the same `origin + /storage/v1/object/public/event-themes/`
  prefix → cache rule unaffected).

Consumers switched from raw value to `storageAssetUrl(...)`:

- `theme-editor.tsx` — AssetRow thumbnails (drafted/seeded values)
- `mini-theme-preview.tsx` — banner + logo slots (live preview + preset gallery)
- `event-theme-scope.tsx` — banner + logo nodes (runner page, Task 10 slots)

Wiring comment updated in `resolve.ts` (resolve keeps returning the RAW stored 076-legal shape — expansion
is display/consume-time only; the degrade floor is untouched).

### 3. Tests (11 new; 518/518 total)

- `tests/theme/assets.test.ts` — `storageAssetUrl` describe: https passthrough; **end-to-end tie — the
  uploaded `result.path` expands to EXACTLY the mocked `getPublicUrl` output (Save-enabled + renderable on
  any origin)**; plain 076-legal path expansion; trailing-slash env; prefixed-base env (keeps API path);
  null/`javascript:`/`http:`/`..`/space/empty → null; env unset/malformed → null. (Per-file env stub, same
  pattern as `utils.test.ts`.)
- `tests/theme/validate.test.ts` — Save-enabled contract: the exact editor-drafted `assetPath()` shape
  passes `validateThemeConfig` AND `assetValueOk` (this is the assertion the missing http-origin behavior
  was breaking).
- `tests/theme/derive-theme.test.ts` — bucket path resolves RAW through the assets floor (consumers expand).
- `tests/theme/event-theme-scope.test.tsx` — bucket-path assets → `<img src>` is the EXPANDED Storage URL;
  raw path never renders (per-file env stub).
- `tests/theme/theme-editor.test.tsx` — bucket-path draft → row thumbnail uses the expanded URL, save bar
  carries no asset errors; MiniThemePreview bucket-path → expanded `<img src>` (per-file env stub).

## Files changed (commit `1170d7f`)

- `src/lib/theme/assets.ts` — add `storageAssetUrl` (+ `assetValueOk` import; upload docstring wording)
- `src/components/theme/theme-editor.tsx` — draft `result.path` for image kinds (fonts keep publicUrl); thumbnails expand
- `src/components/theme/mini-theme-preview.tsx` — expand banner/logo
- `src/components/theme/event-theme-scope.tsx` — expand banner/logo
- `src/lib/theme/resolve.ts` — doc comment only
- `tests/theme/{assets,validate,derive-theme,event-theme-scope,theme-editor}.test.{ts,tsx}` — 11 new tests

## Verification

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npx vitest run` | **518/518, 42 files** (baseline 506/506, 42 files → +11 new, 0 baseline regressions) |
| `npm run lint` | 0 errors, 20 warnings — **byte-identical to pre-change baseline** (stash-verified) |
| `cr --prompt-only --type uncommitted` | Run 1: **1 minor finding** (supabase base-path prefix dropped by bare `.origin`) → fixed (base = `origin + pathname`, prefixed-base test added) · Run 2: **0 findings** (reused review, review_completed) |

Commit message exactly as ordered: `fix(theme): store bucket-path asset values, expand at consume`.
Ledger appended to `.superpowers/sdd/2026-10-29-event-themes-p2/progress.md`.

## Explicitly NOT touched (per ruling)

- `assetValueOk()` rules (read-side floor, one implementation in `utils.ts`)
- `sw/serwist` — the local https-only matcher gap is the documented smoke-only artifact (ticket-level;
  cloud remains https; expanded URLs still match the production matcher on https cloud)
- DB migration 076 — verified equal precedence, no edit required

## Concerns (≤5)

1. **Font uploads on http dev stacks keep the pre-existing gap**: font slots draft `publicUrl`
   (necessarily — `themeFontUrlOk` demands https+origin), so a local http-env font upload still blocks
   Save. Pre-existing behavior, outside this ruling's scope (assets only); flag for @manager if the
   phase gate expects fonts to be http-origin-portable too.
2. `storageAssetUrl` expands ANY 076-legal bucket path against the event-themes bucket — it does not
   verify the path is inside `organizers/...`; that's exactly the 076 contract ("bucket paths or https"),
   not a bug, but worth knowing if 076 ever adds a tenant prefix.
3. Prefixed-base support (`origin + pathname`) is verified by test but unexercised in this repo's actual
   envs (bare-origin shape, same as `merch.ts` concat); behavior for origin-only URLs is unchanged.
4. `cr` run 2 was a REUSED review (0 findings, flagged "no fresh detailed file review"); the 1 real finding
   from run 1 was fixed and covered by a new test, but if the gate wants a fully-fresh second pass, rerun
   with `--fresh`.


### .superpowers/sdd/2026-10-29-event-themes-p2/task-2-report.md

# Task 2 evidence — shared utils + chroma-cap test (P2.Task 2)

Branch: `feat/event-themes-p2` · Base: `b2f1349` · Head: `520713a` · Range: `b2f1349..520713a`

## TDD sequence (failing tests FIRST)

RED — implementation file did not exist yet, collection fails:

```
$ pnpm exec vitest run tests/theme/utils.test.ts tests/theme/color.test.ts
 FAIL  tests/theme/utils.test.ts [ tests/theme/utils.test.ts ]
Error: Failed to resolve import "@/lib/theme/utils" from "tests/theme/utils.test.ts". Does the file exist?
 Test Files  1 failed | 1 passed (2)
      Tests  22 passed (22)
```

- `tests/theme/utils.test.ts` RED (cannot resolve `@/lib/theme/utils` — not implemented yet).
- `tests/theme/color.test.ts` (incl. new chroma-cap vector) GREEN pre-implementation — it pins P1's
  existing cap branch (`Math.min(c*0.85, 0.20)` already in color.ts from P1), per plan "first vector
  with C>0.235".

GREEN after implementing `src/lib/theme/utils.ts` + refactoring call sites → full suite below.

## Files changed (commit 520713a, exactly 8)

- NEW `src/lib/theme/utils.ts` — named exports only `isPlainObject(v: unknown): v is Record<string, unknown>` and `themeFontUrlOk(url: unknown): boolean` (exact names per plan Task 2).
- NEW `tests/theme/utils.test.ts`
- `tests/theme/color.test.ts` — appended chroma-cap test only (P1 tests untouched)
- `src/lib/theme/css.ts` — `allowedFontUrl`/`FONT_STATIC_HOST`/`platformStorageHost` removed; delegates to `themeFontUrlOk`; P1 css tests pass verbatim
- `src/lib/theme/resolve.ts`, `src/lib/theme/validate.ts`, `src/lib/theme/draft.ts` (relative `./utils` import),
  `src/components/theme/event-theme-scope.tsx` (`@/lib/theme/utils` import) — local `isPlainObject` copies deleted

## Grep confirmation — no local copies, all consumers delegate

```
$ grep -rn "function isPlainObject" src
src/lib/theme/utils.ts:7:export function isPlainObject(v: unknown): v is Record<string, unknown> {
```
(sole remaining definition = the shared util; the 4 former local copies deleted)

```
$ grep -rln "isPlainObject|themeFontUrlOk" in src --include="*.ts" --include="*.tsx"
src/lib/theme/draft.ts
src/lib/theme/validate.ts
src/lib/theme/utils.ts
src/lib/theme/css.ts
src/lib/theme/resolve.ts
src/components/theme/event-theme-scope.tsx
```
All 4 P1 call-site modules + css.ts reference the shared imports (css.ts: `import { themeFontUrlOk } from './utils'`; scope: `@/lib/theme/utils`; resolve/validate/draft: `./utils`).

## Chroma-cap vector passing

`deriveDarkVariant('#FF0000')` → C = exactly 0.20 (tolerance 1e-9; #FF0000 C ≈ 0.258 > 0.235, so
`Math.min(c*0.85, 0.20)` cap branch fires — ×0.85 alone = 0.219 > 0.20):

```
it('caps #FF0000 chroma at exactly 0.20 (the ×0.85 branch alone would overshoot)')
→ passed in tests/theme/color.test.ts (full run below, 431 total)
```

## Gates

```
$ pnpm exec tsc --noEmit       → (no output, exit 0)  0 errors
$ pnpm exec vitest run
 Test Files  39 passed (39)   # baseline 38 +1 new utils test file
      Tests  431 passed (431) # baseline 418 +13 new tests
 Duration  4.18s

$ pnpm run lint
✖ 20 problems (0 errors, 20 warnings)   # baseline parity: 0 errors, 20 warnings
```
Test-count note: +13 over baseline = 12 `tests/theme/utils.test.ts` tests (3 isPlainObject + 9 themeFontUrlOk) + 1 chroma-cap test appended to `tests/theme/color.test.ts`. 418 + 13 = 431 ✓

## Notes / choices

- `themeFontUrlOk` keeps P1 css.ts semantics byte-for-byte (same raw-string traversal regex, https check, host allowlist sourced from `process.env.NEXT_PUBLIC_SUPABASE_URL` env, `.woff2` pathname suffix). P1 `tests/theme/css.test.ts` unchanged and green.
- `isPlainObject` is a strictly stronger guard than the P1 copies (adds `instanceof Date`/`instanceof Map` rejection per plan's "Map/Date false" parity requirement). Behavior-identical at all call sites: theme_config/sections come from JSONB, which cannot produce Date/Map.
- css.ts still constructs `new URL(fontUrl)` locally for the normalized `url.href` used inside `src: url("…")` — `themeFontUrlOk` returns `boolean` per plan (no third export).
- Cloud DB / migrations: none touched (Task 2 obeys plan constraint — web code only).


### .superpowers/sdd/2026-10-29-event-themes-p2/task-3-report.md

# Task 3 report — Font-URL enforcement at save AND resolve (P2)

Branch `feat/event-themes-p2`, range `520713a..cc07b9c`, Direct In-Place (pelikat-web).
Plan section matched by title: "Task 3: Font-URL enforcement at save AND resolve" — plan text matches the dispatch brief on all numeric details (same vectors, same commit message). No deviations.

## Changes

### 1. `src/lib/theme/validate.ts` — typography slot becomes a structured ERROR at save
- Before: `https://` prefix floor only (`typeof raw !== 'string' || !raw.startsWith('https://')` → error "must be an https:// URL").
- After: `!themeFontUrlOk(raw)` → structured error
  `typography.<key>: not an allowed font URL — must be https://fonts.gstatic.com or the platform storage origin, end in .woff2, and contain no path traversal`.
  - Non-string values also fail (themeFontUrlOk returns false for non-strings) — structured error, no throw.
  - Typography object absent / keys absent → zero findings (unchanged: `raw === undefined) continue`).
  - No duplicate findings in errors+warnings for the same problem (errors only).
  - Error→`ok:false` = blocking save per spec §5.4/§5.4 "enforced at save". Warning list untouched for this section.
- Import changed: `import { isPlainObject, themeFontUrlOk } from './utils'`.

### 2. `src/lib/theme/resolve.ts` — resolve-time floor in the mergeThemeConfig/getResolvedTheme chain
- `deriveTheme`'s `font(key)` (the only typography consumer post-merge; fed by `mergeThemeConfig` output through `getResolvedTheme`→`resolveTheme`→`deriveTheme`):
- Before: https-only floor (`startsWith('https://')`), warn "must be an https URL".
- After: `!themeFontUrlOk(raw)` → return `null` (slot dropped → Geist fallback downstream per §5.5) + structured warning
  `typography.<key>: not an allowed font URL — using platform font`. Never throws. Valid URL passes untouched, `markOverridden` still fires.
- Non-string value → not ok → dropped + warning (never throws).
- No other resolve behavior touched: colors/tint/vocabulary/labels/override-tracking byte-identical; fuzz never-throws behavior intact (verified by pre-existing "fuzz" tests, still green).

## Test vectors (TDD red→green)

`tests/theme/validate.test.ts` — new describe "typography §5.4 allowlist at save (P2 Task 3 — errors block)" with utils.test.ts-style env stub (`NEXT_PUBLIC_SUPABASE_URL = https://ugexrrslijmwtieevjbs.supabase.co`, beforeAll/afterAll restore):
- ACCEPT `https://fonts.gstatic.com/s/prata/v20/prata-46Rm.woff2` → `{ok:true, errors:[], warnings:[]}`
- ACCEPT `https://ugexrrslijmwtieevjbs.supabase.co/storage/v1/object/public/event-themes/o/e/heading_font-v1.woff2` → `{ok:true, errors:[], warnings:[]}`
- REJECT (structured error on `typography.heading_font_url`, ok:false, no warnings): `https://evil.com/a.woff2`, `http://fonts.gstatic.com/a.woff2`, `https://fonts.gstatic.com/a.ttf`, `https://fonts.gstatic.com/s/../x.woff2`, `https://fonts.gstatic.com/s/%2e%2e/x.woff2`
- REJECT non-strings: `42`, `null`, `['x']`, `{url:…}` on `typography.body_font_url`
- Typography absent → zero findings (pre-existing tests).

`tests/theme/resolve.test.ts` — new describe "resolve-time §5.4 font-URL floor (P2 Task 3 — drop + warn, never throw)" with the same env stub:
- Hostile pre-existing row: `heading https://evil.com/a.woff2` + `body https://fonts.gstatic.com/s/../x.woff2` → both slots null, both warnings, never throws.
- Valid pre-existing row: gstatic heading + storage-origin body → slots intact and used (exact string equality), zero typography warnings, both in `source.overriddenKeys`.

Red run (pre-implementation): `Tests 2 failed | 49 passed (51)` — the two allowlist tests failed exactly on the accepted-vector assertions (`evil.com` kept by the old https-only floor). Then implementation; green.

## Raw gate outputs

`tsc`:
```
pnpm exec tsc --noEmit   → (no output), exit 0
```
`vitest run` (full):
```
 Test Files  39 passed (39)
      Tests  437 passed (437)
```
431 baseline (Task 0/2 reported scale) + 6 new tests = 437 exact.
Note: baseline was reported as 418+chroma-cap additions in Task 0; Task 2 added more tests before 431. 437 = 431 (stated expectation) + 6 new.

`lint` (post-change vs stashed baseline — both runs):
```
✖ 20 problems (0 errors, 20 warnings)   ← identical before and after
```
0 new errors/warnings.

`cr --prompt-only --type uncommitted`:
```
{"type":"complete","status":"review_completed","findings":0,...,"reviewedFiles":["src/lib/theme/resolve.ts","src/lib/theme/validate.ts","tests/theme/resolve.test.ts","tests/theme/validate.test.ts"],"outcome":"completed","message":"Review completed"}
```

`supabase db reset`: not re-run — no SQL touched (implied green per plan).

## Commit
- `cc07b9c` `feat(theme): font URL allowlist enforced at save and resolve` (message EXACT as specified)
- Range: `520713a..cc07b9c`


### .superpowers/sdd/2026-10-29-event-themes-p2/task-5-report.md

# Task 5 report — Ruling #10: secondary/accent fg-companion ≥4.5:1 (Batik gold renders)

**Status:** DONE · **Branch:** `feat/event-themes-p2` (Direct In-Place) · **Commit:** `b3b3648` (range `cc07b9c..b3b3648`)

## Files changed

| File | Change |
|---|---|
| `src/lib/theme/resolve.ts` | `themedColor` branches: `secondary`/`accent` replace the P1 fill-vs-PLATFORM_BG_HEX <3:1 degrade with the companion gate (`companionRatio(fill) < 4.5` → degrade fill AND fg to platform in both slots + structured warning, never throw). `primary`/`ring` byte-unchanged. New module-local `companionRatio` helper. |
| `src/lib/theme/validate.ts` | `contrastGate`: `secondary`/`accent` mirror the same criterion as a WARNING — `"< 4.5:1 — will degrade at render (companion contrast < 4.5:1)"`, never blocks. `primary` hard-block byte-unchanged; `ring` warn-only byte-unchanged. Same-shape `companionRatio` mirror (documented as mirroring resolve.ts, same pattern as the mirrored PLATFORM_BG_HEX decision). |
| `tests/theme/resolve.test.ts` | New describe `Ruling #10` (4 tests): Batik gold renders; `#949494` kept; fails-companion `#777777`/`#787878` degrade both slots + warning; plan-vector note test for `#EDEDED`/`#FFFFFF`. |
| `tests/theme/validate.test.ts` | Reworded P1 secondary/accent bg-vs test to companion wording (plan line 91); new gold-passes and `#949494`-passes tests. |
| `tests/theme/save-event-theme.test.ts` | One reworded assertion (P1 secondary test, reword authorized by plan line 91): `secondary` vector `#FFD700` → `#777777` (P1's `#FFD700` now renders, companion 14.1:1 → no warning would fire); test purpose (warnings ride through `saveEventTheme`) preserved. **Outside the 4-file brief boundary — flagged to @manager.** |

## Implementation (locked rule, verbatim semantics)

- **Light companion:** `fg = pickForeground(fill)` (HEX path). WHITE pick ≥4.5:1 by `pickForeground`'s own predicate; dark pick (`oklch(0.145 0 0)`) is unparseable by HEX-only `contrastRatio` (would return 1), so the fill's WCAG luminance (`relativeLuminance`) is measured against the constant's exact luminance — a neutral OKLab gray's relative luminance is L³ = 0.145³. Documented at the helper.
- **Dark companion:** `fill.dark` = `deriveDarkVariant` output, opaque oklch, L∈[0.68,0.82] ⇒ ≥6.87:1 vs `oklch(0.145 0 0)` at the L floor — PASS by construction, documented inline (no OKLab→sRGB solver exists to measure a chromatic oklch; "passing is the contract").
- **FAIL →** degrade fill AND fg to platform in BOTH light and dark slots + structured warning; degraded keys not marked overridden. Never throws.
- **Save side:** warning only; hard-block stays primary-only vs `PLATFORM_BG_HEX` (untouched byte-for-byte, incl. the #949494/#919191/#929292 boundary pins).

## Verification

| Gate | Result |
|---|---|
| `pnpm exec tsc --noEmit` | 0 errors (exit 0) |
| `pnpm exec vitest run` | **443/443 passed, 39 files' tests… (39 test files)** — baseline 437/437 + 9 new − 3 replaced-by-reword = 443. Full green. |
| `npm run lint` | 0 errors, 20 warnings — all pre-existing (unrelated files; zero output for my 5 files → 0 new) |
| `cr --prompt-only --type uncommitted` | **compleleted, findings: 0** (reviewed the 5 changed files). Rate-limited ×3 ("all 3 included reviews used"), cleared on the 4th attempt after ~13 min total wait — no finding noted. |
| Commit | `b3b3648`, exactly `feat(theme): secondary/accent degrade by fg-companion ≥4.5:1 (Batik gold renders)` |

## Numeric conflict in plan Task 5 vectors (FOLLOW PLAN = follow the locked rule; noted as instructed)

The plan's rule formula (`fg = pickForeground(fill.light)` + `≥4.5:1`) and requirement 1 (gold renders via dark text on gold, 8.33:1) uniquely determine the implementation. The two "adversarial" vectors contradict it — their claimed outcomes are numerically impossible:

- `#EDECED`/`#FFFFFF` (plan says "fails companion → degrades"): their white companions fail, so `pickForeground` pairs the DARK companion, which passes hugely — **16.91:1** / **19.79:1** ≥ 4.5. (The plan's "≈1.08:1" for #EDEDED vs white uses naive 255/237 division, not WCAG; true WCAG = 1.17:1, and pickForeground would not choose white anyway.) Same reading applies to "edge: #FFFFFF fill with white fg" — that pairing is structurally unreachable (`pickForeground` returns white only when it passes).
- These two vectors are pinned in `resolve.test.ts` as a plan-vector NOTE asserting the rule outcome (they render with dark companions — the same pairing the platform `secondary` slot itself uses: `oklch(0.92 0 0)` + dark fg). If @manager re-rules, one test flips.
- The TRUE fails-companion band (used for the degrade+warn tests) is `pickForeground`'s dead band where BOTH candidates sit just under 4.5:1: `#777777` (white 4.48 / dark 4.42) and `#787878` (4.42 / 4.48).

## Reference ratios (WCAG vs `0.145³`/white)

`#D4A017`: dark-fg companion 8.33:1 (white 2.38:1) → renders, no warning · `#949494`: 6.52:1 → renders (P1 degraded it) · `#8C6D1F` (FULL fixture): white 4.86:1 → clean · dark-variant fill floor: 6.87:1. `ring` unaffected.

## Concerns

1. `save-event-theme.test.ts` touched beyond the brief's file list — mandated by plan line 91 ("reword P1 secondary/accent tests") + the full-suite-green gate; single-assertion change, flagged above.
2. Plan vector conflict as detailed — implementation follows the @manager-locked rule; vectors' claimed outcomes are unimplementable under it.
3. Suite grew 437 → 443. Ledger appended (IN PROGRESS + DONE lines).


### .superpowers/sdd/2026-10-29-event-themes-p2/task-6-report.md

# Task 6 Report — ThemedImage reserved-box component

**Branch:** `feat/event-themes-p2` · **Range:** `b3b3648..603aeb1` · **Status:** DONE

## Files changed (commit 603aeb1)
- `src/components/theme/themed-image.tsx` — NEW. `ThemedImage({ src?, alt, aspect, className?, fallbackClassName? })` client component + `THEME_ASPECTS = { banner: '3/1', logo: '1/1', badge: '1/1', certificate_background: '1.414/1' }`.
- `tests/theme/themed-image.test.tsx` — NEW, 6 tests.

## Implementation notes
- Wrapper div ALWAYS renders `style={{ aspectRatio: aspect }}` + `overflow-hidden` (hard CLS guard); layout reserved even with empty/broken src.
- `src` set → `<img src alt className="h-full w-full object-cover" loading="lazy" />` with an eslint-disable on `@next/next/no-img-element` (justified: arbitrary storage URLs of no intrinsic size; next/image would fight the locked aspect box).
- Error state bound to the failed URL (`failedSrc` state, set via `onError`) — CodeRabbit (major, fixed) flagged the naive boolean form: a valid later `src` would have stayed behind the fallback forever. Fixed src shows the img again after rerender.
- Fallback layer (`!src || src === failedSrc`): `aria-hidden="true"` div with `bg-gradient-to-br from-muted to-background` (platform-neutral Tailwind classes, no token remap) + `fallbackClassName`. `alt` rendered as sibling `sr-only` span in the fallback state (inside the aria-hidden layer would hide it from screen readers); in img state `alt` is accessible via the img's own attribute. No broken-image glyph ever.
- `'use client'` (needs `onError` state); composes inside server parents.

## Tests (6)
1. Reserved box renders + `aspectRatio` style present when `src` undefined (fallback, no img).
2. `src` set → img with that src + alt.
3. `onError` → fallback div only, no img, alt still accessible (fireEvent-driven; @testing-library/react already in devDeps per plan branch).
4. Recovery: failed URL → fallback, then valid rerendered `src` → img again.
5. Alt present in both states (`sr-only` text vs `getByAltText`).
6. `THEME_ASPECTS` map exact.

## Verification
- `cr --prompt-only --type uncommitted`: first run found 2 (1 major fixed: error-bound-to-src; 1 minor: `overflow-hidden` added; jsdom-layout assertion suggestion skipped — no real layout in jsdom). Re-run after fixes: **0 findings, complete**.
- `npx tsc --noEmit`: exit 0.
- `npx vitest run`: **449 passed (449) across 40 test files** (baseline 443/443/39 files → +6 tests/+1 file; report wrote 6 not 5 due to the CodeRabbit recovery test).
- `npm run lint`: 21→20 problems exactly matches pre-change baseline (20 warnings, 0 errors, 0 new) — initial +1 img warning resolved via justified disable.

## Docs fix folded in
- `docs/superpowers/plans/2026-10-29-event-themes-p2.md` Task 5 checklist line: appended ruling sentence "(Ruling: #EDEDED/#FFFFFF render under the locked rule via dark companion 16.91:1/19.79:1; true fails-companion vectors are #777777/#787878 dead-band.)" (file lives outside the pelikat-web repo, workspace-root dirs are not git-tracked).

## Concerns for downstream (Tasks 7/9)
- `THEME_ASPECTS.badge` key is `badge` (not `badge_icon` as the Task 7 upload-row naming) — consumers should map; per Task 6 spec verbatim.
- Component resets error per-URL but does not reset on unhandled cache re-validation; acceptable (url-keyed).


### .superpowers/sdd/2026-10-29-event-themes-p2/task-7-report.md

# Task 7 report — Serwist runtimeCaching for theme assets + Theme-tab uploader engine

Branch `feat/event-themes-p2`, commit range `603aeb1..1a6d9e7` (tip `1a6d9e7`,
message exactly `feat(theme): Serwist 7d asset cache + Theme-tab asset uploaders + orphan cleanup`).
Direct In-Place, no new deps, no SQL touched (no `db reset` run — not needed).

## Files

New:
- `src/lib/theme/serwist.ts` — pure builder: `THEME_ASSET_PATH_PREFIX`
  (`/storage/v1/object/public/event-themes/`), `THEME_ASSET_CACHE_NAME = theme-assets-v1`,
  `THEME_ASSET_MAX_AGE_SECONDS = 604800` (7d), `THEME_ASSET_MAX_ENTRIES = 60`,
  `themeAssetMatcherSource(origin)` → anchored, regex-escaped `^https://<origin>\.…/storage/v1/object/public/event-themes/`
  or null for unset/http/garbage (rule omitted entirely — never a broad matcher).
- `src/lib/theme/assets.ts` — §6 engine: `ASSET_LIMITS` (banner 2097152 / logo
  524288 / badge_icon 262144 / certificate_background 8388608, all
  `image/png,image/jpeg,image/webp`), `FONT_LIMIT = 3145728` (.woff2 only),
  `assetPath(organizerId, eventId, kind, ext, ts = Date.now())` →
  `organizers/{organizerId}/events/{eventId}/{kind}-v{ts}.{ext}`,
  `uploadThemeAsset(client, {organizerId, eventId, kind, file, ts?})` (client
  gate FIRST — zero network on reject; upsert upload with contentType; 409/
  conflict → `remove([path])` once → re-upload once, warn-logged), and
  `cleanupThemeAssets(client, {organizerId, eventId, savedAssets})` (list
  `organizers/{organizerId}/events/{eventId}` via Storage list(), keep the
  object whose name equals the saved config's URL basename, delete other
  `{kind}-v*` objects ONLY for kinds present, never absent kinds or unknown
  names; list/remove failures = structured warnings, never throw). Also
  `FAMILY_FONT_URLS` (9 families, byte-identical gstatic URLs mirrored from
  `081_seed_preset_typography.sql`, with an in-file drift-risk comment).

Modified:
- `src/app/sw.ts` — cache-first runtimeCaching entry appended after
  `defaultCache`: `matcher: new RegExp(themeAssetMatcherSource(origin))`,
  `CacheFirst({ cacheName: 'theme-assets-v1', plugins: [CacheableResponsePlugin({statuses:[200]}), ExpirationPlugin({maxEntries:60, maxAgeSeconds:604800})] })`.
  Import path is RELATIVE (`../lib/theme/serwist`) on purpose: serwist
  compiles the SW in a webpack child compilation that does not resolve
  tsconfig path aliases.
- `next.config.ts` — `webpackCompilationPlugins: [themeStorageOriginDefinePlugin]`:
  the SW child compilation does NOT inherit Next's NEXT_PUBLIC_ DefinePlugin,
  so the storage origin is Defined explicitly into it. The plugin object
  captures the real webpack module from the build's `options.webpack` hook
  (no direct webpack import — unresolvable under pnpm). `""` env ⇒ SW ships
  without the theme-asset rule.
- `src/components/theme/theme-editor.tsx` — new Assets section between Colors
  and Vocabulary: 4 per-kind rows (banner 3/1, logo 1/1, badge_icon 1/1 via
  `THEME_ASPECTS.badge`, certificate_background 1.414/1) each with a
  `ThemedImage` thumbnail (draft URL when set), drag-drop + file picker
  (hidden-input idiom), exact §6 limit hints, upload-in-progress state,
  row-scoped structured error, remove action = omit-key from `draft.assets`;
  2 font rows (heading_font/body_font) = curated 9-family dropdown (value =
  the gstatic URL, i.e. `FAMILY_FONT_URLS`) OR `.woff2` upload; values land
  in `draft.typography.heading_font_url`/`body_font_url`. New required prop
  `organizerId` (session-supplied — never fetched client-side).
- `src/app/organizer/events/[id]/page.tsx` — passes `organizerId={myOrganizerId}`.
- `src/lib/theme/draft.ts` — `assets` + `typography` sections now
  allowlist-projected in seed AND normalize (known `*_url` keys, string
  values only; unknown keys rejected, explicit nulls omitted ⇒ omit-reset).
- `src/components/events/actions.ts` — `saveEventTheme` shape unchanged
  (theme_config passthrough); after a successful save + revalidates it reads
  `theme_config` FRESH from the DB (`select('theme_config').eq(id)`) and runs
  `cleanupThemeAssets` with the same authenticated (RLS) client; cleanup
  warnings merge into `result.warnings`; cleanup never runs on a failed save.

## Verification

- `pnpm exec tsc --noEmit` → 0 errors.
- `pnpm exec vitest run` → **481/481 passed, 42 files** (baseline 449/449, 40
  files; +32 tests).
- `npm run lint` → 0 errors, 20 warnings — all pre-existing
  (tests/usability/*, src/hooks/use-mobile.ts); none in touched files.
- `pnpm run build` (`next build --webpack`) → passes, and the compiled
  `public/sw.js` was inspected: contains the origin literal
  `https://ugexrrslijmwtieevjbs.supabase.co` (evidence the DefinePlugin
  injection works), the `theme-assets-v1` CacheFirst route anchored to
  `^https://…\.supabase\.co/storage/v1/object/public/event-themes/`, and
  `maxEntries:60, maxAgeSeconds:604800`.
- `cr --prompt-only --type uncommitted`: attempted 3× — 2× rate-limited
  (pro-reviews exhausted), 1× completed but **skipped the review** ("No
  uncommitted changes detected" while the changes were uncommitted);
  NOT a real review. Post-commit rerun not attempted for the same reason.

## Tests added (tests/theme/)

- `serwist.test.ts` (7): escaped matcher source exact; matches
  event-themes URLs; never matches certificates bucket / other hosts /
  `event-themes-something`; null for http/garbage/unset/non-string; pinned
  604800s + 60 entries.
- `assets.test.ts` (18 + 1): 2.5 MB banner and 0.6 MB logo rejected with zero
  network; `.gif` banner rejected; `.ttf` and oversized woff2 rejected;
  boundary size accepted happy path (content-typed upsert + publicUrl);
  unknown kind rejected; `assetPath` exact format incl. uppercase ext +
 Rejects bad organizer id / empty ext; 409 → remove + single retry (same
  path) with warn; non-409 upload failure rejects; cleanup keeps referenced
  objects, deletes stale variants of present kinds, never touches absent
  kinds or unknown names, no-list-when-no-refs, list/remove failures as
  structured warnings; FAMILY_FONT_URLS = 9 families, every URL passes
  `themeFontUrlOk`.
- `draft.test.ts` (+4): assets/typography allowlist projection, null-leaf
  omit-reset semantics, empty section drops out, empty draft → null.
- `theme-editor.test.tsx`: editor renders 4 asset rows + 2 font rows + exact
  §6 hint strings; a saved banner renders its `-v{ts}` URL in the thumbnail
  (Reserved-box structure); fixtures updated for the new required
  `organizerId` prop.
- `save-event-theme.test.ts` (+3): cleanup invoked with the FRESHLY-READ DB
  config (client draft banner NOT the reference set); failed save ⇒ cleanup
  never runs; cleanup warnings ride the structured save result.

## Notes / deviations for @manager

1. **Serwist adaptation (plan assumption gap):** plan assumed env is available
   in the sw build; @serwist/next compiles `sw.ts` in a webpack CHILD
   compilation that does not receive Next's NEXT_PUBLIC_ DefinePlugin, and
   its options schema only forwards plugins via `webpackCompilationPlugins`.
   Adapted minimally as described above (matcher constants extracted to
   `src/lib/theme/serwist.ts` and unit-tested — exactly the plan's "pin the
   matcher as an exported constant" fallback). Also fixed `RuntimeCaching`
   field name for serwist 9.5 (`matcher`, not `urlPattern`).
2. **Font limit discrepancy in the plan itself:** plan Global Constraints +
   interfaces pin `FONT_LIMIT = 3145728` (3 MB), but the editor-wiring bullet
   says "woff2 upload ≤300 KB" (design doc §6 says 300 KB). Implemented
   3145728 (the exact interface constant, twice stated in the plan); the
   editor hint derives from the constant. If 300 KB was the intent, one
   constant changes.
3. **Storage addendum:** cloud carries the event-themes storage addendum;
   there is no repo-side migration for it — `supabase db reset` replay (Task
   11 matrix) will lack the bucket/policies unless the addendum is re-added
   to the repo. Flagged for @manager/@db-specialist.
4. Asset kinds in the DB are `*_url` keys (`banner_url`, …, from 076); the
   upload "kinds" (`banner`, …) are path/filename prefixes — mapping made
   explicit in one place (`kindFromAssetKey`).
5. `cr` review could not complete (rate limit + skip) — recommend a
   CodeRabbit pass on the branch before the phase gate.


### .superpowers/sdd/2026-10-29-event-themes-p2/task-8-report.md

# Task 8 report — is_active preset filtering (gallery + save)

Branch `feat/event-themes-p2`, commit range `1a6d9e7..1a6c2d2` (tip `1a6c2d2`,
message exactly `feat(theme): is_active preset filtering (gallery + save)`).
Direct In-Place, no new deps, no SQL touched (`is_active boolean not null
default true` already exists on `theme_presets` — migration 076:204).

## Files

- `src/app/organizer/events/[id]/page.tsx` — the Theme-tab preset gallery
  query (lives in the page server component, which feeds `ThemeEditor`'s
  `presets` prop) now `.select('id, name, tokens, is_active')` +
  `.eq('is_active', true)`; options carry `is_active` through.
- `src/components/theme/theme-editor.tsx` — `ThemePresetOption` gains
  optional `is_active?: boolean | null`; the gallery card map filters
  `p.is_active !== false`. `selectedPreset` intentionally resolves against
  the FULL list so a deactivated-but-saved preset still seeds its own
  token/vocabulary values (consistent with the resolve-unchanged ruling).
  NOTE: the React-compiler lint forbade routing `selectedPreset` through the
  filtered array (`useMemo` memoization could not be preserved); filtering
  only at the render site fixed it without changing the memo structure.
- `src/components/events/actions.ts` — `saveEventTheme`: events select gains
  `theme_preset_id`; preset select gains `is_active`. Fail-closed rejection
  `{ ok: false, error: 'That theme preset is no longer available.' }` when
  the saved preset id is `is_active === false` AND differs from the event's
  DB `theme_preset_id` (gate the SELECTION/switch only). Missing row /
  foreign / non-owned ids keep the existing `'Unknown or not permitted theme
  preset.'` rejection (no PII). Re-saving an already-referenced (deactivated)
  preset stays allowed — @manager ruling (formerly #10); `resolve.ts`
  UNCHANGED, deactivated-but-themed events keep rendering.
- Tests: `tests/theme/theme-editor.test.tsx` (+1: gallery fixture — inactive
  preset excluded from the SSR gallery, active remains; undefined is_active
  treated as active is implicitly pinned by every other fixture); 
  `tests/theme/save-event-theme.test.ts` (+2: switch to inactive → structured
  error, never writes; already-referenced inactive preset → still saves /
  selection-only-gating pin; fixtures updated `SYSTEM_PRESET.is_active: true`,
  `OWNED_EVENT.theme_preset_id: null`).

## Verification

- `pnpm exec tsc --noEmit` → 0 errors.
- `pnpm exec vitest run` → **484/484 passed, 42 files** (baseline 481/481,
  42 files; +3 tests).
- `npm run lint` → 0 errors, 20 warnings — all pre-existing (same set as the
  Task 7 report: tests/usability/*, src/hooks/use-mobile.ts); none in touched
  files.
- `cr --prompt-only --type uncommitted` → attempted twice (once immediately,
  once after the suggested 150s wait) — both `rate_limit`ed: "You've used all
  3 included reviews currently available", `onDemandReviewAvailable: false`.
  NOT a real review; recommend the Task 11 phase-gate / branch-level
  CodeRabbit pass cover this commit.

## Notes / deviations for @manager

1. System-preset deactivation has no admin UI in P2 (row must be flipp in DB
   directly); gallery + save gating both honored regardless.
2. Migration 078 comment says "No is_active filter" for the resolution RPC —
   that ruling is now also pinned in the save path (already-referenced
   exception) + tests, so a future P3 "stronger is_active semantics" has a
   green baseline to build on.


### .superpowers/sdd/2026-10-29-event-themes-p2/task-9-report.md

# Task 9 report — body font face + --et-font-body var

Branch `feat/event-themes-p2`, commit range `1a6c2d2..eed4b56` (tip `eed4b56`,
message exactly `feat(theme): body font face + --et-font-body var`).
Direct In-Place, no new deps, no migrations, no SQL.

## Files

- `src/lib/theme/css.ts`
  - `buildStyleVars(resolved, eventId?)` — two-arg signature UNCHANGED; the
    guarded `--et-font-body` emission (P1 already emitted the var; only the
    face was missing) is kept and formatted alongside the heading var. Both
    font vars gated on `eventId` AND slot non-null; stacks
    `ET-{prefix}-Heading/Body, var(--font-geist)` — never leak `undefined`.
  - `buildFontFace` — signature changed per plan:
    `buildFontFace(eventId, fonts: { heading?: string | null; body?: string | null })`.
    Emits BOTH `@font-face` blocks (`ET-{prefix}-Heading`, `ET-{prefix}-Body`)
    as independent slots, joined one blank line apart; single-face output stays
    byte-identical to the P1 contract (trailing newline per block preserved).
    Every URL re-gated via `themeFontUrlOk` inside `fontFace()` (extracted
    per-slot builder) — never-throw contract preserved (`''` when both slots
    drop; per-slot drop means a surviving face yields non-`''`).
- `src/app/event-theme.css` — kept the EXACTLY-7 brand-token whitelist
  untouched (no new declared custom properties). Added the body mapping rule
  `font-family: var(--et-font-body, var(--font-sans))` on the `.event-theme`
  scope div. Because the rule only REFERENCES the private intermediates
  (tier-2 reference-only), even a hostile JSONB bypass stays structurally
  unreachable for platform tokens — whitelist semantics unchanged, verified by
  the existing stay-whitelisted tests still passing.
- `src/components/theme/event-theme-scope.tsx` — one-line binding change:
  `buildFontFace(event.id, resolved.fonts)` (both slots). The P1
  pre-condition `resolved.fonts.heading ?` dropped from the call site — the
  no-slot case now falls inside buildFontFace's never-throw contract. The
  two-arg `buildStyleVars(resolved, event.id)` preserved; `fontFace !== ''`
  render guard retained.
- `tests/theme/css.test.ts`
  - `buildFontFace` describe rewritten to the object signature. Pre-existing
    gate vectors re-expressed as `{ heading: url, body: null }` — NO
    assertions weakened (same allowlists/https/extension/traversal/malformed/
    normalization/prefix-sanitization expectations).
  - NEW body vectors: both slots set → exactly 2 `@font-face` blocks with both
    system families; body-only → 1 Body block, no Heading family; neither →
    `''`; per-slot hostile URL → ONLY the hostile face dropped (the other
    face survives, both directions).
  - `buildStyleVars`: NEW both-slots-set vector asserting both vars exactly;
    single-arg-omits test now also asserts body var absence (previously only
    asserted heading — strengthened, not weakened).
  - whitelist describe: NEW pair of tests — scope-div body-font mapping
    present, and "tier-2 reference-only" (no `--et-*` declared in the
    stylesheet; both font mappings referenced). Existing exactly-7-tokens +
    forbidden-token tests unchanged and still passing (npm evidence below).
- `tests/theme/event-theme-scope.test.tsx`
  - SSR asserts: both slots set → exactly 2 `@font-face` + both vars; heading
    one-sided → Body face/var absent; hostile body URL → body face + body var
    dropped to Geist while the heading face/var survive (1 face in SSR HTML);
    unaltered heading/hostile-heading vectors kept (one tightened).

## Test count note

Baseline was 484/484 (42 files) → now **493/493 (42 files)**: +9 tests, all in
`css.test.ts` (+4 buildFontFace body vectors / +1 buildStyleVars both-slots /
+2 whitelist mapping tests… net across dedup of restructured blocks) and
`event-theme-scope.test.tsx` (+2: both-slots SSR, hostile-body SSR). No test
deleted; every transformed test kept its assertion strength.

## Verification

- `npx tsc --noEmit` → 0 output (clean).
- `npx vitest run` → **Test Files 42 passed (42); Tests 493 passed (493)**.
- `npm run lint` → 0 errors (20 pre-existing warnings, all in unrelated
  `tests/usability/*` files; baseline reproduced via `git stash` A/B — none in
  this task's files).
- `cr --prompt-only --type uncommitted` → completed, **0 findings** (fresh
  run, not rate-limited; reviewed all 5 touched files).

## Ledger

Appended to `.superpowers/sdd/2026-10-29-event-themes-p2/progress.md`:
`- Task 9: IN PROGRESS (body font face)` and
`- Task 9: implementer DONE (commits 1a6c2d2..eed4b56)`.

## Concerns (≤5)

1. Body mapping lives on the `.event-theme` div (all non-heading text
   inherits). Plan text said "NEW body rule" without pinning a selector; the
   scope-div choice makes every non-heading element follow the themed body
   font while headings keep their specific rule. If the intent was narrower
   (only `<p>`-like text), it's a one-line selector tweak.
2. `--et-font-body` var emission pre-existed in P1 (resolve already produced
   the slot); this task's delta on buildStyleVars is formatting + tests only —
   explicitly re-verified both gating conditions in the new tests.
3. Hostile-body SSR test relies on resolve.ts dropping the slot to `null`
   (warning path) — the css-level per-slot gate is additionally pinned by
   css.test.ts's mixed-slot vectors, so neither layer alone was trusted.
4. Task 8's stalled `cr` rate limit did not recur: Task 9's run completed on
   first attempt (~3 min, 0 findings).
5. No preview consumers needed changes: `mini-theme-preview.tsx` uses only
   `buildStyleVars` (two-arg form untouched); grep confirmed no other
   `buildFontFace` callers.



---

# SECTION: 2026-10-29-event-themes-p3

## .superpowers/sdd/2026-10-29-event-themes-p3

### .superpowers/sdd/2026-10-29-event-themes-p3/evidence/task-0-report.md

# Task 0 — Pre-flight report (2026-10-29)

Branch: `feat/event-themes-p3` @ `2227c2c92d33deaa3ac1277b9120630d8c0efbd9` (= local `main` tip, `2227c2c` merge of PR #32, P2 tip wave included via `f92a5ce`).
Created with `git checkout -b feat/event-themes-p3` + one `git reset --hard main` re-anchor (initial checkout inherited a detached HEAD at `f92a5ce`; fast-forwarded, no commits lost). Working tree clean. Never pushed.

## Baseline gates (all on the new branch)

| Gate | Command | Result |
|---|---|---|
| TypeScript | `pnpm exec tsc --noEmit` | exit 0, **0 errors** |
| Unit tests | `pnpm exec vitest run` | **524 passed (524) / 42 test files passed** — matches P2 post-fix-wave baseline exactly |
| Lint | `npm run lint` | exit 0 — **0 errors, 20 warnings** (pre-existing `no-unused-vars` set) |
| DB reset | `pnpm exec supabase db reset` | clean 001→**081** (`081_seed_preset_typography.sql`); `supabase_migrations.schema_migrations` = 83 applied rows, max version `081`; seed + container restart OK |
| Dev serve | plan Task 0 item | `pelikat-web-web-1` container up (started 2026-10-29T04:17Z), 0.0.0.0:3000→3000, bind-mounts `/home/hfizmzr/pelikat/pelikat-web → /app`; `GET /` → 200 `<title>Pelikat</title>`, `GET /runner` → 307 (anon → auth, expected); serves the branch working tree via the mount |

## Spec path fact (plan §Spec anchor)

`docs/event-themes-design.md` lives at the **workspace root** `/home/hfizmzr/pelikat/docs/event-themes-design.md` (254 lines total), NOT inside `pelikat-web/`. Plan's `../../docs/event-themes-design.md` from the plan file resolves correctly.

- **§5.2 Modules (`src/lib/theme/`)**: spec lines **123–132** (10 lines) — module table for `color.ts`, `resolve.ts`, `labels.ts`, `css.ts`, `validate.ts`.
- **§5.3 Runtime application — two-tier injection, zero FOUC**: spec lines **133–142** (10 lines) — `EventThemeScope`, static stylesheet, token whitelist by construction, surfaces incl. bib pass (P3) + future public `/events/[slug]`.

## SDD workspace

- Ledger: `/home/hfizmzr/pelikat/.superpowers/sdd/2026-10-29-event-themes-p3/progress.md` (first line `# SDD ledger — plan: docs/superpowers/plans/2026-10-29-event-themes-p3.md`).
- Evidence dir: `/home/hfizmzr/pelikat/.superpowers/sdd/2026-10-29-event-themes-p3/evidence/` (this file).

## Concerns (≤5)

1. **Detached-HEAD inheritance:** the new branch initially started from detached `f92a5ce`; fixed by `git reset --hard main` before any work — flag so later tasks know `f92a5ce` is the P2 wave commit *inside* main history, not a separate base.
2. **Lint warnings:** exactly 20, all pre-existing unused-vars style warnings; no error threshold risk, but later tasks adding files should not push the warning count up (report delta per task).
3. **Node_modules volume:** the dev container's `node_modules` lives in a Docker volume; if later tasks add dependencies, the container volume and the host tree can drift — check before assuming hot-reload sees a new dep.
4. **db reset is destructive by design** (drops local data + reseeds); any manual local test data created by later tasks must be recreated after each reset.
5. Cloud apply for migration 082 stays deferred to Task 8 per plan (nothing pushed to cloud or git in this task).


### .superpowers/sdd/2026-10-29-event-themes-p3/ledger.md

- PR33 fix wave: threads xA(exPgA)+xPgL fixed... commit 31cce22


### .superpowers/sdd/2026-10-29-event-themes-p3/pr33-fixwave-report.md

# PR33 CodeRabbit Fix Wave — Evidence

Commit: `31cce22` on `feat/event-themes-p3` (parent 3d0ca10)
Message: `fix(theme): gate copy-link + register CTA on event status (PR33 threads)` (exact)

## FIX 1 — thread PRRT_kwDOSFI0as6xePgA (organizer events/[id])
File: `src/app/organizer/events/[id]/page.tsx`
- Copy Public Event Link gate: `eventDetail.slug && eventDetail.status !== 'draft'`.
- `EventDetail` already carried `status: EventStatus` — no type/column extension needed.
  Full rows are fetched (`select('*')`), so `status` is live data, not a mock gap.
- Comment updated: draft-with-slug (published-then-drafted, slug kept per
  `enforce_published_slug`) would 404 under 082 → button hidden. Analytics Link untouched.

## FIX 2 — thread PRRT_kwDOSFI0as6xePgL (runner events/[id])
File: `src/app/runner/events/[id]/page.tsx`
- Actual DOM shape differs slightly from the thread description: the page has no
  wrapping "registration card" component — the unregistered ternary branch renders
  `<RunnerRegistrationActions>` directly inside the `My Registration` section.
  Followed the code + ruling.
- Unregistered branch now: `event.status === 'published'` → `<RunnerRegistrationActions/>`
  (Register Now); otherwise (closed) → neutral card body:
  `Registration is closed for this event.` (matches page card idiom).
- Registered branch untouched: closed+registered keeps the green registered view
  (bib/payment/merch/etc.). 082 and the leaderboard scope predicate not touched;
  results_published gating remains separate (this also closes the parked F2
  closed-register UX wart).

## Tests (5 added)
`tests/theme/public-event-page.test.tsx` — organizer copy-link:
- draft + slug present → button hidden (082 would 404); page still renders
- closed + slug → button still renders (082 renders closed events)

`tests/theme/runner-event-page.test.tsx` — new describe, reg CTA gating (045):
- published + unregistered → `REGISTER-COMPONENT` (Register CTA) renders
- closed + unregistered → no `REGISTER-COMPONENT`, neutral closed body renders
- closed + registered → registered view unchanged ("See you at the start line."),
  no closed body, no register stub

## Gates
- tsc `--noEmit`: exit 0
- vitest run: **49 files / 606 tests passed** (baseline 601/601 · 49 files → +5 new, all green)
- eslint: 0 errors, 20 warnings — identical count at 3d0ca10 baseline (stashed check) → 0 new
- `cr --prompt-only --type uncommitted` run twice: both `review_completed`, findings 0
  (2nd run `--reused` cached result, same files)

## Concerns
- None blocking. Neutral copy is a new literal in the page (no theme-vocabulary key);
  consistent with existing fallback copy style ("No description available...").


### .superpowers/sdd/2026-10-29-event-themes-p3/progress.md

# SDD ledger — plan: docs/superpowers/plans/2026-10-29-event-themes-p3.md

- Task 0: implementer DONE (branch feat/event-themes-p3 re-anchored to main tip 2227c2c via reset --hard — initial checkout inherited detached HEAD at f92a5ce, no commits lost; baseline gates tsc 0 / vitest 524/524 (42 files) / lint 0 err 20 warn (pre-existing) / db reset clean 001→081 / dev container pelikat-web-web-1 serves branch via bind-mount)
- Task 1: IN PROGRESS (preview 6-key vocab)
- Task 1: implementer DONE (commits 2227c2c..b3bb8c2)
- Task 2: IN PROGRESS (082 closed policy)
- Task 2: implementer DONE (commits b3bb8c2..84cde95711f3d3ced109d594acc1ee0e67e956d4)
- Task 2: review PASS (commits b3bb8c2..84cde95, reviewed 2026-10-29; probes re-run on fresh `supabase db reset` 001→082: anon draft 0 / closed 1 / published 1, own-org draft 1, foreign-org draft 0, anon organizers 0; 078 anon draft→NULL + closed themed→resolves; 15 consumers assessed, 0 blocking — 1 low: leaderboard theme scope (scope.ts) admits closed events with results_published=true, spec §5.3 says "one published event", pre-082 equivalent-by-blindness now needs an explicit status check handed to @developer; gates re-run: tsc 0, vitest 527/527 (43 files), lint 0 errors 20 pre-existing warnings)
- Ruling: reviewer reconciliation 2026-10-29 — progress.md did not exist until Task 1 created it (Task 0 agent logged evidence/task-0-report.md only); Task 0 ledger line restored above from evidence/task-0-report.md, Task 1 lines kept verbatim; no duplicate or deleted lines
- Task 3: IN PROGRESS (surface helper)
- Task 3: implementer DONE (commits 84cde95..3e3e0fe)
- Task 3: complete (commits 84cde95..3e3e0fe, review PASS; nullable shape = manager ruling superseding plan's non-nullable)
- Task 3: review evidence 2026-10-29 (independent reviewer) — gates re-run: vitest 533/533 (44 files) + surface.test.ts 6/6 by name, tsc 0, lint 0 err / 20 warn = exact pre-existing baseline (0 surface mentions); zero-fork confirmed (pure delegation to getResolvedTheme, client-first P1 signature, no resolution logic duplicated — only the 3-line presetId normalization needed for the pre-query fast path); try/catch belt-and-braces present; JSDoc records double-resolve acceptance; {} config-only case probed: resolved platform theme + fallback labels, zero queries, no throw (sane contract — ruled correct; only nit: no dedicated (null, {}) test pin, optional rider for Task 8).
- Task 4: IN PROGRESS (full-surface labels + bib pass)
- Task 4: implementer DONE (commits 3e3e0fe..2cf85db)
- Task 4: complete (commits 3e3e0fe..2cf85db, review PASS; F1=predicate-only per manager ruling)
- Task 4: review evidence 2026-10-29 (independent reviewer) — gates re-run on 2cf85db: tsc 0 (exit 0), vitest 558/558 (48 files) incl. new tests run by name (bib-action 3, bib-page + runner-event-page 13, leaderboard-scope + safe-name 15), lint 0 errors / 20 warnings / 0 in any Task-4 file (exact pre-existing baseline). All rulings verified: R1 bib-field/CTA/run-CTA swaps via resolveLabels fallback map; R2 bib page root wrapped in EventThemeScope, theme cols in event select, inline generateMetadata cookie-client-only (no service role), null event → static FALLBACK_TITLE, try/catch degrades; R3 bibLabel prop threaded, canvas `(bibLabel ?? 'BIB NUMBER').toUpperCase()`, share title/text themed, no client theme fetch ('use client', lucide-only imports); R4 safeOrganizerName in src/lib/supabase/safe-name.ts — null-event → notFound before any service read (mock-call-ORDER test pins exact h.q sequence + fetchOrganizerName not called), helper never-throws/null-degrades, no 'use client', sole importer is the runner event server page, service-role-key test allowlist += src/lib/supabase justified (helper reaches service client only transitively through server-only service-role.ts); R5 predicate explicit status==='published' (closed+published→NOT scoped, published→scoped, draft→NOT scoped, test-pinned), dropdown intentionally unfiltered + documented in scope.ts header comment; R6 zero checkout-states/checkout changes in diff. Grep residue audited: 'BIB NUMBER' only in canvas default; 'View Digital BIB' only in checkout-states (excluded); 'Log a Run' only in run-log page (untouched surface, not a Task-4 reworked page); 'Digital BIB' in non-theme copyspaces (merch/checkin/organizer) + intentional bib metadata FALLBACK_TITLE; 'BIB Number' only in admin/registrations (untouched); fallback map = 'Bib Number' coherent. dangerouslySetInnerHTML: only pre-existing call sites (app/page js-class, bib qrSvg moved verbatim into scope, duitnow panel, scope fontFace) — all new code is text children. Known deltas (per plan, not defects): unthemed runner copy changes 'View Digital BIB Pass'→'View Bib Number' and 'Log a Run'→'Run' (fallback map is now the platform map); canvas share FILENAME still hardcodes 'BIB-' prefix (outside R3 scope); whole-directory allowlist in service-role-key test is slightly broad (mitigated by client.ts/server.ts individual no-key checks + server-only runtime guard).
- Task 5: IN PROGRESS (public /events/[slug] route + copy link)
- Task 5: implementer DONE (commits 2cf85db..1976ba9; gates tsc 0, vitest 582/582 (49 files, +24 in task-5 file), lint 0 errors / 20 pre-existing warnings (0 in task files), cr uncommitted 0 findings)
- Task 5: complete (commits 2cf85db..1976ba9, review PASS; gates re-run by independent reviewer on 1976ba9: tsc 0, vitest 582/582 (49 files) incl. public-event-page 24/24 by name, lint 0 err / 20 pre-existing warn (0 in task-5 files))
- Task 6: IN PROGRESS (metadata + viewport)
- Task 6: implementer DONE (commits 1976ba9..8e153bb; gates tsc 0, vitest 590/590 (49 files, +8 in task-6 file), lint 0 errors / 20 pre-existing warnings (0 in task-6 files), cr uncommitted review_completed 0 findings)
- Task 6: complete (commits 1976ba9..8e153bb, review PASS; gates re-run by independent reviewer on 8e153bb: tsc 0, vitest 590/590 (49 files) incl. Task-6 named tests 8/8, lint 0 err / 20 warn with 0 in task-6 files; scope exactly page.tsx + test file; static Metadata export deleted; single loadPublicEvent gate (try/catch → null, parameterized eq slug) shared by page/metadata/viewport — no code fork; og:image test-pinned equal to storageAssetUrl output, expanded https, ≠ raw bucket path, images key omitted when unthemed; themeColor = resolved.primary.light (type-correct — ResolvedTheme.primary is BrandSlot.light: string, plan's colors-wrapper shim unnecessary) / derived-platform literal oklch(0.51 0.16 190) == resolve.ts PLATFORM_SLOTS.primary.light, zero new hardcoded colors; zero service-role reads in metadata path (draft/missing → {} + h.q == ['events'] + fetchOrganizerName not called); throw-in-getter degrade pinned — metadata/viewport return sane objects; plan Risk #5 documents the accepted double-resolve contract)
- Task 7: IN PROGRESS (asset host allowlist)
- Task 7: implementer DONE (commits 8e153bb..62e1123; gates tsc 0, vitest 599/599 (49 files, +9: 4 utils / 4 validate / 1 derive-theme), lint 0 errors / 20 pre-existing warnings (0 new), cr --prompt-only review_completed 2 findings (both pre-existing/non-impacting; afterEach import fixed in-file next.config.ts constructor-typing deferred to reviewer whole-branch pass)
- Task 7: complete (commits 8e153bb..62e1123, review PASS; gates re-run by independent reviewer on 62e1123: tsc 0, vitest full 599/599 (49 files) incl. tests/theme/utils.test.ts + validate.test.ts 50/50 by name, lint 0 errors / 20 pre-existing warnings (0 in task-7 files, afterEach import used); single shared assetValueOk in utils.ts — assets.ts/validate.ts/resolve.ts all import the same fn, no local copy; https branch host-pinned via platformStorageHost reuse + exact new URL(value).host equality (userinfo `host@evil.com`, port, case normalization, suffix-spoof `fonts.gstatic.com.evil.com` all reject structurally), env-unset/malformed → false both in utils.test and validate.test, validate error message now names the storage origin; path branch byte-unchanged — ':' still off-charset so `http:`/`javascript:`/hostless-`:` values all fail (test-pinned); fonts.gstatic.com rejected for ASSET values yet bare host has no bypass (equality, not allowlist-membership) and stays valid for fonts via themeFontUrlOk; P2 smoke parity test (bucket-path themed event passes resolve+validate) present and run; derive-theme/editor/scope fixtures re-hosted to storage origin with no weakened assertions (old cdn/vault fixtures now use dedicated https pin tests); next.config.ts ITEM verified pre-existing from P2 commit 1a6d9e7 and outside tsconfig include (tsc gate unaffected) — deferred to whole-branch pass; one informational pre-existing low: editor thumbnails feed raw seeded-config https through storageAssetUrl passthrough (all other consumers sit downstream of the assetValueOk gate; write gate now closes that path))
- Task 8: IN PROGRESS (phase gate — riders)
- Task 8: smoke OK — fixtures staged (Batik pub/Wizard pub/closed/draft; category+registration seeded b1; banner metadata-object seeded; get_event_theme probes PASS); browser lanes A/B2/C2/D①-④/E/F PASS (see /tmp/opencode/p3-smoke-browser-report.md + p3-*.png); og:image SSR verified expanded storage URL; themeColor themed-vs-platform verified; zero console errors on all themed surfaces
- Task 8: teardown complete (p3-smoke-web removed; pelikat-web-web-1 healthy on original cloud env; tunnel 200; ledger stray /tmp/opencode/p3-ledger.md consolidated + deleted)
- Task 11.. legacy note: n/a
- P3 smoke discovery (PARKED, pre-existing, NOT P3): race_categories RLS 'runner sees categories for registered events' is chicken-and-egg — read policy requires registration, registration WITH CHECK requires visible category; unregistered runners get [] and cannot self-register on a clean platform. designer pass-1 discovered; developer pass-2 confirmed via REST (runner1 JWT: pre-fixture GET → 200 [] post-registration GET → 200 [category]). Needs product decision + 083-style fix on an upcoming branch.
- Task 8: rider pins (commit 3d0ca10, 601/601) + Task 8a riders (commit c7588ce) previously recorded.
- Task 8: complete (commits 62e1123..3d0ca10 riders + smoke PASS + whole-branch review MERGE READY + 082 cloud-applied 20261029082947)
- Plan complete.
- PR33: merged (fix wave 31cce22; 2/2 threads resolved w/ bot confirmation; merge sha 52d9f8829c97761ba1d58b12078c1074e1eda03f; gate: 0 unresolved + completed review on head)


### .superpowers/sdd/2026-10-29-event-themes-p3/task-1-report.md

# Task 1 report — Preview card vocabulary extension (P3)

**Status: DONE** · commit `b3bb8c2` (range 2227c2c..b3bb8c2) on `feat/event-themes-p3`

## Changes
- `src/components/theme/mini-theme-preview.tsx` — vocab line (was checkpoint · medal · bib #1234, `truncate`) now renders ALL six resolved labels in `labels.ts` `LABEL_KEYS` order (bib `#1234` slot kept, then checkpoint, medal, run, participant, certificate), wrapped (`wrap-break-word` + `leading-relaxed`, no `truncate`) so 6 entries stay visible. Still plain text children of the resolved map — zero new sanitize/resolve logic, zero new deps.
- `tests/theme/mini-theme-preview.test.tsx` (new, per plan Task 1 file list) — `react-dom/static` prerender convention from `theme-editor.test.tsx`/`event-theme-scope.test.tsx`:
  1. synthetic full 6-key `deriveTheme` fixture → all six labels + `#1234` appear;
  2. partial override → platform fallbacks fill missing keys;
  3. hostile labels with angle brackets (`<b>Bib</b>`, `<scr<script>ipt> Pingat`) → resolve-time `sanitizeLabel` already cleaned them; asserts no `<b` and no markup in output HTML, cleaned text present.

## Reused patterns
- `toHtml` prerender helper + `NEXT_PUBLIC_SUPABASE_URL` env stub copied from `tests/theme/theme-editor.test.tsx` (per-file isolation).
- `deriveTheme(presetTokens, rawConfig, presetId)` as the synthetic-ResolvedTheme factory (same as existing MiniThemePreview tests); labels come from `resolveLabels` inside resolve.ts — labels.ts untouched, single source of truth preserved.
- No other consumer touched (runner/bib pages deliberately left for Task 4).

## Verification
- `tsc --noEmit` → 0 errors
- `vitest run` (full) → **527/527 passing, 43 files** (baseline 524/524, 42 files + 3 new tests / 1 new file)
- `eslint` on both touched files → 0 (repo-wide baseline unchanged: no new warnings from these files)
- `cr --prompt-only --type uncommitted` → **completed first try, no retries, no rate limit**; 1 minor finding (overflow risk after removing `truncate` for a 40-char unbroken label) — fixed in the commit with `wrap-break-word`; 0 findings outstanding.

## Concerns
- Preview line can wrap to 2 lines at narrow card widths — visual fine-tuning is Task 8 designer smoke per instructions.
- `progress.md` / SDD dir did not exist pre-task (Task 0 not yet committed to the workspace repo); created ledger with the Task 0-pinned header line before appending Task 1 lines.


### .superpowers/sdd/2026-10-29-event-themes-p3/task-2-report.md

# Task 2 report — 082 public closed-event reads

- **Commit:** `84cde95711f3d3ced109d594acc1ee0e67e956d4` (`feat(db): 082 public reads closed events (spec §12.3)`)
- **Branch:** `feat/event-themes-p3` @ `b3bb8c2` → `84cde95` (range b3bb8c2..84cde95; 1 file, +37)
- **File:** `supabase/migrations/082_public_policy_closed.sql` (new)
- **Policy name kept:** `public reads published events` (exact name verified via `\d events` + `pg_policies` BEFORE reset — matches 019_create_rls_events_policies.sql the brief cites as 019_create_rls_policies.sql:13-20). The plan Task 2 header said "renaming to `public reads published or closed events`"; the manager brief overrides with KEEP SAME NAME (downstream deps reference it), so the name is unchanged and only the USING clause widened. Flagged in ledger concerns.

## Policy change

`drop policy if exists "public reads published events" on public.events;` + recreate with
`for select using (status in ('published','closed'))`. Post-reset `pg_policies` qual (raw):

```
          policyname           |  cmd   |                           qual
-------------------------------+--------+-----------------------------------------------------------
 organizer reads own events    | SELECT | ((organizer_id = get_my_organizer_id()) OR is_admin())
 organizer writes own events   | ALL    | (organizer_id = get_my_organizer_id())
 public reads published events | SELECT | (status = ANY (ARRAY['published'::text, 'closed'::text]))
```

Replay: `supabase db reset` clean 001→**082** (auto-replayed from migrations dir, no manual apply; seed.sql re-applied), FYI "Finished supabase db reset on branch feat/event-themes-p3."

## PII column audit — `\d events` (full column list)

id, organizer_id, name, description, event_date, location, status, created_at, reg_open,
reg_close, results_published, event_type, target_distance_km, theme_preset_id,
theme_config, slug

**No PII columns exist on events**: no contact/email/phone fields; `organizer_id` is an
opaque FK to `organizers` (whose own RLS already withholds it from anon — the
`organizer reads own profile when expired` policy yields 0 rows for anon claims), so
the widened policy exposes zero PII. Task 5 page must still select an explicit
column list per plan (name/date/location/slugs/counts only).

## Validation matrix (raw psql, seeded local DB)

Baseline pre-082 (DB at 081, same anon probes):

```
=== anon: closed seed 0021 (expect 0 rows pre-082) ===
 closed_rows | 0
=== anon: flip 0027 draft → anon select (expect 0) / published 0023 (expect 1) ===
 draft_rows 0 · published_rows 1
```

Post-082 (after reset; closed seed already exists — no tx-flip needed for closed;
draft probe uses tx flip 0027→draft then ROLLBACK):

| probe | result |
|---|---|
| anon SELECT draft 0027 (tx-flipped) | **0 rows** ✓ |
| anon SELECT closed seed 0021 (KL City Night Run 2026) | **1 row** ✓ |
| anon SELECT published 0023 | **1 row** ✓ |
| anon explicit cols `id,name,slug,event_date,location,status` on 0021 | 1 row ✓ |
| authenticated+claims organizer 011 SELECT own (0027, flipped draft) | **1 row** ✓ (organizer-own unaffected) |
| authenticated organizer 011 SELECT 012-owned DRAFT 0024 (tx-flipped) | **0 rows** ✓ (organizer-foreign unchanged) |

Raw output snippets:

```
--- anon: DRAFT 0027 (expect 0) ---          draft_rows 0
--- anon: CLOSED seed 0021 (expect 1) ---    closed_rows 1
--- anon: PUBLISHED 0023 (expect 1) ---      published_rows 1
--- anon: explicit column list on closed seed ---
 id |         name          |              slug               | event_date |             location              | status
 d0e5e000-…0021 | KL City Night Run 2026 | kl-city-night-run-2026-dc8c8c2f | 2026-09-14 | Dataran Merdeka, Kuala Lumpur | closed

--- authenticated organizer 011: own draft flip 0027 ---   own_draft_rows 1
--- organizer 011 vs 012-owned draft 0024 ---              foreign_draft_rows 0
```

(Note: an earlier probe "011 vs closed 0022" returned 1 row — expected post-082:
closed rows are public, not a policy regression. Organizer-foreign isolation re-run
with a DRAFT row shows 0 as above.)

## Gates

| gate | baseline | result |
|---|---|---|
| `tsc --noEmit` | 0 | **0 errors** |
| vitest full | 527/527, 43 files | **527/527, 43 files** (unchanged — SQL-only commit) |
| lint | 0 errors, 20 pre-existing warnings | **0 errors, 20 warnings (identical)** |
| `cr --prompt-only --type uncommitted` | — | completed, **0 findings** (review supabase/migrations/082_public_policy_closed.sql) |

Not pushed; no new dependencies. Cloud apply of 082 deferred to Task 8 (@db-specialist).


### .superpowers/sdd/2026-10-29-event-themes-p3/task-3-report.md

# Task 3 report — surface resolve helper + labels exposure

- **Commit:** `3e3e0fe` (`feat(theme): getSurfaceTheme server-side labels helper`)
- **Branch:** `feat/event-themes-p3` @ `3e3e0fe` (range `84cde95..3e3e0fe`; 2 files, +216)
- **Files:** `src/lib/theme/surface.ts` (new, 73 lines) · `tests/theme/surface.test.ts` (new, 143 lines)
- **No new deps** · no changes to EventThemeScope/resolve.ts/labels.ts (CSS-vars-only contract preserved)

## Public API

```ts
getSurfaceTheme(
  event: { id: string; theme_preset_id: string | null; theme_config: unknown },
  client: SupabaseClient,
): Promise<{ resolved: ResolvedTheme | null; labels: Record<LabelKey, string> | null }>
```

Call signature conformed to: `getResolvedTheme(supabase: SupabaseClient, eventRow: EventThemeInput): Promise<ResolvedTheme>` — client FIRST, row SECOND (resolve.ts:191-194, P1 shape). `getSurfaceTheme` passes `{ id: event.id, theme_preset_id: presetId, theme_config: event.theme_config } as EventThemeInput`, so the §4.3 `get_event_theme` RPC fallback stays unlocked (event id always carried).

## Semantics implemented (per brief)

1. **Fast path:** no preset id (null/empty) AND no usable config → `{ resolved: null, labels: null }`, returned BEFORE any client access (spy-pinned: zero `from` + zero `rpc` calls). "No usable config" = `!isPlainObject(event.theme_config)` (existing `utils.ts` helper reused) — this also converts HOSTILE non-object configs (42/'x'/Map/array) into the same zero-query null path.
2. **Resolvable:** delegates 1:1 to `getResolvedTheme` (resolution logic NOT forked) → `{ resolved, labels: resolved.labels }`. `labels` is single-source-of-truth via `ResolvedTheme` — the JSDoc contract block (surface.ts:1-12) records the double-resolve acceptance: CSS vars use `EventThemeScope`, text labels use this helper.
3. **Never throws:** whole body wrapped in try/catch → both nulls. (Belt-and-braces: `getResolvedTheme` itself never throws per spec §5.5; catch documented as the unconditional public-contract guarantee.)
4. **Not a React component:** pure async helper; server-component-safe (uses the passed client only; callers create their own `createClient()`).

## Tests (6, tests/theme/surface.test.ts — follows tests/theme/resolve.test.ts fakeSupabase stub pattern)

- null-null → both nulls + zero queries (`queryCalls` spy on `from` + `rpc`)
- hostile non-object config, no preset (42/'x'/array/Map) → nulls, zero queries, never throws
- BATIK preset row + vocab override → resolved + all-6-label map (override wins: `Nombor Larian`; preset survives: `Pingat`; platform fallbacks fill `Checkpoint/Run/Participant/Certificate`); themed `primary.light` + `DARK_FG` fgDark verified
- degraded config with preset (`primary: 'not-a-hex'`, non-string label) → resolved-with-platform tokens + warning, labels degrade to the fallback map (`Bib Number`), preset vocab survives — never nulls while resolution succeeds
- client failure (preset query throws `Error('boom')`) → resolved degrades inside getResolvedTheme, labels never null
- fuzz sweep: 5 hostile event shapes with PRESET_ID → always resolves non-null (via getResolvedTheme's own degradation), never throws

## Gates (exact)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **0 errors** (exit 0) |
| `npx vitest run` (full) | **533/533 passed, 44 files** (baseline 527/527 · 43 files + 6 new surface tests) |
| `npm run lint` | **0 errors, 20 warnings** — exactly the pre-existing baseline (Task 0/Task-2-review count); zero new, zero mentions of surface files |
| `cr --prompt-only --type uncommitted` | **review_completed, findings: 0** on BOTH files (`/tmp/opencode/cr-task3-2.txt`). NOTE: two rate_limit retries first ("all 3 included reviews used"; cleared after ~7 min backoff — see concerns) |
| Ledger | `- Task 3: IN PROGRESS (surface helper)` + `- Task 3: implementer DONE (commits 84cde95..3e3e0fe)` appended to progress.md |

## Concerns (≤5)

1. **CR rate-limit fragility:** the org has exhausted its 3 included CodeRabbit reviews (unassigned seat); reviews only clear after ~7 min+ backoff — Tasks 4-6 should expect repeated rate_limit retries each time they run `cr`.
2. **Empty-object config nuance (design note, not a bug):** `theme_config: {}` counts as "config present" (isPlainObject true) with no preset id → full resolve path runs (zero queries anyway, platform theme) instead of the null fast path. Harmless — the caller's default-render outcome is identical.
3. **Plan-doc interface variance:** plan Task 3 says `{ resolved: ResolvedTheme; labels }` (non-null); the manager brief (which expands/overrides) specifies the nullable `{ resolved | null; labels | null }` + null-null short-circuit. Implemented per brief; flagged for the reviewer.
4. **Dead-catch nuance:** because `getResolvedTheme` catches everything internally, surface.ts's try/catch is currently unreachable — kept deliberately to freeze the public never-throw contract against future refactor of resolve.ts (documented in code).
5. **Task-2 review carry-over (backlog, not Task 3):** leaderboard `scope.ts` admits closed events with `results_published=true` (spec §5.3 says "one published event") — needs the explicit status check in the Task 4/5 surface work; recorded by the Task 2 reviewer in progress.md.


### .superpowers/sdd/2026-10-29-event-themes-p3/task-4-report.md

# Task 4 report — bib-pass theming + full-surface vocabulary

- **Commit:** `2cf85db` (`feat(theme): full-surface vocabulary + bib-pass theming`)
- **Branch:** `feat/event-themes-p3` (range `3e3e0fe..2cf85db`; 12 files, +806/−123)
- **No new deps** · no new `dangerouslySetInnerHTML` (pre-existing 4 untouched; zero new — qr-svg/duitnow/css.ts font-face all pre-date this task)
- **Excluded per brief:** `payments/checkout-states.tsx` checkout copy untouched.

## Files

| File | Change |
|---|---|
| `src/app/runner/events/[id]/page.tsx` | labels via `getSurfaceTheme` (fallback `resolveLabels(null)`); `:173` bib field, `:213` `View {bib_label}` CTA, `:244` run_label (dormant-key consumer, fallback "Run") swapped; organizer name = joined name → service-recovery → 'Unknown Organizer' |
| `src/app/runner/events/[id]/bib/page.tsx` | events select extended (`id, name, event_date, location, theme_preset_id, theme_config` — cheapest shape: columns on the existing fetch, registration join untouched); root wrapped in `EventThemeScope` (no `showAssets` — vars/fonts only); header `Digital BIB` → `labels.bib_label`; ticket `BIB NUMBER` → `labels.bib_label.toUpperCase()`; canvas-literal draw unswapped (lives in bib-action-buttons); static `metadata` → simple inline `generateMetadata` (title `{event.name} - {bib_label} - Pelikat`; missing/failed row → `Digital BIB - Pelikat` fallback) |
| `src/components/events/bib-action-buttons.tsx` | new optional prop `bibLabel?: string`; canvas `fillText((bibLabel ?? 'BIB NUMBER').toUpperCase(), …)`; Web-Share title/text use `bibLabel ?? 'BIB'`; **no client-side supabase theme fetch** (prop-threaded only) |
| `src/app/runner/leaderboard/page.tsx` | events select carries `status` (needed by the predicate rows). NOTE: the `.eq('status','published')` list filter the brief mandated was REMOVED before commit — see "CodeRabbit finding" below |
| `src/app/runner/leaderboard/scope.ts` | `scopedLeaderboardEventId` predicate now explicitly `e.id === eventId && e.status === 'published' && e.results_published`; signature takes `{ id; status; results_published }[]`; JSDoc records the single-restriction ruling |
| `src/lib/supabase/safe-name.ts` (new) | `safeOrganizerName(client, organizerId)` (pure, mockable) + `fetchOrganizerName(organizerId)` binding `supabaseAdmin`. JSDoc pins POST-VISIBILITY-ONLY: draft/unfound must `notFound()` BEFORE any call; unreachable/empty id → null with ZERO queries; any error → null (caller keeps fallback). Component lives in `src/lib/supabase/**` so the service-role import stays inside the lib/supabase boundary — runner pages never import service-role directly |
| `tests/security/service-role-key.test.ts` | allowlist extended: `serverDirs += join('src','lib','supabase')` (P3: the only new service-role importer is the server-only safe-name helper; intent — key never reaches a client bundle — unchanged, and there is still zero KEY usage outside service-role itself) |
| `tests/theme/leaderboard-scope.test.ts` | EVENTS rows carry `status`; new pins: closed+results_published → NOT scoped; draft+results_published → NOT scoped |
| `tests/theme/bib-page.test.tsx` (new) | prerender: themed → scope vars wrap the pass + `Nombor Larian`/`NOMBOR LARIAN` markup + zero 'Digital BIB' residue; unthemed → no scope DOM + `Bib Number`/`BIB NUMBER` fallbacks; missing registration/event → notFound; generateMetadata 3 cases (themed / missing → fallback title / unthemed → `Night Run - Bib Number - Pelikat`) |
| `tests/theme/runner-event-page.test.tsx` (new) | prerender with stubbed heavy children: label swaps (`Nombor` field, `View Nombor` CTA, virtual `Larian` replaces `Log a Run`), join-name → service fetch SKIPPED, service null → 'Unknown Organizer', no-theme → `View Bib Number` fallback; ORDER guard: exact sequence `['runner_profiles','events']` then abort — no `service:organizers`, no `registrations` (draft never reaches a post-visibility read); happy path pins service call strictly AFTER the event-row query |
| `tests/theme/bib-action-buttons.test.tsx` (new) | props contract on the client comp: canvas uses uppercased prop (`NOMBOR LARIAN`), absent prop → verbatim `BIB NUMBER`, Web-Share title/text thread the prop while canvas still uppercases |
| `tests/security/safe-name.test.ts` (new) | name resolved / row-error → null / client throws → null / empty+whitespace name → null / null id → ZERO queries / `fetchOrganizerName` delegates to the service-role client; null id → no service read |

## Key decisions

1. **Service-role alias rule conflict resolved via indirection:** `tests/security/service-role-key.test.ts` enforces "service-role imports only from `src/app/api` + `src/lib/actions`". Rather than widening the allowlist to runner pages, the runner page imports only `fetchOrganizerName` from `safe-name.ts` (which itself lives in `src/lib/supabase/`); the security test allowlist gained exactly one lib/supabase entry with a comment.
2. **Join-first short-circuit:** `event.organizers?.name || await fetchOrganizerName(...)` — organizers RLS (019) has no public SELECT so runners always take the service path, but owner/admin renders skip the RLS bypass entirely (fewest service-role reads possible).
3. **CodeRabbit finding (major, fixed pre-commit):** attempt 1 put `.eq('status','published')` on the leaderboard events-list query per the brief's literal wording. `cr --prompt-only --type uncommitted` (attempt 3) flagged it: a `closed` event with `results_published` would vanish from the leaderboard — `resultsLocked` flips true and its published rankings become unreachable even via direct `event_id` link. Fixed by removing the list filter (the brief's own "do not double-filter confusingly — minimal coherent fix" clause); the published restriction lives ONLY in `scopedLeaderboardEventId` (theme scoping). Re-reviewed: **0 findings**. Predicate test semantics unchanged (closed+published → not scoped still pinned).
4. **Metadata:** simple inline `generateMetadata` kept trivial per brief ("if trivial" ruling); it re-reads the event row through the anon client (standard Next separate-fetch pattern; no cacheComponents here so params-in-generateMetadata is the supported idiom — verified against `node_modules/next/dist/docs`), never touches service-role, and degrades to the static fallback title.
5. **Label copy deltas (platform fallback):** `BIB Number` → `Bib Number`, `View Digital BIB Pass` → `View Bib Number` when unthemed — brief-sanctioned swaps (`resolveLabels(null)` fallback map is the vocabulary source of truth).
6. **React text children only:** all label renders are plain children (`{labels.bib_label}`, `View {labels.bib_label}`); the only SSR `<!-- -->` separators belong to React's text-node boundaries, not markup injection.

## Gates (exact)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **0 errors** (exit 0) |
| `npx vitest run` (full) | **558/558 passed, 48 files** (baseline 533/533 · 44 files → +25 tests across 4 new files + 2 added leaderboard-scope assertions) |
| `npm run lint` | **0 errors, 20 warnings** — exact pre-existing baseline; `0 findings` in repo-under-review `tests/(theme\|security)` |
| `cr --prompt-only --type uncommitted` | attempt 3 (rate-limit retries at ~7 min ×2 within tolerance): **1 major finding → fixed**; attempt 4 re-run: **0 findings, review completed** |


### .superpowers/sdd/2026-10-29-event-themes-p3/task-5-report.md

# Task 5 Report — Public `/events/[slug]` route + Copy Public Event Link

**Status:** DONE · **Commit:** `1976ba9` · **Range:** `2cf85db..1976ba9` (branch `feat/event-themes-p3`)

## Files changed

| File | Change |
|---|---|
| `src/app/events/[slug]/page.tsx` | NEW — public route (app root, NO `(auth)` group; server component, Next-16 `params: Promise<{slug: string}>` awaited) |
| `src/components/events/copy-public-link-button.tsx` | NEW — `'use client'` clipboard button (bib-action-buttons writeText + consent-page transient-copied precedent) |
| `src/app/organizer/events/[id]/page.tsx` | MOD — `slug: string \| null` added to `EventDetail`; "Copy Public Event Link" button in the header region (147–159), after `EventSettingsPanel`; URL via the `hitpayRedirectUrl` fallback chain (`NEXT_PUBLIC_TUNNEL_URL` → `NEXT_PUBLIC_APP_URL` → `http://localhost:3000`); button rendered only when `slug` exists |
| `tests/theme/public-event-page.test.tsx` | NEW — 24 tests (public page + organizer copy-link) |

## Contract conformance

- **Select is explicit** (review focus #1): `id, name, description, event_date, location, status, event_type, target_distance_km, reg_open, reg_close, results_published, theme_preset_id, theme_config, slug, organizer_id` — verified against schema (003/044/051/067/077); no protected organizer columns touched.
- **Visibility:** missing row → `notFound()`; `status === 'draft'` → `notFound()` EXPLICITLY at the app layer regardless of session; published/closed render.
- **Slug handling:** loose validation (non-empty string; missing/empty → `notFound()` before any query); hostile segments (`..`, `..%2f..%2f`, `%2e%2e`, `%00`, NUL char, 300-char, unicode) go RAW into the parameterized `.eq('slug', slug)` → 0 rows → `notFound()`; test pins `lastEq = {col:'slug', val:<raw>}`.
- **Service-role order** (safe-name contract): `fetchOrganizerName` awaited only AFTER the event-row gate; sequence log pins `h.q = ['events']` with zero service calls on draft/missing rows (Task 4 mock-order pattern). Organizer name resolves → "Organized by" line; name null → line + fallback copy omitted entirely (no "Unknown Organizer" residue — review focus #3).
- **Theming:** `EventThemeScope event={row} showAssets` (public showcase → assets opt-in per plan Task 5 text; banner/logo rendered by the scope through its resolved asset slots — no direct ThemedImage calls in the page).
- **CTAs:** `results_published` → "View Leaderboard" → `/runner/leaderboard?event_id={id}`; reg window open (published + inside reg_open/reg_close, null bounds lenient) → "Register" → `/runner/events/{id}`; closed/reg-closed events show neither. Virtual events get a `Virtual Run · {km} km` chip.
- **Zero `dangerouslySetInnerHTML`** introduced (labels/assets all handled by pre-existing scope internals).

## Brief-over-plan ruling (flag for reviewer)

Plan Task 5 says "labels-from-getSurfaceTheme (double-resolve contract)"; the manager brief says "keep modest, ZERO label conventions needed beyond data display". Followed the brief: the page calls NEITHER `getSurfaceTheme` NOR `resolveLabels` — the public page has no vocabulary display slot (no bib field, no run CTA; leaderboard/register CTAs are not vocabulary keys), so the resolver call would be dead code. Task 6 will be the public page's `getSurfaceTheme` consumer (generateMetadata/generateViewport), restoring the double-resolve contract. Nothing hardcodes vocabulary strings.

## Gates

- `tsc --noEmit` → **0** (exit 0)
- `vitest run` → **582 passed / 582 (49 files)** — baseline 558/558 (48 files) + 24 new in `tests/theme/public-event-page.test.tsx` = 582, +1 file
- `eslint` → **0 errors, 20 warnings** (exact pre-existing baseline; 0 in any Task-5 file)
- `cr --prompt-only --type uncommitted` → review completed, **0 findings** across all 4 files (first run)

## Next-16 params API confirm

`params: Promise<{ slug: string }>` + `await params` verified against `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` (docs pin the promise-prop + `await`/`use` semantics; `dynamicParams` doc not needed here).

## Test coverage pinned

- published ✓ renders; closed ✓ renders; draft → notFound; missing row → notFound
- service-order: service call after `events` query; draft/missing → `h.q == ['events']`, zero service calls
- hostile slugs ×7 → notFound, raw-parameter eq pinned, no crash, no service call
- empty/missing slug key → notFound BEFORE any query (`h.q == []`)
- results_published → leaderboard link; open window → register link; closed/outside window → no CTAs; virtual distance chip
- organizer page: slug → "Copy Public Event Link" renders; slug null (draft) → no button, page renders; hidden row → notFound

## Concerns (≤5)

1. **Labels ruling** — brief-over-plan as flagged above; if @manager wants the plan's literal "labels-from-getSurfaceTheme" resolution in Task 5, it belongs in Task 6's metadata work anyway.
2. **appUrl fallback chain** uses `NEXT_PUBLIC_TUNNEL_URL || NEXT_PUBLIC_APP_URL || 'http://localhost:3000'` (brief said only `NEXT_PUBLIC_APP_URL`) — matched the repo's only public-URL precedent (`hitpayRedirectUrl`) so dev-tunnel share links work; trivially sliced if @manager prefers the literal env.
3. **Register CTA target** is `/runner/events/{id}` (brief). The runner page surfaces its own registration flow, so the public page deliberately does not duplicate category selection.
4. **Organizer draft rows can still have slug NULL while non-owner organizers read them via existing RLS** — the button hides correctly; no leak (nothing about the public page is reachable for drafts).
5. Not committed to, no push (per instructions) — review/merge left to @reviewer/@manager.


### .superpowers/sdd/2026-10-29-event-themes-p3/task-6-report.md

# Task 6 Report — Public metadata + themeColor viewport

**Status:** DONE · **Commit:** `8e153bb` · **Range:** `1976ba9..8e153bb` (branch `feat/event-themes-p3`, HEAD was `1976ba9` before work)

## Files changed

| File | Change |
|---|---|
| `src/app/events/[slug]/page.tsx` | MOD — static `Metadata` export **deleted** (Next semantics: cannot export both `metadata` + `generateMetadata` per `node_modules/next/dist/docs/…/generate-metadata.md`'s "Good to know"); added shared `loadPublicEvent(slug)` loader (same explicit-column SELECT `id, name, description, …, slug, organizer_id`, same visibility matrix `!event \|\| status==='draft'` → null, try/catch → null) used by page + `generateMetadata` + `generateViewport`; `resolvePublicTheme` = `getSurfaceTheme(event, supabase)` with `deriveTheme({}, null, null)` as the pure platform fallback (always a full `ResolvedTheme`); `generateMetadata` → `{}`, or `{ title: event.name, description: event.description ?? 'View public event details', openGraph: { title, description, images: [storageAssetUrl(banner)]? }, twitter: { card: 'summary_large_image' } }`; `generateViewport` → `{ width: 'device-width', initialScale: 1, themeColor: resolved.primary.light (string, always) }`; page body now consumes the shared loader (behavior identical, `fetchOrganizerName` still strictly post-gate) |
| `tests/theme/public-event-page.test.tsx` | MOD — 8 new tests (32 total in file, 590 total suite) |

## Contract conformance

- **Next 16.3.8 API verified** before coding against `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md` + `generate-metadata.md`: `params: Promise<{slug}>` + `await params`; `Viewport.themeColor` = string | `{media?,color}[]`; exporting both static `metadata` and `generateMetadata` is forbidden → static export deleted; `generateViewport` never auto-populates from `metadata`.
- **Draft/missing → NOT-generated metadata, not a 500:** `generateMetadata` returns `{}` (degrade-silent) when the loader gate returns null; the loader try/catches everything (`createClient()` + query surprises → null), so no throw can escape. `generateViewport` degrades to the platform themeColor for the same paths. Next's `notFound()` stays in the page component.
- **og:image:** `storageAssetUrl(resolved.assets.banner)` only — the EXPANDED `https://…/storage/v1/object/public/event-themes/…` form; tested to NOT equal the raw bucket path; no banner (unthemed/degraded config) → `images` key omitted entirely (Next default). No string splicing of raw config anywhere; `storageAssetUrl` imported from `src/lib/theme/assets.ts`.
- **themeColor always a string:** themed → `resolved.primary.light` (the resolved HEX converted to oklch by the resolver); unthemed/degraded → platform literal `oklch(0.51 0.16 190)` (single source: `deriveTheme({}, null, null)` — no duplicated constant). One value, no media variants (no 30-browser bake-off).
- **Runner page untouched** (its static metadata export stays); service-role `fetchOrganizerName` is never reachable from metadata/viewport paths (test-pinned: draft/missing → `h.q == ['events']`, zero service calls).
- **Double-resolve safety (review focus #5):** every generator path flows through `getSurfaceTheme` (never throws) and `deriveTheme` (never throws); test (d) pins a hostile `theme_config` whose getter throws — metadata returns platform metadata and viewport the platform color with zero throws.
- **Zero `dangerouslySetInnerHTML`**, no new deps, never pushed.

## Tests added (8, all in `tests/theme/public-event-page.test.tsx`)

1. themed → og:image == `storageAssetUrl(bucket path)` (expanded https), title/description from event row, twitter card pinned
2. themed → viewport themeColor == `oklchToString(hexToOklch('#0f9b9b'))` (string-typed)
3. unthemed → og images omitted, themeColor == `oklch(0.51 0.16 190)` (platform literal pin)
4. unthemed, `description: null` → fallback description `'View public event details'`
5. draft → `generateMetadata` resolves `{}`, `h.q == ['events']`, lastEq = slug pinned, zero service fetches
6. missing row → same degrade + zero service fetches
7. draft → viewport themeColor = platform literal (never undefined)
8. resolve throws internally (throwing-getter theme_config) → metadata + viewport degrade, never throw

## Gates (exact)

- `tsc --noEmit` → **0** (exit 0)
- `vitest run` → **590 passed / 590 (49 files)** — baseline 582/582 (49 files) + 8 new in the task-5 test file = 590, no new files
- `npm run lint` → **0 errors, 20 warnings** (exact pre-existing baseline; 0 mentions of the two task files)
- `cr --prompt-only --type uncommitted` → `review_completed`, **findings: 0** across the 2 reviewed files (attempt 3; two `rate_limit` hard-cap retries at ~6.5 min and ~7 min backoff first — same org cap Task 3 hit)

## Plan-vs-brief reconciliation (none behavioral)

- Plan literal says `themeColor: resolved.colors.primary.light as string`; the actual `ResolvedTheme` shape (types.ts) has no `colors` wrapper — the field is `resolved.primary` (`BrandSlot.light: string`). Brief says `resolved.tokens.primary.light`. Used the type-correct `resolved.primary.light` (same value; no cast needed). If @manager prefers the brief's `{ color: … }` array object form, the rendered `<meta>` is identical (only differs when a `media` key is set, which both texts explicitly forbid) — trivially switchable.
- Brief's `{color:'#0f9b9b'}` example was an illustration of "string not undefined"; the real output is the resolver's oklch string (platform default is itself `oklch(0.51 0.16 190)`), test-pinned.
- `width: 'device-width', initialScale: 1` included per brief item 2, Next-doc shape; identical to Next's built-in defaults (harmless).

## Concerns (≤5)

1. `generateMetadata` re-runs the events SELECT (and `getSurfaceTheme` may hit `theme_presets`) — the accepted P3 double-resolve contract (page + metadata + viewport); the preset-column fast path (`null preset + null config`) stays zero-extra-query.
2. Draft/missing slug now costs one extra anon events query per request (metadata/viewport gate before the page's notFound) — required by the brief's "same gate" wording; no service-role read is reachable there.
3. `generateMetadata` returns `{}` on draft/unknown slug rather than calling `notFound()` — Next then renders the 404 with whatever layout-level metadata applies; pinned by `resolves.toEqual({})`.
4. CodeRabbit rate-limit: org cap (3 included reviews, unassigned seat) surfaced again; cleared on attempt 3 after backoff — Task 7/8 implementers should budget retries.
5. Not committed to, no push (per instructions) — review/merge left to @reviewer/@manager.


### .superpowers/sdd/2026-10-29-event-themes-p3/task-7-report.md

# Task 7 report — asset URL host allowlist (storage origin only)

Branch `feat/event-themes-p3`, commits `8e153bb..62e1123` (single commit `62e1123 feat(theme): asset URL host allowlist (storage origin only)`).

## Change (smallest sufficient)

`src/lib/theme/utils.ts` `assetValueOk`: the `https://` branch no longer passes indiscriminately — the URL's `host` must equal `URL(NEXT_PUBLIC_SUPABASE_URL).host` (reusing the existing `platformStorageHost()` helper; `null` on unset/malformed env → reject, parity with `themeFontUrlOk` §5.4 behavior). Bucket-path branch unchanged ([A-Za-z0-9/_.-]+, no `..`). `src/lib/theme/validate.ts` error message updated to name the origin pin.

## Consumers verified safe-by-construction (no code changes)

- `validate.ts:244` + `resolve.ts` asset() — both already import the ONE shared `assetValueOk` (no local copies exist; grep-proven across src+tests).
- `assets.ts` `storageAssetUrl` — its existing `assetValueOk` re-check covers bucket paths; its `https://` passthrough only ever receives resolve-approved values (resolve nulls hostile hosts first + warning), and its own test pins the legacy/external passthrough contract. `cleanupThemeAssets` is basename-based (no `assetValueOk`), external refs unaffected.
- Editor flows untouched: assets draft are bucket-relative `result.path` (076-legal on any origin) — branch-1 pin cannot affect them.

## Tests (+9 → 599/599 · 49 files; baseline 590/590 · 49)

`tests/theme/utils.test.ts` new `assetValueOk` describe: bucket paths accept (incl. `assetPath` shapecrafted paths, plus `..`/space/`javascript:`/`http:`/junk rejects); storage-origin https accept; **REJECT `https://evil.com/a.png`**, **REJECT `https://fonts.gstatic.com/s/foo.woff2`** (asset-kind distinction from `themeFontUrlOk`), suffix-spoof host reject, http-scheme reject, env-unset/malformed reject (themeFontUrlOk parity).
`tests/theme/validate.test.ts` new describe: storage-origin https asset → ok; hostile https → `assets.*` error (blocks Save) incl. the gstatic asset-kind distinction; env-unset parity; **P2 smoke parity** — themed event with bucket-path assets passes resolve+validate. FULL fixture's `logo_url` switched to a bucket path (env-independent).
`tests/theme/derive-theme.test.ts`: env stub added; hostile-https resolve → slot null + warning + no override key; storage-origin https fixtures; merge-semantics fixture re-hosted.
Fixture re-hosts (old "external https acceptable" pins → storage origin, semantics unchanged): `event-theme-scope.test.tsx` ASSETS_CONFIG, `theme-editor.test.tsx` Task-10 img-src test. Untouched by design: `assets.test.ts` storageAssetUrl passthrough + cleanup external-ref tests, `themed-image` raw-src tests, fonts (gstatic stays valid for `themeFontUrlOk` only).

## Gates (exact)

- `tsc --noEmit`: 0 errors.
- `vitest run`: **599/599 · 49 files** (baseline 590/590 · 49; +4 utils, +4 validate, +1 derive-theme).
- `eslint`: 0 errors / 20 warnings — identical pre-existing baseline (checked via stash diff; 0 in task-7 files).
- `cr --prompt-only`: review_completed, 2 findings, both pre-dating this task and non-impacting:
  1. `theme-editor.test.tsx:321` `afterEach` unimported — vitest `globals: true` (vitest.config:9) so this cannot throw; fixed anyway (import added) as free hardening in a file already diffed.
  2. `next.config.ts:16` constructor-signature type strictness — `next.config.ts` is outside `tsconfig.json` include, so the repo's own tsc gate never type-checks it; pre-existing from branch commit 1a6d9e7 (Task 11), passed all branch gates → left for @reviewer whole-branch pass.

## Concerns

1. All legacy/external https asset values written before this task (DB rows) now degrade to reserved-box fallback on resolve — acceptable per §5.5; no DB migration in scope.
2. App-layer write gate is now stricter than the 076 DB CHECK (which still accepts any https `assets.*` value) — intentional app-layer tightening per plan Task 7; DB untouched (out of coder scope).


### .superpowers/sdd/2026-10-29-event-themes-p3/task-8-report.md

# Task 8 report — phase-gate riders (seed.sql addendum, spec reconciliation, §12 addendum)

- **Commit:** `c7588ce` (`fix(db): seed.sql ships event-themes bucket policies on reset`) — range `62e1123..c7588ce`, single file `supabase/seed.sql` (+83)
- **Branch:** `feat/event-themes-p3` @ `62e1123` verified, Direct In-Place

## Rider 1 — seed.sql addendum (closes P2/P3 carried gap: local reset lacked helper/policies)

Appended §23 "EVENT-THEMES STORAGE" at the END of `supabase/seed.sql` (before final `commit;`),
copying verbatim from `supabase/setup-storage.sql` the tenancy-validator comment block + `create or
replace function can_manage_theme_path(p_name text)` + the 4 drop-guarded policies on
`storage.objects` bucket `event-themes` (insert/select/update/delete), drop-guards intact (whole-file
replay survives a SECOND execution, P1 Task 14 failure-mode style). setup-storage.sql untouched (not
moved/duplicated — it remains the authority; noted in the §23 header). The bucket itself already
ships in seed.sql §1 (full config upsert, P1).

### Validation — `supabase db reset` clean replay 001→082 + seed

`supabase db reset` on `feat/event-themes-p3`: all migrations 001→082 applied, seed re-applied,
"Finished supabase db reset on branch feat/event-themes-p3." — no errors.

### psql probes (local 54322)

- `select to_regproc('public.can_manage_theme_path')` → `"public.can_manage_theme_path"` (not null ✓)
- `select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname ilike '%theme%'` → **4** ✓
- Can-manage transaction test (role `authenticated`, JWT claims `{app_metadata:{organizer_id:"d0e5e000-…-011"}}` — smoke organizer shape, ROLLBACK'd):
  - `can_manage_theme_path('organizers/d0e5e000-…-0011/events/d0e5e000-…-0021/banner-v1.png')` → **t** ✓
  - forged event uuid `f1a5e1c0-…-0001` path → **f** ✓
  - other organizer's own-event path (012/0022 under claims 011) → **f** ✓
  - real `insert into storage.objects (bucket_id,name) values ('event-themes','organizers/…-0011/events/…-0021/banner-v1.png')` as `authenticated` → **INSERT 0 1** (insert policy `with check` passes under RLS) ✓; rolled back.

## Rider 2 — spec reconciliation (/home/hfizmzr/pelikat/docs/event-themes-design.md, outside repo — NOT git-added)

Two lines edited, nothing else:

- §6 line 162, final text: `... badge_icon ≤ 256 KB` · `font ≤ 3 MB (woff2)` (reconciled 2026-10-29: shipped FONT_LIMIT = 3_145_728; original 300 KB sized before woff2 subsetting analysis). `allowed_mime_types`: ...
- §13 line 253, revision ③, final text: `... ③ bucket cap 10 MB (cert bg ≤8 MB, banner ≤2 MB, logo ≤512 KB, badge ≤256 KB, font ≤3 MB (woff2) — reconciled 2026-10-29 to shipped FONT_LIMIT = 3_145_728 (was 300 KB)); ④ ...`

## Rider 3 — §12.3/§12.6 addendum (fresh-DB re-run performed, cited below)

### §12.3 — 082 policy matrix (re-run on this task's fresh reset, tx probes then ROLLBACK)

Via `set local role` + `set local request.jwt.claims`:

| Probe | Expect | Got |
|---|---|---|
| anon SELECT draft 0027 (tx-flipped) | 0 | **0** ✓ |
| anon SELECT closed seed 0021 (KL City Night Run 2026) | 1 | **1** ✓ |
| anon SELECT published 0023 | 1 | **1** ✓ |
| authenticated org 011 SELECT own draft 0027 | 1 | **1** ✓ |
| authenticated org 012 SELECT foreign draft 0027 | 0 | **0** ✓ |

(matchs task-2-report raw evidence 2026-10-29; re-run here post-rider because seed.sql changed)

### §12.6 — public-page visibility contract summary (tests/theme/public-event-page.test.tsx, 49 files / 599 tests all passing)

- **published + closed render:** `published event → renders name, date, location, organizer (200 render)` / `closed event → renders too (§12.3 public closed reads)`
- **draft + missing → 404 even owner-authed (public route has no owner concept):** `draft event → notFound EVEN with a resolvable row (public route denies drafts)` / `missing row (RLS-hidden / unknown slug) → notFound`
- **hostile slugs ×7** (`'..'`, `'..%2f..%2f'`, `'%2e%2e'`, `'%00'`, NUL byte, 300-char, unicode) → `it.each` `slug %j → parameterized eq → notFound, no crash, no service call` — each lands verbatim in the parameterized `eq('slug', bad)` filter, no string surgery, `q == ['events']`, `fetchOrganizerName` never called; plus `empty/missing slug → notFound BEFORE any query`
- **zero service reads pre-visibility:** `draft event → notFound BEFORE any query beyond the event row, zero service calls` / `missing row → zero post-visibility queries, zero service calls` (also the ORDER guard visible-event case: service name fetch runs only AFTER the events query)

### 082 checksum note — sha256 BEFORE any cloud apply (cloud still pending)

`sha256sum supabase/migrations/082_public_policy_closed.sql` (as committed at 84cde95, unchanged):

```
1cd9cffcd1503b1de3399ea98e8acba49369779ed47f5b7b30d861d918aeb93a  082_public_policy_closed.sql
```

This is the file hash for the @db-specialist cloud md5/sha256 gate, recorded before any cloud apply — cloud migration history probe still pending.

## Gates

`tsc --noEmit` 0 · `vitest run` **599/599 (49 files)** — unchanged from Task 7 baseline (SQL/doc-only rider, no test count change) · `npm run lint` 0 errors / 20 pre-existing warnings (exact baseline) · `cr --prompt-only --type uncommitted` **review_completed, 0 findings** on `supabase/seed.sql` (rate-limited twice ×recoverable at ~13:52/…, third attempt after ~3 min backoff completed).

Ledger line appended to progress.md: `- Task 8: IN PROGRESS (phase gate — riders)`.



---

# SECTION: 2026-10-29-event-themes-p4

## .superpowers/sdd/2026-10-29-event-themes-p4

### .superpowers/sdd/2026-10-29-event-themes-p4/evidence/task-0-report.md

# Task 0 report — raw evidence (2026-10-29)

## pelikat-api
=== git state (api) ===
master == origin/master == 8eae117dd90a464b464c29ccefe94e13efe7433d
branch: feat/event-themes-p4 (from master)
HEAD log: 8eae117 docs(agents): update coderabbit merge gate with /cr-auto flow

=== git status --porcelain (api) ===
(empty — clean; no strays)

=== pytest tail (.venv/bin/python -m pytest -q) ===
======================= 282 passed, 13 warnings in 7.37s =======================
(first run of session: 282 passed, 13 warnings in 9.57s — identical count)

=== ruff tail (ruff check .) ===
ruff-exit: 1
Found 96 errors.
[*] 76 fixable with `--fix` (9 unsafe fixes available with `--fix --unsafe-fixes`).
NOTE: no ruff config file in pelikat-api (checked pyproject.toml, ruff.toml, .ruff.toml, setup.cfg, tox.ini — none).
Rule breakdown: I001 x34, F401 x30, UP017 x12, BLE001 x7, RUF059 x5, F841 x2, B017, FURB157, FURB162, S110, SIM102, UP031.
All pre-existing; NOT fixed (Task 0 rule), reported only. System ruff at /home/hfizmzr/.local/bin/ruff; ruff not on venv.

=== migrations dirs (api) ===
(none found)

=== docker (api container) ===
pelikat-api-api-1	Up 5 hours (healthy)
(also: supabase stack containers running; docker compose -f docker-compose.dev.yml present; api NOT restarted/started by Task 0)

## pelikat-web
=== git state (web) ===
HEAD == main == 52d9f8829c97761ba1d58b12078c1074e1eda03f
branch: feat/event-themes-p4 (from main)
HEAD log: 52d9f88 Merge PR #33

=== git status --porcelain (web) ===
(empty — clean)

=== branches preserved ===
feat/event-themes-p3 still @ 31cce22b849f843182584bf3e5fc8425c087fa04
31cce22 fix(theme): gate copy-link + register CTA on event status (PR33 threads)

=== tsc (pnpm exec tsc --noEmit) ===
tsc-exit: 0 (no output)

=== vitest tail (pnpm exec vitest run) ===
 Test Files  49 passed (49)
      Tests  606 passed (606)
 Duration  6.55s

=== lint tail (npm run lint) ===
✖ 20 problems (0 errors, 20 warnings)

=== migrations tip ===
080_fix_slug_base_trailing_dash.sql
081_seed_preset_typography.sql
082_public_policy_closed.sql
→ tip = 082; 083 free for T6.

## Doc rider
plan doc docs/superpowers/plans/2026-10-29-event-themes-p4.md:
- 68c68 replaced (byte-diff exactly one line); line count unchanged at 68.
- md5 before: 65c5afe0cb358a74f1e98781abdb296a
- md5 after:  4c54edc92400fd7a04ac14013e1d0622
- new last line verified byte-clean, ends `...remain standing.\n`


### .superpowers/sdd/2026-10-29-event-themes-p4/evidence/task-1-report.md

# Task 1 Report — api theme-block contract (P4 / plan T1)

Branch: `feat/event-themes-p4` @ 8eae117 (base). Commit range: `8eae117..<new sha>` (direct in-place, nothing pushed).

## Deliverables
1. **`apps/ecert/views.py`** — additive `theme` key on `POST /ai/ecert/generate`:
   - `theme` absent or `null` → passes `theme=None` to the service (no gate, legacy path).
   - `theme` present but non-dict (int/str/list/bool/scalar) → `400 {"detail": "theme must be an object (dict) or null"}` BEFORE the required-fields check runs (required-5 gate untouched: still `{"error": "Missing required fields"}`).
   - `theme` dict (incl. `{}`) → passed through unchanged to `generate_cert` (normalization is service-side).
2. **`apps/ecert/services.py`**:
   - `generate_cert(..., theme: dict | None = None)` — additive + keyword-backward-compatible (badges' `_generate_milestone_cert` positionally compatible).
   - `normalize_theme(theme) -> dict | None` — spec §7 sanitization wall:
     - accepted top-level keys: `colors`, `certificate_background_url`, `labels`, `layout`; everything else dropped with `logging.getLogger('ecert').warning`.
     - `colors` → 5 keys (`primary/secondary/accent/background/foreground`), `^#[0-9a-fA-F]{6}$` gate (cheap regex per plan T1 wording; full color engineering is Task 3).
     - `labels` → 6 keys (`bib/checkpoint/medal/run/participant/certificate`); also accepts spec §4.2 `_label`-suffixed aliases (`bib_label` etc.) canonicalized, to avoid a cross-repo key mismatch when web's `resolveLabels` ships in T4 — noted as a normative call for @manager.
     - `layout` → `logo_url`, `badge_icon_url` (non-empty str; SSRF gate is Task 2) + `name_plate`: only `"auto"` accepted, anything else warned + kept auto.
     - malformed values (wrong types, non-HEX, >64-char labels) dropped with warnings — never raises, never 4xx/5xx.
     - empty/whitespace-only strings treated as absent (silent drop).
     - section values that aren't dicts ('red', 42, …) → section dropped with warning, NOT 400 (only malformed *top-level* theme type → 400, in the view).
     - nothing valid survives → returns `None` (renderer falls back to legacy path).
   - `_render_cert(runner_name, event_name, bib_number, event_date, theme)` extracted verbatim from the old inline block (same DejaVu fallback, same 800×600 fallback canvas, same draw calls/order) — mechanical seam for Task 3's `_render_themed`; legacy output byte-identical (PNG size pinned (800,600) in tests).
3. **`apps/tests/test_ecert_theme.py`** — 27 tests: normalizer contract matrix (valid round-trip, unknown keys, non-HEX, wrong types, >64 chars, aliases, name_plate gate, empty-string-absence, non-dict sections, non-str URL), service passthrough (legacy 800×600 byte-identical, theme=None explicit legacy, themed upload still `certificates` bucket + `certs/{reg}.png` upsert + signed URL, garbage theme never fails), view gates (theme=42/[]/"Tue" → 400 detail; absent → theme=None kwarg; dict passthrough; missing-5-with-theme still 400).

## Gates
- `docker exec pelikat-api-api-1 python -m pytest -q` → **309 passed, 12 warnings** (baseline 282 + 27 new; exact output `309 passed, 12 warnings in 6.82s` on final run).
- `ruff check .` → **96 errors (96 baseline) — delta 0**. `apps/ecert/` pre-existing 4 (2×I001 un-sorted imports, 2×BLE001 blind-except) unchanged in count; new test file contributes 0.
- `cr --prompt-only --type uncommitted` → 1 finding (major): "_render_cert never reads theme — implement themed rendering or defer the option". Intentional phase trade-off: themed rendering is **Task 3**'s deliverable per plan T3 (renderer seam + `_render_themed`); Task 1 is contract-only per plan T1. Answered by scope; no code change.
- Commit msg (exact): `feat(ecert): additive theme block contract (backward compatible)`.

## Test stub pattern
Patched `apps.ecert.services.get_supabase_client` (MagicMock storage upload / create_signed_url), same seam as `apps/tests/test_idempotency.py:49-70`; views patched `generate_cert` at `apps.ecert.views.generate_cert` (same seam as `test_api_performance.py:109-130`). Logs asserted via pytest `caplog(.at_level(WARNING, logger='ecert'))`.

## Concerns (≤5)
1. **Labels key naming ambiguity:** spec §4.2 vocabulary uses `bib_label`-style keys; plan T1 prompt enumerates `bib/checkpoint/…`. Normalizer accepts BOTH (aliases canonicalized to short keys); Task 4 (web payload) must ship one canonical set — recommend short keys (`bib`, …) since web `resolveLabels` outputs resolved label text, and note the choice in spec §7 if it drifts.
2. **`name_plate` only "auto":** per plan; Task 3's `plate_for` pure function will consume the auto polarity logic.
3. **URLs accepted at service boundary without SSRF check** — deliberate: the §7 allowlist is Task 2 (`validate_allowed_asset_url`); until then no fetch happens (renderer legacy), so zero new fetch surface in this task.
4. cr major (theme not yet applied to image) = expected Task 3 work, deferred per plan, not dropped.
5. No new pip deps; only stdlib `logging`/`re` added.


### .superpowers/sdd/2026-10-29-event-themes-p4/evidence/task-2-report.md

# Task 2 — api SSRF allowlist + stream guard (apps/ecert/assets.py, NEW)

Branch: `feat/event-themes-p4` · commit `99c673b` on top of `e818478` (msg exactly `feat(ecert): SSRF allowlisted theme asset fetcher`) · direct in-place, nothing pushed.

## Deliverables

- `apps/ecert/assets.py` (NEW):
  - `validate_allowed_asset_url(url: object) -> str` — returns `url` unchanged when allowlisted, else raises `ThemeAssetError`. Byte-exact prefix `f"{settings.SUPABASE_URL.rstrip('/')}/storage/v1/object/public/event-themes/"`; https-only; fail-closed on empty/unset `SUPABASE_URL`; rejects raw/encoded (`%2e%2e`, `%2f..`, case-insensitive) and percent-decoded `..`; whitespace/control chars; userinfo (`@` in netloc); bare bucket base; query/fragment.
  - `fetch_theme_asset(url: str, *, max_bytes: int, stream_factory=httpx.stream) -> bytes` — validates first (no network on rejection); streamed GET `timeout=httpx.Timeout(10.0, read=20.0)`, `follow_redirects=False`; non-200 (incl. 3xx) → error; declared `Content-Length` precheck; content-encoded responses refused (anti-decompression-bomb: httpx decodes before `iter_bytes`); running-cap abort mid-stream; total wall-clock deadline (`_TOTAL_DEADLINE_SECONDS = 60.0`, started before the header wait — worst case bounded to deadline + one read timeout, never unbounded); wraps `httpx.HTTPError` + `httpx.StreamError` + `httpx.InvalidURL` (verified both escape `HTTPError` in httpx 0.28.1) into `ThemeAssetError`.
  - Constants exported: `MAX_BG_BYTES = 10_485_760`, `MAX_SMALL_ASSET_BYTES = 1_048_576`.
- `apps/tests/test_ecert_assets.py` (NEW): 32 tests, zero network (stream factory injected).

## Deviations from plan wording (for review)

- Plan T2 wrote `validate_allowed_asset_url(url: str | None) -> bool`; shipped the dispatched deliverable signature `(url: object) -> str` (validate-then-return string — avoids TOCTOU double-parsing and gives callers the vetted value).
- `stream_factory` injectable param with default `httpx.stream` — flagged decision per dispatch: makes the test file NEVER touch the network without monkeypatching the httpx module itself (respx unavailable; no new deps allowed).
- CodeRabbit hardening rounds (3 review runs total, 6 findings all addressed): total deadline, Content-Encoding refusal + length precheck, `headers.get('Content-Length')` fix (httpx Headers has NO `content_length` attr — AttributeError would kill every successful fetch), fake-clock trickle test, control-char/whitespace validator rejection, `InvalidURL`/`StreamError` wrap.

## Gates

- `pytest` full: **341 passed, 13 warnings** (baseline 309 + 32 new). Labels: Type-checks green.
- `ruff check .`: exit 1, **96 errors (76 fixable)** — identical to baseline; delta **0**; `ruff check apps/ecert/assets.py apps/tests/test_ecert_assets.py` → clean.
- `cr --prompt-only --type uncommitted` (**--fresh**): first two runs = 3 majors (deadline/decoding) + 1 major (Content-Length attr, fixed) → fixed; third fresh run: 2 minors (deadline test clock, exception contract) → fixed; final fresh run: **findings: 0, review completed**. No rate limit hit.
- Tests carry full matrix: exact-prefix accept (returns unchanged string), different-bucket/sibling-bucket reject, raw+`%2e%2e`+`%2f..`+decoded traversal rejects, mixed-case prefix reject, host swap + lookalike host reject, non-https reject, userinfo reject, query/fragment reject, bare base reject, non-string reject, empty `SUPABASE_URL` reject-all, per-repo override moves the allowlist; fetch: joined bytes + pinned request shape (GET/method/url/follow_redirects False/timeout equality), no-network on invalid URL, cap one-over raise + exact-boundary pass, redirect (302) + non-200 treated as errors, timeout/`ConnectError`/`InvalidURL`/mid-`iter_bytes` `ReadError` wrapped, encoded response refused, oversized declared length rejected unread, trickle deadline via fake clock (proves in-loop check), constants pinned.

## Concerns for Task 3 owner

1. `_TOTAL_DEADLINE_SECONDS = 60.0` is a module constant invented by review (not spec'd); if an 11 MB background plus slow link approaches it in reality, revisit.
2. No content-type/mime check server-side per spec (bucket enforces) — if Pillow chokes on a mislabeled asset, `_render_safe` logging must surface `ThemeAssetError` messages from `fetch_theme_asset`.
3. `fetch_theme_asset` is NOT yet wired into `services.py`/renderer — Task 3 must call it with `max_bytes=MAX_BG_BYTES` for background and `MAX_SMALL_ASSET_BYTES` for logo/badge, and honour `ThemeAssetError` → never-fail fallback contract.


### .superpowers/sdd/2026-10-29-event-themes-p4/evidence/task-3-report.md

# Task 3 — Themed A4 Landscape Renderer (implementation report)

**Commit:** `99c673b..b582573` on `feat/event-themes-p4` — `feat(ecert): themed A4 landscape renderer with fallback`
**Mode:** TDD red→green. Test file `apps/tests/test_ecert_render.py` written first (red: `plate_for` missing), then implementation, then 4 cr fix rounds.

## Delivered

- **`plate_for(fill_lux) -> (plate_rgba, text_rgba)`** (`services.py`): pure, exported for tests.
  Light fill (≥ 0.18 linear luminance) → dark plate `(26,26,26,217)` (~85%) + white text; dark fill → white plate `(255,255,255,235)` (~92%) + near-black `(17,17,17)` text. **Constancy:** both fixed pairs composite to ≥ 7:1 for ANY fill; verified at extremes by WCAG math in tests (`TestPlateFor`).
- **`_render_themed(theme, meta) -> Image`**: 3508×2480 A4-landscape 300-DPI canvas.
  - Background: `certificate_background_url` → `fetch_theme_asset(url, max_bytes=MAX_BG_BYTES)` inside a never-fail wrapper; gate = open + header pixel-ceiling check (before `img.load()`) + ≥1600×1130 + landscape + alpha flattened (composited onto white) → `ImageOps.fit(..., (3508,2480), LANCZOS)`. Invalid/missing/fail → fallback canvas 3508×2480 = theme-coloured plain fill (`background`→`primary`→white) + subtle full-bleed two-tone accent bands.
  - Name block ≤ 60% canvas width, auto-polarity plate, ≥96px margins (actual insets 200px); logo ≤20% w / badge ≤12% w with thin keylines, height-capped (≤400px) via `fetch_theme_asset(max_bytes=MAX_SMALL_ASSET_BYTES)`, omissible per asset (warn + skip).
  - Every text field (heading label, runner name, bib number, metadata rows) is composited on its own auto-polarity backing plate — the ≥7:1 contract holds over any art, incl. mixed-luminance regions. Long values truncat­ed with ellipsis (`_ellipsize`); bib number large (240px bold) for machine scanning. Fonts: DejaVuSans/Bold from `/usr/share/fonts/truetype/dejavu/` with `load_default` degradation.
- **Never fail:** `generate_cert(..., theme)` → `_render_cert` dispatch → `_render_safe(theme, meta)` catches EVERY Exception (`# noqa: BLE001`, never-fail contract) → logs warning → legacy 800×600 canvas (`_render_legacy` = Task 1's verbatim seam). `theme` None ⇒ byte-identical legacy path (pinned by tests).

## cr rounds (uncommitted, gate = 0 findings)

1. 1st pass: 3 findings (asset height unbounded; `_ink` invisible text when only `primary`; decode-bomb pixel ceiling before `load()`).
2. 2nd: residual `_ink` case (foreground == fallback fill) → WCAG-ratio check.
3. 3rd: mixed scales (gamma 'L' vs linear WCAG) → `_srgb_to_linear` shared, `_fill_from_image` linear, `_LIGHT_FILL_LUX` 0.5→0.18 (WCAG black/white crossover).
4. 4th: (a) crossover ink pure `#000000`; (b) **major**: regional mean can't guarantee contrast on mixed art → resolved by reviewer's alternative: **backing plates behind every text field** (replaces the `_ink` heuristic entirely — `_ink` deleted; `_draw_text_plate(center=|pos=|pad=)` generalized); (c) `convert('L')` mis-weights saturated colours → `_region_lux` samples RGB channels (BOX 64×32, linearised).
5. Final `--fresh` pass: **0 findings**.

(Before the plate redesign, per-field inks used per-region sampled luminance (`_fill_from_image` strip + heading/bib/rows boxes) — preserved boxes now feed each field's plate polarity.)

## Files changed

- `apps/ecert/services.py` (+348): dispatch split `_render_cert`/`_render_legacy`; themed renderer suite (`plate_for`, `_canvas_base`, `_srgb_to_linear`, `_relative_luminance`, `_region_lux`, `_apply_pixel_ceiling`, `_decode_background`, `_fallback_canvas`, `_themed_background`, `_font`, `_ellipsize`, `_draw_text_plate`, `_paste_asset`, `_meta_rows`, `_render_themed`, `_render_safe`); imports `ImageOps` + assets symbols. `ImageStat` no longer needed (removed).
- `apps/tests/test_ecert_render.py` (NEW, 26 tests): legacy byte-identity & 800×600 & zero-fetch; canvas 3508×2480; template gate (1599×1129 ✘ / portrait ✘ / 1600×1130 ✔); cap-abort fallback; pixel-ceiling header-only PNG vectors (bg fallback + badge omit); logo/badge caps + omission warnings; `_render_safe` catch-all → legacy; plate polarity + ≥7:1 extremes; margins via ImageChops diff bbox ⊆ 96px inset; name block ≤60% + truncation; plate-per-field regression (two-tone art); tall-logo height bound; primary-only & degenerate-foreground ink regressions. All tests monkeypatch `apps.ecert.services.fetch_theme_asset` — **zero network**.
- `apps/tests/test_ecert_theme.py` (1 test de-risked): themed bucket test now stubs the fetcher (URLs would otherwise hit the network now that themed rendering consumes them).

## Gates (exact)

| Gate | Result |
|---|---|
| `pytest -q` full | **367 passed, 13 warnings** (baseline 341 + 26 new; 13 warnings = baseline count) |
| `ruff check .` | **96 = 96, delta 0** (no py config in repo) |
| changed-file ruff | services.py: 2 pre-existing (I001 import-sort, BLE001 on legacy font fallback) — new never-fail handlers use `# noqa: BLE001` with reasons; test files 0 |
| `cr --prompt-only --type uncommitted` | rate-limited once (waited 7 min, retried per plan policy) → completed; after fixes final `--fresh`: **0 findings** |
| Fonts | DejaVuSans/DejaVuSans-Bold present on host (test venv loads them system-wide); renderer degrades to `load_default` if missing, so no skip markers needed |

## Notes / concerns for reviewer

1. `plate_for` gains dual direction both modes pass 7:1 for ALL inputs — policy choice documented; `_LIGHT_FILL_LUX = 0.18` is the exact WCAG white/black crossover, so the contract holds at the boundary.
2. Fallback accent bands are full-bleed decorative background (not content) — margins contract applies to plates/text/keylines (diff-bbox probe only runs against the valid-bg path by design).
3. `_render_safe`'s catch-all keeps one `# noqa: BLE001` per never-fail handler (4 total) — intentional per spec §7 "bubbles nothing"; ruff delta stays 0.
4. Existing `test_ecert_theme.py` behaviour unchanged except making the one themed bucket test network-free; all 27 Task-1 tests still pass untouched.
5. Badge/bib layout is fixed-anchor (heading 700, plate 1180, bib 1580, rows 1800+); 4 rows max fits above the 96px bottom inset; row plates cap at `3508−2×(200+16)` wide.


### .superpowers/sdd/2026-10-29-event-themes-p4/evidence/task-4-report.md

# Task 4 report — web cert theme payload (2026-10-29)

Branch: pelikat-web `feat/event-themes-p4` (base 52d9f88). Direct In-Place, no push, no new deps.

## Files changed
- `src/lib/actions/cert.ts` — both `use server` actions now resolve the event theme via
  `getSurfaceTheme` (caller's supabase client) and spread an ADDITIVE `theme` block into the
  `/ai/ecert/generate` JSON body ONLY when the event resolves a theme. No event context /
  unthemed event → legacy 5-key payload byte-equal to today.
- `src/lib/theme/surface.ts` — ADDITIVE `tokens: ThemeTokens | null` on `SurfaceTheme`
  (the raw merged token projection; null whenever `resolved` is null). Fast path unchanged
  (zero queries). Rewired to resolve.ts's new `getResolvedThemeParts` (same resolve, one call).
- `src/lib/theme/resolve.ts` — private `resolveTheme` now returns `{ resolved, tokens }`
  alongside the derivation; public `getResolvedTheme` unchanged (returns `.resolved`).
  New public `getResolvedThemeParts` (same never-degrade contract; null only on internal failure).
  ADDITIVE `hex?: string` on `BrandSlot` (types.ts) — set by `brandSlot()` only when a themed
  fill took effect; platform-default/contrast-degraded slots omit it.
- `tests/theme/cert.test.ts` — NEW (8 tests, runtime-action test, same vi.mock pattern as
  tests/reliability/payments-action-ownership.test.ts).

## Backend contract conformance (pelikat-api feat/event-themes-p4 @ b582573)
- `theme` = `{colors:{primary,secondary,accent}, certificate_background_url?, labels:{6 SHORT keys}, layout:{name_plate:'auto'}}`.
- colors = HEX from the resolved brand slots (BrandSlot.hex — the EXACT values the resolver kept;
  contrast-degraded slots omitted so the cert fallback matches the UI). NOT sent from
  ResolvedTheme slots (oklch — Django `_HEX_RE` would drop them).
- certificate_background_url = `storageAssetUrl`-EXPANDED https URL under the
  `SUPABASE_URL/storage/v1/object/public/event-themes/` allowlist prefix (Django assets.py
  `_validate` byte-prefix gate). Failed expansion (junk asset value) → key omitted, never null.
- labels = the always-resolved 6-key vocabulary mapped to SHORT keys (`_label` suffix stripped;
  matches api `_LABEL_ALIASES` outcome; manager ruling held: web ships short keys).
- layout = `{name_plate: 'auto'}` per contract.
- font_url NEVER sent; absent values are omitted keys — no empty strings, no nulls.
- CONFLICT NOTE: plan Task 4 text said "colors from ResolvedTheme"+"resolveLabels" — ResolvedTheme
  carries oklch slots (would be dropped by the normalizer) and resolves no certificate asset slot;
  implemented per the reviewer-verified backend contract using the merged-token projection +
  BrandSlot.hex instead.

## Semantics preserved
- request success semantics unchanged (same fetchDjangoApi call, 24 h regenerative model).
- badge path without eventId / unthemed events → NO theme key (legacy byte-shape).
- virtual path theme resolution happens AFTER the ownership/completion gates (unauthorized
  runners trigger no theme queries).
- zero queries for unthemed events (getSurfaceTheme short-circuit).

## TDD flow
1. RED: tests/theme/cert.test.ts 7 failing (theme absent).
2. GREEN: implementation above → 7/7, surface.test.ts unchanged-pass (8/8).
3. CodeRabbit finding (minor, VALID): "Apply resolved-theme color degradation to certificate
   colors" — raw merged HEX shipped even when the resolver degraded a slot (contrast failures).
   Fixed by carrying `hex` on BrandSlot (set only on the branded-fill path) and building payload
   colors from the resolved slots — one field, reuses the resolver's own decision exactly;
   `overriddenKeys` was tried REJECTED (only tracks event-override leaves; preset/RPC colors
   would drop). Regression test added (8th): degraded `#777777` accent (4.42:1 companion < 4.5:1)
   omitted, primary/secondary intact.
4. Second `cr --prompt-only --type uncommitted` run: 0 findings.

## Gates (exact)
- `pnpm exec tsc --noEmit` → 0 errors.
- `pnpm exec vitest run` → **614 passed · 50 test files** (baseline 606/606 · 49 files;
  NEW: +8 tests in tests/theme/cert.test.ts, +1 file). Also ran tests/theme/ alone: 340/340.
- `npm run lint` → 0 errors, 20 warnings — file list diffed against HEAD-stash baseline:
  NO new lint files / issues.
- `cr --prompt-only --type uncommitted` — run 1: 1 minor finding (valid, fixed above);
  run 2 after fix: 1 finding = FALSE POSITIVE — the reviewer cites
  raw.githubusercontent.com/.../52d9f88/src/lib/theme/surface.ts (BASE branch commit,
  pre-change) as proof `SurfaceTheme` has no `tokens`; the uncommitted working tree defines
  `tokens` (surface.ts:47) and `pnpm exec tsc --noEmit` passes 0 errors on exactly this code,
  so the type-checking premise is void. No code change; skipped with this justification.
- Commit: `feat(theme): e-cert payload with resolved theme` (exact) = **f78c0b5**
  (range 52d9f88..f78c0b5), NOT pushed. Clean tree after commit.
- Post-commit re-verification: vitest 614/614 · 50 files, tsc --noEmit 0.

## Concerns (≤5)
1. `SurfaceTheme.tokens` + `BrandSlot.hex` are additive shared-contract changes to P3 code —
   justified as the minimal reuse (ResolvedTheme cannot serve oklch-reading needs outside CSS);
   all 341 pre-existing theme tests pass unchanged.
2. resolveTheme recomputes `mergeThemeConfig(presetTokens, config)` (pure, cheap) because
   deriveTheme owns the slots — keeps deriveTheme's public signature intact for the editor.
3. A themed event where ALL colors degrade → payload theme carries labels/layout only (colors
   key omitted) — Django fallback canvas applies; consistent with the "certificate falls back"
   instruction in the CodeRabbit thread.
4. Layout `{name_plate:'auto'}` alone is a no-op server-side (normalizer re-adds it only when
   other layout keys exist) — sent anyway per the declared contract shape (reviewer-verified).


### .superpowers/sdd/2026-10-29-event-themes-p4/evidence/task-5-report.md

# Task 5 evidence — web organizer live cert mock (P4)

Branch: feat/event-themes-p4 · base f78c0b5 → sha 0389b99
Commit msg exactly: `feat(theme): organizer live cert mock (A4 landscape themed)`

## What shipped

1. `src/components/theme/mini-theme-preview.tsx` — 4th mock (cert card) between the
   leaderboard row and the vocabulary line: `ThemedImage` with aspect
   `THEME_ASPECTS.certificate_background` (`1.414/1` — the real A4-landscape
   3508×2480 artifact ratio; plan "16:9" superseded per manager ruling),
   `src = storageAssetUrl(resolved.assets.certificate_background ?? null) ?? undefined`
   (null/junk → ThemedImage gradient reserved box), overlaid auto-polarity plate
   (`bg-background/90`) carrying: cert heading = `certificate_label` uppercase
   (bib-mock-consistent), meta rows `participant_label: Runner name` and
   `bib_label #1234` — text children only. Light/dark: uses only themed tokens
   (`text-foreground`/`text-muted-foreground`/`bg-background`), so the editor's
   existing `.dark` toggle (theme-editor.tsx:501) re-resolves it as-is; existing
   3 mocks' markup untouched.
2. `src/lib/theme/types.ts` — `ResolvedTheme.assets` gains REQUIRED
   `certificate_background: string | null` (was "not resolved until it gains a
   renderer" per the type doc — Task 5 is that renderer). Comment updated; badge
   Icon stays unresolved by design.
3. `src/lib/theme/resolve.ts` — asset() key union + both constructors
   (platformTheme:183, deriveTheme:383) now emit `certificate_background`
   (stored 076-legal shape raw; the preview does the storageAssetUrl expansion —
   same consumer-expands contract as banner/logo). getResolvedThemeParts
   docstring de-staled. mergeThemeConfig/ASSET_KEYS already carried the key.
4. Tests:
   - `tests/theme/mini-theme-preview.test.tsx` +5 tests (new P4 Task 5 describe):
     no-bg → `style="aspect-ratio:1.414/1"` + gradient box + no `<img>` + cert
     labels render; bucket-path bg → `<img src="…/event-themes/{path}">` (stored
     shape expanded); https bg passthrough verbatim; platform fallback labels
     (Certificate/Participant/Bib Number); hostile `<b>/`<i>` labels sanitized
     with cleaned text still rendering.
   - `tests/theme/derive-theme.test.ts` — 4 `assets` `toEqual` pins updated for
     the new slot + 1 new test (cert URL resolves RAW into its own slot,
     overriddenKeys tracked, no warnings).
   - `tests/theme/css.test.ts` — ResolvedTheme fixture literal gains the field.

## Gate results (exact)

- `npx tsc --noEmit` → **0 errors** (exit 0).
- `npx vitest run` → **620/620 passed · 50 test files** (baseline 614/614 · 50;
  +5 preview, +1 derive, pins adjusted net included). First run was 619/620 (one
  failure: my derive test passed the cert asset via PRESET tokens — overriddenKeys
  only tracks event-config leaves, so empty). Fixed the test vector to the
  override-config path (same shape as the banner slot pins) → green.
- `npm run lint` → **0 errors, 20 warnings = exact baseline** (no new).
- `cr --prompt-only --type uncommitted` → **0 findings**, reviewedFiles = all 6
  touched files, outcome completed (first pass, no retry needed).

## Notes for reviewer

- `resolve.ts` change was REQUIRED even though the task listed only the preview +
  its test file: `ResolvedTheme.assets` carried no certificate slot, so tsc and
  the "src present when bg set" test are impossible otherwise (types.ts doc
  explicitly deferred this slot "until it gains a renderer" — Task 5 is it).
- Required (non-optional) field chosen: matches the fully-resolved contract of
  ResolvedTheme (labels Record, Lists null-filled); only 1 extra test fixture
  literal updated (css.test.ts:38). The preview keeps the manager-specified
  `resolved.assets.certificate_background ?? null` guard verbatim.
- No new deps; no migrations; no push.


### .superpowers/sdd/2026-10-29-event-themes-p4/evidence/task-6-report.md

# Task 6 report — web SQL 083 race_categories public read

Date: 2026-10-29 · Branch `feat/event-themes-p4` (pelikat-web), tip before task: `0389b99` · commit: **`f387387`** `fix(db): 083 race_categories public read for published/closed events` (single file added, 46 insertions; seed.sql untouched).

## Change

NEW `supabase/migrations/083_race_categories_public_read.sql` (082 drop+create precedent):

```sql
drop policy if exists "public reads published event categories" on public.race_categories;

create policy "public reads published event categories" on public.race_categories
  for select using (
    exists (
      select 1 from public.events e
      where e.id = race_categories.event_id
        and e.status in ('published', 'closed')
    )
    or is_admin()
  );
```

- Comment carries the row-exposure argument (mirror of 082's): category rows are non-PII (name/gender/ages/slots/price per 004 schema); organizer_id = opaque uuid FK; registration gates remain server-enforced (045 RPC checks + registrations' own policies + 019:23 `organizer manages categories` and 019:26 `runner sees categories for registered events` UNTOUCHED).
- `-- down:` drops this policy only → restores 019 baseline.
- seed.sql: read-only check only, NO change (policy names live in migrations; §6 rows unchanged).

## Validation

`pnpm exec supabase db reset` → clean apply 001→**083** + seed + container restart OK (`083_race_categories_public_read.sql` applied).

psql matrix (`-h 127.0.0.1 -p 54322 -U supabase_admin`), role context via `SET LOCAL ROLE` + `request.jwt.claims` simulation:

| # | Probe (role/claims) | Expected | Raw result |
|---|---|---|---|
| R1 | RED pre-migration: anon total | 0 (chicken-and-egg parked bug) | `anon_total=0` |
| R2 | RED: anon closed E1+E2 | 0 | `anon_closed=0` |
| R3 | RED: anon published E3 | 0 | `anon_published=0` |
| R4 | RED: runner1 (registered via 019 policy) | 8 | `runner1_registered=8` |
| R5 | RED: organizer1 own | 10 | `org1_own=10` |
| R6 | RED: `is_admin()` simulated-claim feasibility | — | `is_admin_simulated=true` (probe WAS available via `request.jwt.claims`) |
| G1 | structural: pg_policies row | policy present | `policy=public reads published event categories cmd=SELECT roles={public}` |
| G2 | GREEN: anon total | 19 | `anon_total=19` |
| G3 | GREEN: anon closed-event categories E1+E2 (≥0; seed §5 publishes/closes past events — E1 closed has 2 cats, E2 closed has 1) | 3 | `anon_closed=3` ✅ |
| G4 | GREEN: anon published E3 | 3 | `anon_published=3` |
| G5 | anon draft probe: tx `update events set status='draft' where id=023` then anon count | 0, rollback | `anon_draft_E3=0` (rolled back) |
| G6 | registered-policy intact: flip E3→draft in tx; runner1 (registered 051→023) still sees E3 cats via 019:26 | 3 | `runner1_E3_draft=3` (rolled back) |
| G7 | rollback sanity: anon sees E3 again | 3 | `anon_E3_rollback=3` |
| G8 | organizer1 union-visible total | 19 (public rows now union with own 10) | `org1_total=19` |
| G8b | organizer1 own-subset selectable | 10 | `org1_own_subset=10` |
| G9 | is_admin() OR-clause: structural (G1 compiles/applied) + functional simulated admin claim, flip E3→draft → admin sees draft-event cats | 3 | `admin_E3_draft=3` (rolled back) |
| G10 | runner1 total (union) | 19 (was 8 pre-migration) | `runner1_total=19` |
| G11 | unregistered runner9 (0 regs) — self-registration fix | 19 | `unreg_runner9_total=19` |
| G12 | seed §6 consistency: hidden_by_status count | 0 | `hidden_by_status=`**0** |
| G13 | 019 policies untouched | 3 policies, original names | `policies=3`; `organizer manages categories | public reads published event categories | runner sees categories for registered events` |

Matrix totals: anon 19/19 visible of 19 seeded; closed 3; draft 0; runner-registered policy functional in isolation (G6); organizer owner path preserved (G8b); admin bypass functional (G9) — **note: the task budgeted "functional admin probe not available locally — structural verify only"; the simulated `request.jwt.claims` route WAS available, so both a structural (G1) and a functional (G9) verify ran. Cloud apply itself stays with @db-specialist (082 precedent, apply_migration only).**

## Seed consistency check (farshad note)

Seed §5 statuses: E1 (021) + E2 (022) = `closed` (past); E3–E10 (023…02a) = all `published`. No seed event is `draft`. Therefore every §6 category row's event is published/closed → **expected 19 exposed, none hidden (G12 = 0; no hidden-by-status exceptions to record)**.

## Gates

- `npx tsc --noEmit` → **0 errors** (exit 0).
- `npx vitest run` → **620/620 passed · 50 test files** (baseline exact, unchanged).
- `npm run lint` → **0 errors, 20 warnings** (baseline exact).
- `supabase db reset` → clean 001→083 (above).
- `cr --prompt-only --type uncommitted` → run 1 `review_skipped` (no tracked diff; migration untracked), run 2 after `git add` → `review_completed findings=0` (reviewed file: the migration). No retries needed (rate limit OK).

## Concerns / notes for @manager

1. **organizer1 sees 19 at G8, not the own-set 10** — NOT a policy change: permissive select policies union, so organizer1's select set now includes public published/closed rows too. Owner-subset fully selectable (G8b=10); behavior, not a regression.
2. **Functional admin probe used simulated JWT claims** (`request.jwt.claims`): is_admin() is plain SQL over auth.jwt(), so it resolves locally (task budgeted for structural-only — both landed). Cloud admin claims resolve identically via real JWTs; no further verification planned.
3. **seed.sql deliberately untouched**: no addendum rider needed (reset path green without it).


### .superpowers/sdd/2026-10-29-event-themes-p4/progress.md

# SDD ledger — plan: docs/superpowers/plans/2026-10-29-event-themes-p4.md
- Task 0: complete (both branches created; api master 8eae117; web 52d9f88; baselines api pytest 282 passed · ruff exit 1 (96 pre-existing, no config) · web vitest 606/606 · 49 files · tsc 0 · lint 0 err/20 warn
- api: `feat/event-themes-p4` created from master 8eae117dd90a464b464c29ccefe94e13efe7433d (= origin/master verified). `git status --porcelain` clean (empty). No migrations dirs found. pytest `.venv/bin/python -m pytest -q` → **282 passed** (13 warnings). ruff (`ruff check .`, no config file in repo) → exit 1, **Found 96 errors** (76 fixable; 9 unsafe) — all pre-existing, NOT fixed per Task 0 rules. Dev container `pelikat-api-api-1` Up 5 hours (healthy); not restarted.
- web: `feat/event-themes-p4` created from main 52d9f8829c97761ba1d58b12078c1074e1eda03f (p3 branch left untouched @31cce22). `tsc --noEmit` → 0 errors. `vitest run` → **606/606 passed · 49 test files**. `npm run lint` → **0 errors, 20 warnings** (baseline). Migrations tip = 082_public_policy_closed.sql; 083 free for T6.
- doc rider: plan doc last line replaced; byte-diff exactly 1 line (68c68). md5 before 65c5afe0cb358a74f1e98781abdb296a, after 4c54edc92400fd7a04ac14013e1d0622.
- evidence: evidence/task-0-report.md (raw command tails).
- Task 1: IN PROGRESS (api theme contract)
- Task 1: implementer DONE (commits 8eae117..e818478) — TDD red→green, 27 new tests, full pytest 309 passed (282 baseline + 27), ruff delta 0 (96=96), cr 1 major finding = intentional Task 3 deferral (see evidence/task-1-report.md)
- Task 1: complete (commits 8eae117..e818478, review APPROVED; gates verified: full pytest 309 passed 12 warnings, test_ecert_theme.py 27/27 alone, view subset 6/6, ruff delta 0 (96=96, no new errors in changed files: services+views 3 = baseline 3, new test file 0); badges caller positional-compat verified badges/services.py:224 all-kwargs; legacy path verified byte-shape: _render_cert extracted verbatim, 800x600 pinned, certificates bucket + certs/{reg}.png upsert + 24h signed URL unchanged; findings: LOW name_plate value logged in one warning (non-PII), advisory font_url:null per spec §7 would warn-spam until whitelisted, _LABEL_ALIASES recommended KEEP through T4 then drop (manager ruling: web ships short keys); evidence/task-1-report.md)
- Task 2: IN PROGRESS (ssrf fetcher)
- Task 2: implementer DONE (commits e818478..99c673b)
- Task 2: complete (commits e818478..99c673b, review APPROVED; gates re-verified: full pytest 341 passed 13 warnings, test_ecert_assets.py 32/32, ruff delta 0; rulings: validate->str KEEP, stream_factory KEEP, 60s deadline KEEP)
- Task 3: IN PROGRESS (themed A4 renderer)
- Task 3: implementer DONE (commits 99c673b..b582573) — TDD red→green, 26 new tests in apps/tests/test_ecert_render.py (plus 1 network-de-risk edit to test_ecert_theme.py themed bucket test), full pytest 367 passed 13 warnings (341 baseline + 26), ruff delta 0 (96=96; changed files carry only the 2 pre-existing I001+BLE001); cr final fresh pass 0 findings after 4 fix rounds; evidence/task-3-report.md
- Task 3: complete (commits 99c673b..b582573, review APPROVED)
- Task 4: IN PROGRESS (web cert theme payload)
- Task 4: implementer DONE (web commits 52d9f88..f78c0b5) — TDD red→green, +8 runtime tests in tests/theme/cert.test.ts, full vitest 614/614 · 50 files (baseline 606/606 · 49), tsc 0, lint 0 err/20 warn (file-set diff vs baseline = no new), cr run2 1 false positive (stale base-commit citation; surface.tokens defined, tsc proves); see evidence/task-4-report.md
- Task 4: complete (web commits 52d9f88..f78c0b5, review APPROVED with 1 LOW finding)
- Task 5: IN PROGRESS (cert mock)
- Task 5: implementer DONE (web commits f78c0b5..0389b99) — TDD red→green, +5 preview tests + 1 derive-slot test, full vitest 620/620 · 50 files (baseline 614/614 · 50), tsc 0, lint 0 err/20 warn (baseline exact), cr 0 findings; see evidence/task-5-report.md
- Task 5: complete (web commits f78c0b5..0389b99, review APPROVED)
- Task 6: IN PROGRESS (web SQL 083 race_categories public read)
- Task 6: implementer DONE (commit 0389b99..f387387) — NEW 083_race_categories_public_read.sql (082 drop+create precedent; policy name pinned "public reads published event categories"; down = drop-new-only restores 019 baseline; seed.sql untouched, no addendum rider needed). supabase db reset clean 001→083. psql RED→GREEN matrix: RED anon sees 0 categories everywhere (chicken-and-egg confirmed); GREEN anon=19/19, closed E1+E2=3, draft-flip probe=0 (rolled back), runner1 registered policy intact (E3-draft flip: still sees own 3), organizer own-subset 10 (union→19), admin bypass structural G1 + functional G9 (simulated claims), unregistered runner9=19 (self-registration fix). Seed consistency: all §6 category events published/closed (E1/E2 closed), hidden_by_status=0 — no hidden seed category. Gates: tsc 0, vitest 620/620 · 50 (baseline exact), lint 0 err/20 warn (baseline exact), cr --prompt-only --type uncommitted findings=0 (run 2 after git add; run 1 skipped as untracked). evidence/task-6-report.md
- Task 6: complete (web commit f387387 = `fix(db): 083 race_categories public read for published/closed events`; awaiting @reviewer)
- Task 6: complete (commits 0389b99..f387387, review APPROVED with 1 LOW pre-existing finding (not a Task 6 regression); matrix reproduced: anon 19/19, anon closed E1+E2=3, draft-flip E3 anon=0 (rolled back), runner1-registered E3-draft=3 + union=19, org1 union=19/own E3=3, admin claims OR-branch E3-draft=3, unregistered authed (no-profile) =19, hidden_by_status=0, race_categories policies=3 (019 names intact, 019/082 byte-unchanged in range — diff = 083 only); reviewer-exclusive probes: registrations.raw INSERT WITH CHECK hits "infinite recursion" BOTH with and without 083 (T1/T2) → pre-existing 019 baseline bug registrations→race_categories→registrations, invisible to app path (register_for_event is SECURITY DEFINER, RLS-bypassed); visibility-gated insert proof (T3: without category visibility → RLS violation). Recursion verdict SAFE: 083 references events only; events policies (019/082) reference status/organizer only — no cycle on any SELECT probe. cf. evidence/task-6-report.md)
- Task 7: dev smoke lane (env surgery + fixtures + themed/legacy cert render PASS/API evidence) — supabase db reset clean 001→083; throwaways p4-smoke-web + p4-smoke-api healthy on LOCAL demo keys (both persistent containers' env pointed CLOUD ugexrrslijmwtieevjbs.supabase.co → originals stopped intact, not restarted); `docker compose run` does NOT attach service alias (fixed live: `docker network connect --alias api|web`); https front for ssrf allowlist + browser-openable signed URLs = p4-smoke-tunnel ssh tunnel: https://volunteers-monkey-wanna-about.trycloudflare.com (quick tunnel → local kong 54321; DEVIATION from brief's pinned http://172.21.12.233:54321 — cert.ts storageAssetUrl expansion + assets.py https+prefix byte-exact gate force SUPABASE_URL host parity, documented). Fixtures idempotent (re-run all-guarded 9×0 + UPDATE 0): smokeorg organizers aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee; b1 'P4 Smoke Batik Heritage Run' (colors #C1272D/#0B5EA8 + vocab Sijil/Peserta/Nombor Larian + assets.certificate_background_url bucket path); closed sibling d1 + 'Heritage 5K' category — 083 LIVE anon 200 on closed AND published event categories; runner1 IC-on-file via ic_document_path (no pdpa bookkeeping); registration bib HRK-001 paid; runner_badges event_complete (event-scoped b1, cert.ts badge path rows verified). Real 2000×1414 RGB PNG generated by container Pillow, uploaded organizer-policy gated (200) to organizers/<org>/events/<b1>/certificate_background-v1111111111111.png. Cert legs (docker exec render script):
  · themed (bg=uploaded https URL, reg_id p4_smoke_runner_badge_0000) → HTTP 200, **3508×2480 PNG RGB 161 KB** with REAL bg art in pixels (art pixels ≠ fallback canvas);
  · junk-404 → warn 'ThemeAssetError: … HTTP 400' (storage missing-object = 400 not 404) → **full-size 3508×2480 theme-colored fallback canvas** (#C1272D fill + #D4A017 accent bands) + fresh 24 h signed URL — never-fail contract OBSERVED;
  · hostile → 'outside allowlist prefix' reject → fallback canvas byte-identical to junk leg (md5 c5d1dd46122ece5cd395bb72227c000f);
  · legacy no-theme (reg_id p4_smoke_legacy_runner_0000) → **800×600 PNG white historical shape**.
  Artifacts: /tmp/opencode/p4-cert-themed.png (for designer) · p4-cert-legacy.png · p4-cert-fallback-404/hostile.png · p4-cert-background.png · p4-cert-render.log (4 responses + PIL probes). BFF chain proof: node script INSIDE p4-smoke-web → http://api:8000 /ai/ecert/generate + web INTERNAL_API_KEY → 200 signed tunnel cert_url. No-network gates re-recorded from ledger: api pytest 367 passed / ruff 96=96 (0 delta). Signed URLs valid 24 h & die with tunnel teardown (cleanup order report §6). report: /tmp/opencode/p4-smoke-dev-report.md
- Task 7: HANDOVER to @designer (while tunnel + throwaways standing): smokeorg login via tunnel → organizer b1 Theme tab cert mock card (bg thumb + Sijil/Peserta/Nombor Larian); runner1 → /runner/badges → 'Event Finisher' card → Download Certificate (fresh themed 3508×2480 signed URL per click); instant-open signed URL for p4_smoke_runner_badge_0000.png in /tmp/opencode/p4-smoke-dev-report.md §4.
- Task 7: browser smoke lane PASS (A cert mock B themed download 3508x2480 C public page D glyphs; ambers: dark-preview toggle cosmetic ticket, og:image no-banner fallback ticket, no runner9 for pre-reg UI leg — API-side verified 19/19)
- Task 7: teardown complete (throwaways removed; originals healthy on cloud env; aliases verified; trycloudflare died with cleanup)
- Ruling: dark-preview toggle no-op in Theme tab preview is a PARKED cosmetic editor-preview ticket (core page dark re-resolution verified P2; cert mock uses explicit dark vars in plate) — not a P4 blocker
- Rider: _LABEL_ALIASES dropped (commit cb9ec82, pytest green ruff delta 0)
- PRs open: pelikat-api #12 / pelikat-web #34 (heads cb9e/f387)
- PR12: merged (merge sha a81332254cf3c9a1bba96ffec5b2850b03a3b1e9)
- PR34: merged (merge sha 33ef6fac8fb2bad9d5124a06388cab682f2ba6cd)
- Plan complete.



---

