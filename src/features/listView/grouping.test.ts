import { describe, it, expect } from 'vitest'
import { groupTasksByStatus } from './grouping'

const t = (id: string, status: string) => ({ id, status, priority: 'low', position: 0 })

describe('groupTasksByStatus', () => {
  it('buckets by status in STATUSES order, preserving input order', () => {
    const groups = groupTasksByStatus([t('a', 'todo'), t('b', 'done'), t('c', 'todo')] as any)
    expect(groups.map((g) => g.status)).toEqual(['todo', 'done'])
    expect(groups[0].tasks.map((x) => x.id)).toEqual(['a', 'c'])
  })
  it('omits empty groups', () => {
    const groups = groupTasksByStatus([t('a', 'todo')] as any)
    expect(groups.every((g) => g.tasks.length > 0)).toBe(true)
  })
})
