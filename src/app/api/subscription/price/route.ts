import { getOrganizerSubscriptionPrice } from '@/lib/subscription'

// Public single-tier organizer subscription price (configuration data).
// force-dynamic so an admin price update is never served stale. Runner
// accounts are always free — runners pay only per event registration or
// merch order; only organizers pay this subscription.
export const dynamic = 'force-dynamic'

export async function GET() {
  const price = await getOrganizerSubscriptionPrice()
  return Response.json({ ...price })
}
