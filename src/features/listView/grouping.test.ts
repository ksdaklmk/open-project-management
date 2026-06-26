import { describe, it, expect } from 'vitest'
import { groupTasksByStatus } from './grouping'
import type { Task } from '../../data/tasksRepo'

const t = (over: Partial<Task>): Task => ({
  id: 'x', project_id: 'p', workspace_id: 'w', ref: 'NIM-1', type: 'feature',
  title: 't', description: '', status: 'todo', priority: 'low', assignee_id: null,
  start_date: null, end_date: null, points: null, position: 0,
  created_by: null, created_at: '', updated_at: '', ...over,
})

describe('groupTasksByStatus', () => {
  it('groups in status order, hides empty groups', () => {
    const groups = groupTasksByStatus([t({ status: 'done' }), t({ status: 'todo' })])
    expect(groups.map((g) => g.status)).toEqual(['todo', 'done'])
  })
  it('sorts within a group by priority desc then position', () => {
    const groups = groupTasksByStatus([
      t({ id: 'a', status: 'todo', priority: 'low', position: 1 }),
      t({ id: 'b', status: 'todo', priority: 'urgent', position: 9 }),
      t({ id: 'c', status: 'todo', priority: 'low', position: 0 }),
    ])
    expect(groups[0].tasks.map((x) => x.id)).toEqual(['b', 'c', 'a'])
  })
})
