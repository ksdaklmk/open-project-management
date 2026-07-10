import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const setTaskRef = vi.fn()
const state = { taskRef: 'NIM-101' as string | null }
vi.mock('../../app/useViewState', () => ({ useViewState: () => ({ ...state, setTaskRef }) }))
vi.mock('../../lib/workspace', () => ({ useActiveWorkspace: () => ({ activeId: 'w1', loading: false }) }))
const { useTasks } = vi.hoisted(() => ({ useTasks: vi.fn() }))
vi.mock('../../lib/hooks/useTasks', () => ({ useTasks }))
const TASKS = [{ id: 't1', ref: 'NIM-101', title: 'Build login', type: 'feature', status: 'todo',
  priority: 'high', assignee_id: null, points: null, description: '', start_date: null,
  end_date: null, position: 0, tags: [] }]
const mutate = vi.fn()
const moveMutate = vi.fn()
vi.mock('../../lib/hooks/useUpdateTask', () => ({ useUpdateTask: () => ({ mutate }) }))
vi.mock('../../lib/hooks/useMoveTask', () => ({ useMoveTask: () => ({ mutate: moveMutate }) }))
vi.mock('../../lib/hooks/useMembers', () => ({ useMembers: () => ({ data: [] }) }))
vi.mock('../../lib/hooks/useTaskTags', () => ({ useTaskTags: () => ({ add: { mutate: vi.fn() }, remove: { mutate: vi.fn() } }) }))
vi.mock('../../lib/hooks/useSubtasks', () => ({ useSubtasks: () => ({ data: [], add: { mutate: vi.fn() }, toggle: { mutate: vi.fn() }, remove: { mutate: vi.fn() } }) }))
vi.mock('../../lib/hooks/useComments', () => ({ useComments: () => ({ data: [] }), useAddComment: () => ({ mutate: vi.fn() }) }))

import { TaskDrawer } from './TaskDrawer'

beforeEach(() => {
  state.taskRef = 'NIM-101'
  setTaskRef.mockClear(); mutate.mockClear(); moveMutate.mockClear()
  useTasks.mockReturnValue({ data: TASKS, isLoading: false, error: null })
})

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

  it('closes when the ✕ header button is clicked', () => {
    render(<TaskDrawer />)
    fireEvent.click(screen.getByText('✕'))
    expect(setTaskRef).toHaveBeenCalledWith(null)
  })

  it('Shift+Tab from the open panel wraps to the last control instead of escaping backward', () => {
    render(<TaskDrawer />)
    const dialog = screen.getByRole('dialog')
    expect(document.activeElement).toBe(dialog) // effect focuses the panel container on open
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    const f = dialog.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')
    expect(document.activeElement).toBe(f[f.length - 1])
  })

  it('shows a not-found panel for an unknown ref', () => {
    state.taskRef = 'NIM-999'
    render(<TaskDrawer />)
    expect(screen.getByText(/not found/i)).toBeInTheDocument()
  })

  it('shows a loading panel (not "not found") while tasks are loading', () => {
    useTasks.mockReturnValue({ data: undefined, isLoading: true, error: null })
    render(<TaskDrawer />)
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument()
  })

  it('shows an error panel (not "not found") when tasks fail to load', () => {
    useTasks.mockReturnValue({ data: undefined, isLoading: false, error: new Error('boom') })
    render(<TaskDrawer />)
    expect(screen.getByText(/couldn't load/i)).toBeInTheDocument()
    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument()
  })

  it('Escape saves a dirty title before closing (blur flush)', () => {
    render(<TaskDrawer />)
    const title = screen.getByLabelText('Title')
    title.focus()
    fireEvent.change(title, { target: { value: 'Build SSO' } })
    fireEvent.keyDown(title, { key: 'Escape' })
    expect(mutate).toHaveBeenCalledWith({ id: 't1', patch: { title: 'Build SSO' } })
    expect(setTaskRef).toHaveBeenCalledWith(null)
  })

  it('renders nothing when no task is selected', () => {
    state.taskRef = null
    const { container } = render(<TaskDrawer />)
    expect(container).toBeEmptyDOMElement()
  })

  it('logs a status edit through useMoveTask (so it lands in Activity, like the List)', () => {
    render(<TaskDrawer />)
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'done' } })
    expect(moveMutate).toHaveBeenCalledWith({ taskId: 't1', toStatus: 'done', position: 0, fromStatus: 'todo' })
    expect(mutate).not.toHaveBeenCalled()
  })
  it('saves the title on blur', () => {
    render(<TaskDrawer />)
    const title = screen.getByLabelText('Title')
    fireEvent.change(title, { target: { value: 'Build SSO' } })
    fireEvent.blur(title)
    expect(mutate).toHaveBeenCalledWith({ id: 't1', patch: { title: 'Build SSO' } })
  })
})
