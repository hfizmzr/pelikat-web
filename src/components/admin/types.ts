export type Organizer = {
  id: string
  name: string
  slug: string
  contact_email: string | null
  is_active: boolean
  created_at: string
  sub_expires_at: string | null
  approved_at: string | null
  rejected_at: string | null
}