// Registration payment statuses (see registrations_payment_status_check,
// migrations/066): 'pending' | 'paid' | 'refunded' | 'waived'.
//
// A registration counts as CONFIRMED when paid OR payment-waived —
// 'waived' covers complimentary guests (pacers / VIPs) added by
// organizers, who are fully registered participants without a charge.

export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'waived'

export function isConfirmedStatus(status: string | null | undefined): boolean {
  return status === 'paid' || status === 'waived'
}
