import { describe, it, expect } from 'vitest'
import { filterTasks, type TaskFilters } from './filterTasks'

const t = (o: Partial<any> = {}) => ({
  id: 'x',
  status: 'todo',
  priority: 'low',
  assignee_id: null,
  type: 'feature',
  tags: [] as string[],
  title: '',
  description: '',
  ...o,
})
const none: TaskFilters = { status: [], priority: [], assignee: [], type: [], tag: [], q: '' }

describe('filterTasks', () => {
  it('returns all when no filters are set', () => {
    const tasks = [t(), t({ id: 'y' })]
    expect(filterTasks(tasks as any, none)).toHaveLength(2)
  })
  it('ORs within a dimension, ANDs across dimensions', () => {
    const tasks = [
      t({ id: 'a', status: 'todo', priority: 'high' }),
      t({ id: 'b', status: 'done', priority: 'high' }),
      t({ id: 'c', status: 'todo', priority: 'low' }),
    ]
    const out = filterTasks(tasks as any, { ...none, status: ['todo'], priority: ['high'] })
    expect(out.map((x) => x.id)).toEqual(['a'])
  })
  it('matches a tag when any selected tag is present', () => {
    const tasks = [t({ id: 'a', tags: ['API'] }), t({ id: 'b', tags: ['Design'] })]
    expect(filterTasks(tasks as any, { ...none, tag: ['API'] }).map((x) => x.id)).toEqual(['a'])
  })
  it('filters unassigned via empty-string assignee', () => {
    const tasks = [t({ id: 'a', assignee_id: null }), t({ id: 'b', assignee_id: 'u1' })]
    expect(filterTasks(tasks as any, { ...none, assignee: [''] }).map((x) => x.id)).toEqual(['a'])
  })
  it('text search matches title or description, case-insensitively', () => {
    const tasks = [
      t({ id: 'a', title: 'Build LOGIN' }),
      t({ id: 'b', description: 'fix the Login bug' }),
      t({ id: 'c', title: 'unrelated' }),
    ]
    expect(filterTasks(tasks as any, { ...none, q: 'login' }).map((x) => x.id)).toEqual(['a', 'b'])
  })
})
