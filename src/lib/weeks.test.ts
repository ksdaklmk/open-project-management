import { describe, it, expect } from 'vitest'
import { parseDate, addDays, startOfWeek, daysBetween } from './weeks'

describe('weeks', () => {
  it('parseDate builds a local-midnight date (no UTC drift)', () => {
    const d = parseDate('2026-06-22')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 5, 22])
  })
  it('startOfWeek returns the Monday of the week', () => {
    // 2026-06-27 is a Saturday; its Monday is 2026-06-22
    const mon = startOfWeek(parseDate('2026-06-27'))
    expect([mon.getMonth(), mon.getDate()]).toEqual([5, 22])
  })
  it('addDays adds calendar days across a month boundary', () => {
    const d = addDays(parseDate('2026-06-29'), 7)
    expect([d.getMonth(), d.getDate()]).toEqual([6, 6]) // Jul 6
  })
  it('daysBetween counts whole days', () => {
    expect(daysBetween(parseDate('2026-06-22'), parseDate('2026-06-27'))).toBe(5)
  })
})
