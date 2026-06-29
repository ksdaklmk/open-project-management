import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const toggle = vi.fn()
const add = vi.fn()
vi.mock('../../lib/hooks/useSubtasks', () => ({
  useSubtasks: () => ({
    data: [{ id: 's1', title: 'Spec it', done: true }, { id: 's2', title: 'Build it', done: false }],
    isLoading: false, error: null,
    add: { mutate: add }, toggle: { mutate: toggle }, remove: { mutate: vi.fn() },
  }),
}))
import { SubtaskList } from './SubtaskList'

const draftBox = () => screen.getByLabelText('New subtask') as HTMLInputElement

describe('SubtaskList', () => {
  beforeEach(() => { add.mockReset(); toggle.mockReset() })

  it('shows progress and toggles a subtask', () => {
    render(<SubtaskList taskId="t1" />)
    expect(screen.getByText('1/2')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Build it'))
    expect(toggle).toHaveBeenCalledWith({ id: 's2', done: true })
  })

  it('keeps the draft when the add has not succeeded (e.g. it failed)', () => {
    render(<SubtaskList taskId="t1" />)
    fireEvent.change(draftBox(), { target: { value: 'Ship it' } })
    fireEvent.keyDown(draftBox(), { key: 'Enter' })
    expect(add).toHaveBeenCalledWith('Ship it', expect.objectContaining({ onSuccess: expect.any(Function) }))
    expect(draftBox().value).toBe('Ship it')
  })

  it('clears the draft once the add succeeds', () => {
    add.mockImplementation((_title: string, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.())
    render(<SubtaskList taskId="t1" />)
    fireEvent.change(draftBox(), { target: { value: 'Ship it' } })
    fireEvent.keyDown(draftBox(), { key: 'Enter' })
    expect(draftBox().value).toBe('')
  })
})
