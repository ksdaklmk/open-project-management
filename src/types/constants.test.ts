import { describe, it, expect } from 'vitest'
import { STATUSES, PRIORITIES, TASK_TYPES } from './constants'

describe('domain constants', () => {
  it('has the five ordered statuses', () => {
    expect(STATUSES.map((s) => s.id)).toEqual([
      'backlog',
      'todo',
      'in_progress',
      'in_review',
      'done',
    ])
  })
  it('ranks priorities urgent > low', () => {
    const urgent = PRIORITIES.find((p) => p.id === 'urgent')!
    const low = PRIORITIES.find((p) => p.id === 'low')!
    expect(urgent.rank).toBeGreaterThan(low.rank)
  })
  it('maps every task type to a shape', () => {
    expect(Object.keys(TASK_TYPES).sort()).toEqual(['bug', 'chore', 'feature', 'improvement'])
  })
})
