import { describe, expect, it } from 'vitest'
import {
  capacityError,
  dateRangeError,
  emailError,
  normaliseProjectKey,
  pointsError,
  projectKeyError,
  titleError,
} from './validation'

describe('validation', () => {
  it('validates task titles, points, and dates', () => {
    expect(titleError('  ')).toMatch(/required/i)
    expect(pointsError(1000)).toMatch(/999/)
    expect(pointsError(1.5)).toMatch(/whole number/i)
    expect(dateRangeError('2026-07-14', '2026-07-13')).toMatch(/on or before/i)
    expect(dateRangeError('1899-12-31', null)).toMatch(/1900/)
    expect(dateRangeError('2026-07-13', '2026-07-14')).toBeNull()
  })

  it('validates and normalises administration values', () => {
    expect(normaliseProjectKey(' nim ')).toBe('NIM')
    expect(projectKeyError('1bad')).toMatch(/starting with a letter/i)
    expect(projectKeyError('NIM')).toBeNull()
    expect(capacityError(169)).toMatch(/168/)
    expect(capacityError(24)).toBeNull()
    expect(emailError('not-an-email')).toMatch(/valid email/i)
    expect(emailError('person@example.com')).toBeNull()
  })
})
