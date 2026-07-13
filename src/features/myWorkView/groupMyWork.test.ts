import { describe, expect, it } from 'vitest'
import type { MyWorkItem } from '../../data/myWorkRepo'
import { groupMyWork } from './groupMyWork'

const item = (overrides: Partial<MyWorkItem>): MyWorkItem => ({
  id: 't1',
  workspaceId: 'w1',
  workspaceName: 'Northwind',
  projectId: 'p1',
  projectName: 'Website',
  projectKey: 'WEB',
  ref: 'WEB-1',
  title: 'Task',
  type: 'feature',
  status: 'todo',
  priority: 'medium',
  startDate: null,
  endDate: null,
  points: null,
  updatedAt: '2026-07-13T00:00:00Z',
  tags: [],
  sortValue: '2026-07-13T00:00:00Z',
  ...overrides,
})

describe('groupMyWork', () => {
  const items = [
    item({ id: 'overdue', endDate: '2026-07-12' }),
    item({ id: 'today', endDate: '2026-07-13', projectName: 'App' }),
    item({ id: 'none', workspaceName: 'Acme' }),
  ]

  it('groups by workspace and project labels', () => {
    expect(groupMyWork(items, 'workspace', '2026-07-13').map(([key]) => key)).toEqual([
      'Northwind',
      'Acme',
    ])
    expect(groupMyWork(items, 'project', '2026-07-13').map(([key]) => key)).toEqual([
      'Northwind / Website',
      'Northwind / App',
      'Acme / Website',
    ])
  })

  it('uses meaningful due-date buckets', () => {
    expect(groupMyWork(items, 'date', '2026-07-13').map(([key]) => key)).toEqual([
      'Overdue',
      'Due today',
      'No due date',
    ])
  })
})
