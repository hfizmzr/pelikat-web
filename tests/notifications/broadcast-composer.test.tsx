import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/actions/notifications', () => ({ sendEventBroadcast: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { BroadcastComposer } from '@/components/notifications/broadcast-composer'

function compose(recipientCount: number, accountCount: number) {
  render(<BroadcastComposer eventId="e1" eventName="KL Run" recipientCount={recipientCount} accountCount={accountCount} />)
  fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Hall B' } })
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Kit pickup moved' } })
}

describe('BroadcastComposer audience', () => {
  it('counts guests while Email is on', () => {
    compose(5, 3)
    expect(screen.getByRole('button', { name: /send to 5 runners/i })).toBeEnabled()
  })

  it('drops email-only guests when Email is off', () => {
    compose(5, 3)
    fireEvent.click(screen.getByRole('switch', { name: 'Send email' }))
    expect(screen.getByRole('button', { name: /send to 3 runners/i })).toBeEnabled()
    expect(screen.getByText(/2 guests skipped/)).toBeInTheDocument()
  })

  it('blocks sending when nobody can receive it', () => {
    compose(2, 0)
    fireEvent.click(screen.getByRole('switch', { name: 'Send email' }))
    expect(screen.getByRole('button', { name: /send to 0 runners/i })).toBeDisabled()
  })
})
