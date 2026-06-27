import { describe, it, expect } from 'vitest'
import { relativeTime } from './relativeTime'

const NOW = Date.parse('2026-06-27T12:00:00Z')

describe('relativeTime', () => {
  it('returns "just now" under 45 seconds', () => {
    expect(relativeTime('2026-06-27T11:59:50Z', NOW)).toBe('just now')
  })
  it('formats minutes', () => {
    expect(relativeTime('2026-06-27T11:55:00Z', NOW)).toBe('5 minutes ago')
  })
  it('formats hours', () => {
    expect(relativeTime('2026-06-27T09:00:00Z', NOW)).toBe('3 hours ago')
  })
  it('formats days', () => {
    expect(relativeTime('2026-06-25T12:00:00Z', NOW)).toBe('2 days ago')
  })
  it('falls back to an absolute date past a week', () => {
    expect(relativeTime('2026-05-28T12:00:00Z', NOW)).toBe('May 28')
  })
})
