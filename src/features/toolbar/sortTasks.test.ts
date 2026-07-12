import { describe, it, expect } from 'vitest'
import { sortTasks } from './sortTasks'

const t = (o: Partial<any>) => ({
  priority: 'low',
  end_date: null,
  title: '',
  status: 'todo',
  ...o,
})

describe('sortTasks', () => {
  it('orders by priority rank, highest first', () => {
    const out = sortTasks(
      [t({ priority: 'low' }), t({ priority: 'urgent' }), t({ priority: 'medium' })] as any,
      'priority',
    )
    expect(out.map((x) => x.priority)).toEqual(['urgent', 'medium', 'low'])
  })
  it('orders by due date ascending, nulls last', () => {
    const out = sortTasks(
      [t({ end_date: null }), t({ end_date: '2026-07-01' }), t({ end_date: '2026-06-15' })] as any,
      'due',
    )
    expect(out.map((x) => x.end_date)).toEqual(['2026-06-15', '2026-07-01', null])
  })
  it('orders by title A→Z and by status pipeline order', () => {
    expect(
      sortTasks([t({ title: 'B' }), t({ title: 'A' })] as any, 'title').map((x) => x.title),
    ).toEqual(['A', 'B'])
    expect(
      sortTasks([t({ status: 'done' }), t({ status: 'backlog' })] as any, 'status').map(
        (x) => x.status,
      ),
    ).toEqual(['backlog', 'done'])
  })
  it('does not mutate the input array', () => {
    const input = [t({ priority: 'low' }), t({ priority: 'urgent' })] as any
    sortTasks(input, 'priority')
    expect(input[0].priority).toBe('low')
  })
})
