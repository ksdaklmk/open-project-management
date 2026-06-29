import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const setTaskRef = vi.fn()
const state = { taskRef: 'NIM-101' as string | null }
vi.mock('../../app/useViewState', () => ({ useViewState: () => ({ ...state, setTaskRef }) }))
vi.mock('../../lib/workspace', () => ({ useActiveWorkspace: () => ({ activeId: 'w1', loading: false }) }))
vi.mock('../../lib/hooks/useTasks', () => ({
  useTasks: () => ({
    data: [{ id: 't1', ref: 'NIM-101', title: 'Build login', type: 'feature', status: 'todo',
      priority: 'high', assignee_id: null, points: null, description: '', start_date: null,
      end_date: null, position: 0, tags: [] }],
    isLoading: false, error: null,
  }),
}))
const mutate = vi.fn()
vi.mock('../../lib/hooks/useUpdateTask', () => ({ useUpdateTask: () => ({ mutate }) }))
vi.mock('../../lib/hooks/useMembers', () => ({ useMembers: () => ({ data: [] }) }))

import { TaskDrawer } from './TaskDrawer'

beforeEach(() => { state.taskRef = 'NIM-101'; setTaskRef.mockClear() })

describe('TaskDrawer', () => {
  it('renders a dialog with the task ref + title when ?task matches', () => {
    render(<TaskDrawer />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('NIM-101')
    expect(dialog).toHaveTextContent('Build login')
  })

  it('closes on Escape', () => {
    render(<TaskDrawer />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(setTaskRef).toHaveBeenCalledWith(null)
  })

  it('closes when the backdrop is clicked', () => {
    render(<TaskDrawer />)
    fireEvent.click(screen.getByTestId('drawer-backdrop'))
    expect(setTaskRef).toHaveBeenCalledWith(null)
  })

  it('shows a not-found panel for an unknown ref', () => {
    state.taskRef = 'NIM-999'
    render(<TaskDrawer />)
    expect(screen.getByText(/not found/i)).toBeInTheDocument()
  })

  it('renders nothing when no task is selected', () => {
    state.taskRef = null
    const { container } = render(<TaskDrawer />)
    expect(container).toBeEmptyDOMElement()
  })

  it('saves a status edit through useUpdateTask', () => {
    render(<TaskDrawer />)
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'done' } })
    expect(mutate).toHaveBeenCalledWith({ id: 't1', patch: { status: 'done' } })
  })
  it('saves the title on blur', () => {
    render(<TaskDrawer />)
    const title = screen.getByLabelText('Title')
    fireEvent.change(title, { target: { value: 'Build SSO' } })
    fireEvent.blur(title)
    expect(mutate).toHaveBeenCalledWith({ id: 't1', patch: { title: 'Build SSO' } })
  })
})
