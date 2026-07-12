import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const toggle = vi.fn()
const add = vi.fn()
const rows = [
  { id: 's1', title: 'Spec it', done: true },
  { id: 's2', title: 'Build it', done: false },
]
const subs: { data: typeof rows | undefined; isLoading: boolean; error: Error | null } = {
  data: rows,
  isLoading: false,
  error: null,
}
vi.mock('../../lib/hooks/useSubtasks', () => ({
  useSubtasks: () => ({
    ...subs,
    add: { mutate: add },
    toggle: { mutate: toggle },
    remove: { mutate: vi.fn() },
  }),
}))
import { SubtaskList } from './SubtaskList'

const draftBox = () => screen.getByLabelText('New subtask') as HTMLInputElement

beforeEach(() => {
  add.mockReset()
  toggle.mockReset()
  subs.data = rows
  subs.isLoading = false
  subs.error = null
})

describe('SubtaskList', () => {
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
    expect(add).toHaveBeenCalledWith(
      'Ship it',
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(draftBox().value).toBe('Ship it')
  })

  it('clears the draft once the add succeeds', () => {
    add.mockImplementation((_title: string, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    )
    render(<SubtaskList taskId="t1" />)
    fireEvent.change(draftBox(), { target: { value: 'Ship it' } })
    fireEvent.keyDown(draftBox(), { key: 'Enter' })
    expect(draftBox().value).toBe('')
  })

  it('shows a loading line while subtasks load', () => {
    subs.data = undefined
    subs.isLoading = true
    render(<SubtaskList taskId="t1" />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows an error line when subtasks fail to load', () => {
    subs.data = undefined
    subs.error = new Error('boom')
    render(<SubtaskList taskId="t1" />)
    expect(screen.getByText(/couldn't load subtasks/i)).toBeInTheDocument()
  })
})
