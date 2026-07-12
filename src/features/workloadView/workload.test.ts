import { describe, it, expect } from 'vitest'
import { buildWorkload } from './workload'
import type { Task } from '../../data/tasksRepo'
import type { Member } from '../../data/membersRepo'

const t = (over: Partial<Task>): Task => ({
  id: 'x',
  project_id: 'p',
  workspace_id: 'w',
  ref: 'NIM-1',
  type: 'feature',
  title: 't',
  description: '',
  status: 'todo',
  priority: 'low',
  assignee_id: null,
  start_date: null,
  end_date: null,
  points: null,
  position: 0,
  created_by: null,
  created_at: '',
  updated_at: '',
  tags: [],
  ...over,
})
const m = (over: Partial<Member>): Member => ({
  user_id: 'u',
  role: 'member',
  capacity_per_week: 10,
  color: '#fff',
  name: 'User',
  ...over,
})

const NOW = new Date(2026, 5, 28) // Sun 28 Jun 2026 → week starts Mon 22 Jun

describe('buildWorkload', () => {
  const members = [
    m({ user_id: 'a', name: 'Alice', capacity_per_week: 10 }),
    m({ user_id: 'b', name: '', capacity_per_week: 8 }),
    m({ user_id: 'c', name: 'Cara', capacity_per_week: 0 }),
  ]
  const tasks = [
    t({ id: '1', assignee_id: 'a', start_date: '2026-06-22', points: 5, status: 'todo' }),
    t({ id: '2', assignee_id: 'a', start_date: '2026-06-29', points: 13, status: 'in_progress' }),
    t({ id: '3', assignee_id: 'a', start_date: '2026-07-06', points: 9, status: 'todo' }),
    t({ id: '4', assignee_id: 'a', start_date: '2026-06-29', points: 4, status: 'done' }),
    t({ id: '5', assignee_id: 'b', start_date: '2026-06-22', points: 8, status: 'todo' }),
    t({ id: '6', assignee_id: 'c', start_date: '2026-06-22', points: 3, status: 'todo' }),
    t({ id: '7', assignee_id: null, start_date: '2026-07-06', points: 6, status: 'todo' }),
    t({ id: '8', assignee_id: 'a', start_date: null, points: 2, status: 'backlog' }),
    t({ id: '9', assignee_id: 'a', start_date: '2026-05-01', points: 7, status: 'todo' }),
    t({ id: '10', assignee_id: 'a', start_date: '2026-09-01', points: 1, status: 'todo' }),
  ]
  const wl = buildWorkload(tasks, members, NOW)

  it('builds six Monday-anchored week columns', () => {
    expect(wl.weeks.map((w) => w.label)).toEqual([
      'Jun 22',
      'Jun 29',
      'Jul 6',
      'Jul 13',
      'Jul 20',
      'Jul 27',
    ])
    expect(wl.weeks[0].key).toBe('2026-06-22')
    expect(wl.weeks[5].key).toBe('2026-07-27')
  })

  it('sums points per assignee per week and levels them, excluding done', () => {
    const alice = wl.rows.find((r) => r.id === 'a')!
    expect(alice.cells.map((c) => c.points)).toEqual([5, 13, 9, 0, 0, 0])
    expect(alice.cells.map((c) => c.level)).toEqual([
      'under',
      'over',
      'near',
      'none',
      'none',
      'none',
    ])
    expect(alice.total).toBe(27) // 4-pt done task excluded
  })

  it('falls back to "Someone" for a blank name', () => {
    const b = wl.rows.find((r) => r.id === 'b')!
    expect(b.name).toBe('Someone')
    expect(b.cells[0]).toMatchObject({ points: 8, level: 'near' })
  })

  it('guards capacity 0 — neutral cell, null ratio, no divide-by-zero', () => {
    const cara = wl.rows.find((r) => r.id === 'c')!
    expect(cara.cells[0]).toMatchObject({ points: 3, ratio: null, level: 'none' })
  })

  it('appends a neutral Unassigned row (last) when ownerless load exists', () => {
    const last = wl.rows[wl.rows.length - 1]
    expect(last.id).toBe('__unassigned__')
    expect(last.name).toBe('Unassigned')
    expect(last.capacity).toBeNull()
    expect(last.cells[2]).toMatchObject({ points: 6, level: 'none' })
  })

  it('sorts member rows by name with Unassigned appended', () => {
    expect(wl.rows.map((r) => r.name)).toEqual(['Alice', 'Cara', 'Someone', 'Unassigned'])
  })

  it('routes unscheduled and out-of-window points to footer counts, not the grid', () => {
    expect(wl.unscheduledPoints).toBe(2)
    expect(wl.outOfRangePoints).toBe(8) // 7 before window + 1 after
  })

  it('omits the Unassigned row when no ownerless load exists', () => {
    const r = buildWorkload(
      [t({ assignee_id: 'a', start_date: '2026-06-22', points: 5 })],
      [m({ user_id: 'a', name: 'Alice' })],
      NOW,
    )
    expect(r.rows).toHaveLength(1)
    expect(r.rows.some((x) => x.id === '__unassigned__')).toBe(false)
  })
})
