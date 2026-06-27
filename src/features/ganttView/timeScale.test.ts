import { describe, it, expect } from 'vitest'
import { splitGantt, buildScale } from './timeScale'
import { parseDate } from '../../lib/weeks'
import type { Task } from '../../data/tasksRepo'

const t = (over: Partial<Task>): Task => ({
  id: 'x', project_id: 'p', workspace_id: 'w', ref: 'NIM-1', type: 'feature',
  title: 't', description: '', status: 'todo', priority: 'low', assignee_id: null,
  start_date: null, end_date: null, points: null, position: 0,
  created_by: null, created_at: '', updated_at: '', ...over,
})

describe('splitGantt', () => {
  it('separates fully-dated tasks from the rest', () => {
    const { scheduled, unscheduled } = splitGantt([
      t({ id: 'a', start_date: '2026-06-22', end_date: '2026-06-26' }),
      t({ id: 'b', start_date: '2026-06-22', end_date: null }),
      t({ id: 'c', start_date: null, end_date: null }),
    ])
    expect(scheduled.map((x) => x.id)).toEqual(['a'])
    expect(unscheduled.map((x) => x.id)).toEqual(['b', 'c'])
  })
})

describe('buildScale', () => {
  const scheduled = [
    t({ id: 'a', start_date: '2026-06-22', end_date: '2026-06-26' }),
    t({ id: 'b', start_date: '2026-07-06', end_date: '2026-07-10' }),
  ]
  const scale = buildScale(scheduled, parseDate('2026-06-27'))

  it('spans whole Monday weeks from first start to last end', () => {
    expect(scale.weeks.map((w) => w.label)).toEqual(['Jun 22', 'Jun 29', 'Jul 6'])
    expect(scale.rangeDays).toBe(21)
  })
  it('positions a bar with inclusive end width', () => {
    const p = scale.position(parseDate('2026-06-22'), parseDate('2026-06-26'))
    expect(p.leftPct).toBe(0)
    expect(p.widthPct).toBeCloseTo((5 / 21) * 100, 5) // 5 inclusive days
  })
  it('clamps a bar to the range and sets todayPct inside the range', () => {
    const p = scale.position(parseDate('2026-07-06'), parseDate('2026-07-10'))
    expect(p.leftPct).toBeCloseTo((14 / 21) * 100, 5)
    expect(scale.todayPct).toBeCloseTo((5 / 21) * 100, 5)
  })
  it('returns null todayPct when now is outside the range', () => {
    expect(buildScale(scheduled, parseDate('2026-09-01')).todayPct).toBeNull()
  })
})
