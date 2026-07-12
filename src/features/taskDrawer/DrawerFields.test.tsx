import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Task } from '../../data/tasksRepo'

vi.mock('../../lib/hooks/useUpdateTask', () => ({
  useUpdateTask: () => ({ mutate: vi.fn() }),
}))
vi.mock('../../lib/hooks/useMoveTask', () => ({
  useMoveTask: () => ({ mutate: vi.fn() }),
}))
vi.mock('../../lib/hooks/useMembers', () => ({
  useMembers: () => ({ data: [] }),
}))

import { DrawerFields } from './DrawerFields'

const task = {
  id: 't1',
  title: 'Original title',
  description: 'Original description',
  type: 'feature',
  status: 'todo',
  priority: 'medium',
  position: 1,
  points: null,
  start_date: null,
  end_date: null,
  assignee_id: null,
  created_at: '2026-07-12T00:00:00Z',
  created_by: null,
  project_id: 'p1',
  ref: 'NIM-101',
  tags: [],
  updated_at: '2026-07-12T00:00:00Z',
  workspace_id: 'w1',
} satisfies Task

describe('DrawerFields realtime reconciliation', () => {
  it('adopts remote field changes while the local draft is pristine', () => {
    const view = render(<DrawerFields task={task} workspaceId="w1" />)

    view.rerender(
      <DrawerFields
        task={{ ...task, title: 'Remote title', description: 'Remote description' }}
        workspaceId="w1"
      />,
    )

    expect(screen.getByLabelText('Title')).toHaveValue('Remote title')
    expect(screen.getByLabelText('Description')).toHaveValue('Remote description')
  })

  it('preserves an in-progress local draft when a remote value arrives', () => {
    const view = render(<DrawerFields task={task} workspaceId="w1" />)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Local draft' } })

    view.rerender(<DrawerFields task={{ ...task, title: 'Remote title' }} workspaceId="w1" />)

    expect(screen.getByLabelText('Title')).toHaveValue('Local draft')
  })
})
