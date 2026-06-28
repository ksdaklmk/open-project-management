import { describe, it, expect } from 'vitest'
import { bucketTasks } from './buckets'
import { parseDate } from '../../lib/weeks'
import type { Task } from '../../data/tasksRepo'

const t = (over: Partial<Task>): Task => ({
  id: 'x', project_id: 'p', workspace_id: 'w', ref: 'NIM-1', type: 'feature',
  title: 't', description: '', status: 'todo', priority: 'low', assignee_id: null,
  start_date: null, end_date: null, points: null, position: 0,
  created_by: null, created_at: '', updated_at: '', tags: [], ...over,
})

const at = (id: string) => (r: ReturnType<typeof bucketTasks>) =>
  r.find((b) => b.id === id)!.tasks.map((x) => x.ref)

describe('bucketTasks', () => {
  const now = parseDate('2026-06-27') // Saturday; this week = Jun 22–28
  const result = bucketTasks(
    [
      t({ ref: 'EARLY', start_date: '2026-06-15' }),
      t({ ref: 'THIS', start_date: '2026-06-22' }),
      t({ ref: 'NEXT', start_date: '2026-06-29' }),
      t({ ref: 'LATER', start_date: '2026-07-06' }),
      t({ ref: 'NONE', start_date: null }),
    ],
    now,
  )

  it('keeps all five buckets in fixed order', () => {
    expect(result.map((b) => b.id)).toEqual(['earlier', 'this_week', 'next_week', 'later', 'unscheduled'])
  })
  it('routes each task to its bucket relative to now', () => {
    expect(at('earlier')(result)).toEqual(['EARLY'])
    expect(at('this_week')(result)).toEqual(['THIS'])
    expect(at('next_week')(result)).toEqual(['NEXT'])
    expect(at('later')(result)).toEqual(['LATER'])
    expect(at('unscheduled')(result)).toEqual(['NONE'])
  })
})
