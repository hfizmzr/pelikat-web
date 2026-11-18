// Covers: run-log summary "Time" card (compact all-time total)

import { describe, it, expect } from 'vitest'
import { formatTotalTime } from '@/lib/format-duration'

describe('formatTotalTime', () => {
  it('drops seconds once there is an hour or more', () => {
    expect(formatTotalTime(48 * 3600 + 36 * 60 + 12)).toBe('48h 36m')
  })
  it('keeps minutes and seconds under an hour', () => {
    expect(formatTotalTime(36 * 60 + 12)).toBe('36m 12s')
    expect(formatTotalTime(0)).toBe('0m 0s')
  })
  it('shows only hours from 100h', () => {
    expect(formatTotalTime(148 * 3600 + 59 * 60)).toBe('148h')
  })
})
