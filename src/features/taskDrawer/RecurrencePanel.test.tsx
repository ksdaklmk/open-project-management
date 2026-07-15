import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../data/tasksRepo'

const { recurrence, save, remove } = vi.hoisted(() => {
  const save = { mutate: vi.fn(), isPending: false }
  const remove = { mutate: vi.fn(), isPending: false }
  const recurrence = {
    data: null as any,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    save,
    remove,
  }
  return { recurrence, save, remove }
})

vi.mock('../../lib/hooks/useTaskRecurrence', () => ({
  useTaskRecurrence: () => recurrence,
}))

import { occurrenceFields, RecurrencePanel } from './RecurrencePanel'
import { expectNoA11yViolations } from '../../test-a11y'

const task = { id: 't1', ref: 'NIM-101', title: 'Weekly review' } as Task

beforeEach(() => {
  vi.clearAllMocks()
  recurrence.data = null
  recurrence.isLoading = false
  recurrence.error = null
})

describe('RecurrencePanel', () => {
  it('converts a scheduled instant to fields in its stored timezone', () => {
    expect(occurrenceFields('2026-03-08T13:00:00Z', 'America/New_York')).toEqual({
      date: '2026-03-08',
      time: '09:00',
    })
  })

  it('creates a timezone-local recurring task schedule', async () => {
    render(<RecurrencePanel task={task} workspaceId="w1" />)
    await userEvent.clear(screen.getByLabelText('Recurrence interval'))
    await userEvent.type(screen.getByLabelText('Recurrence interval'), '2')
    await userEvent.selectOptions(screen.getByLabelText('Recurrence frequency'), 'monthly')
    await userEvent.clear(screen.getByLabelText('Timezone'))
    await userEvent.type(screen.getByLabelText('Timezone'), 'Asia/Bangkok')
    await userEvent.clear(screen.getByLabelText('Next occurrence date'))
    await userEvent.type(screen.getByLabelText('Next occurrence date'), '2026-08-01')
    await userEvent.clear(screen.getByLabelText('Local time'))
    await userEvent.type(screen.getByLabelText('Local time'), '10:30')
    await userEvent.click(screen.getByRole('button', { name: 'Make recurring' }))

    expect(save.mutate).toHaveBeenCalledWith({
      taskId: 't1',
      timezone: 'Asia/Bangkok',
      frequency: 'monthly',
      interval: 2,
      firstOccurrenceLocal: '2026-08-01 10:30:00',
    })
  })

  it('shows an existing schedule and can stop it', async () => {
    recurrence.data = {
      id: 'r1',
      enabled: true,
      frequency: 'daily',
      schedule_interval: 1,
      timezone: 'America/New_York',
      next_occurrence_at: '2026-03-08T13:00:00Z',
      updated_at: '2026-03-01T00:00:00Z',
    }
    render(<RecurrencePanel task={task} workspaceId="w1" />)
    expect(screen.getByLabelText('Next occurrence date')).toHaveValue('2026-03-08')
    expect(screen.getByLabelText('Local time')).toHaveValue('09:00')
    await userEvent.click(screen.getByRole('button', { name: 'Stop recurrence' }))
    expect(remove.mutate).toHaveBeenCalled()
  })

  it('has no automated accessibility violations', async () => {
    const { container } = render(<RecurrencePanel task={task} workspaceId="w1" />)
    await expectNoA11yViolations(container)
  })
})
