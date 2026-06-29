import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const toggle = vi.fn()
vi.mock('../../lib/hooks/useSubtasks', () => ({
  useSubtasks: () => ({
    data: [{ id: 's1', title: 'Spec it', done: true }, { id: 's2', title: 'Build it', done: false }],
    isLoading: false, error: null,
    add: { mutate: vi.fn() }, toggle: { mutate: toggle }, remove: { mutate: vi.fn() },
  }),
}))
import { SubtaskList } from './SubtaskList'

describe('SubtaskList', () => {
  it('shows progress and toggles a subtask', () => {
    render(<SubtaskList taskId="t1" />)
    expect(screen.getByText('1/2')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Build it'))
    expect(toggle).toHaveBeenCalledWith({ id: 's2', done: true })
  })
})
