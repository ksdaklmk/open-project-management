import { describe, it, expect } from 'vitest'
import { boardColumns } from './boardColumns'
import type { Task } from '../../data/tasksRepo'

const t = (over: Partial<Task>): Task => ({
  id: 'x', project_id: 'p', workspace_id: 'w', ref: 'NIM-1', type: 'feature',
  title: 't', description: '', status: 'todo', priority: 'low', assignee_id: null,
  start_date: null, end_date: null, points: null, position: 0,
  created_by: null, created_at: '', updated_at: '', ...over,
})

describe('boardColumns', () => {
  it('returns all five statuses in order, even when empty', () => {
    expect(boardColumns([]).map((c) => c.status))
      .toEqual(['backlog', 'todo', 'in_progress', 'in_review', 'done'])
  })
  it('sorts a column by position ascending', () => {
    const cols = boardColumns([
      t({ id: 'a', status: 'todo', position: 2 }),
      t({ id: 'b', status: 'todo', position: 1 }),
    ])
    expect(cols.find((c) => c.status === 'todo')!.tasks.map((x) => x.id)).toEqual(['b', 'a'])
  })
})
