import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../data/tasksRepo'

const update = vi.fn()
vi.mock('../../lib/hooks/useUpdateTask', () => ({ useUpdateTask: () => ({ mutate: update }) }))
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
  beforeEach(() => update.mockClear())
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

  it('rejects blank titles and points outside 0–999 before mutation', () => {
    render(<DrawerFields task={task} workspaceId="w1" />)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '   ' } })
    fireEvent.blur(screen.getByLabelText('Title'))
    fireEvent.change(screen.getByLabelText('Points'), { target: { value: '1000' } })
    fireEvent.blur(screen.getByLabelText('Points'))
    expect(update).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/between 0 and 999/i)
    expect(screen.getByLabelText('Points')).toHaveAttribute('max', '999')
  })

  it('does not save a reversed date range', () => {
    render(<DrawerFields task={task} workspaceId="w1" />)
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-07-20' } })
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-07-10' } })
    expect(update).toHaveBeenCalledWith({
      id: 't1',
      patch: { start_date: '2026-07-20', end_date: null },
    })
    expect(update).not.toHaveBeenCalledWith({ id: 't1', patch: { end_date: '2026-07-10' } })
    expect(screen.getByRole('alert')).toHaveTextContent(/on or before/i)
  })
})
