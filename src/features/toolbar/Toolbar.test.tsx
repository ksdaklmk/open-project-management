import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, useSearchParams } from 'react-router-dom'

vi.mock('../../lib/workspace', () => ({
  useActiveWorkspace: () => ({ activeId: 'w1', loading: false }),
}))
vi.mock('../../lib/hooks/useMembers', () => ({ useMembers: () => ({ data: [] }) }))
const projects = {
  data: [{ id: 'p1', name: 'Nimbus', key: 'NIM' }] as
    { id: string; name: string; key: string }[] | undefined,
}
const createMutate = vi.fn()
vi.mock('../../lib/hooks/useProjects', () => ({ useProjects: () => projects }))
vi.mock('../../lib/hooks/useCreateTask', () => ({
  useCreateTask: () => ({ mutate: createMutate }),
}))
import { Toolbar } from './Toolbar'

function Probe() {
  const [params] = useSearchParams()
  return <output data-testid="qs">{params.toString()}</output>
}
const renderAt = (initial: string, showSort = false) =>
  render(
    <MemoryRouter
      initialEntries={[initial]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Toolbar showSort={showSort} />
      <Probe />
    </MemoryRouter>,
  )

beforeEach(() => {
  createMutate.mockReset()
  projects.data = [{ id: 'p1', name: 'Nimbus', key: 'NIM' }]
})

describe('Toolbar', () => {
  it('checking a status writes it to the URL', () => {
    renderAt('/')
    fireEvent.click(screen.getByLabelText('To Do'))
    expect(screen.getByTestId('qs').textContent).toContain('status=todo')
  })
  it('selecting Unassigned filters to unassigned tasks and stays checked', () => {
    renderAt('/')
    fireEvent.click(screen.getByLabelText('Unassigned'))
    expect((screen.getByLabelText('Unassigned') as HTMLInputElement).checked).toBe(true)
  })
  it('typing in search sets q', () => {
    renderAt('/')
    fireEvent.change(screen.getByLabelText('Search tasks'), { target: { value: 'login' } })
    expect(screen.getByTestId('qs').textContent).toContain('q=login')
  })
  it('shows the sort control only when showSort is true', () => {
    renderAt('/', false)
    expect(screen.queryByLabelText('Sort by')).toBeNull()
    renderAt('/', true)
    expect(screen.getByLabelText('Sort by')).toBeInTheDocument()
  })
  it('clear filters removes filter params but keeps view and task', () => {
    renderAt('/?view=list&task=NIM-5&status=todo')
    fireEvent.click(screen.getByText('Clear filters'))
    const qs = screen.getByTestId('qs').textContent ?? ''
    expect(qs).not.toContain('status=')
    expect(qs).toContain('view=list')
    expect(qs).toContain('task=NIM-5')
  })

  it('reveals a title input when + New task is clicked, and creates on Enter', () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: '+ New task' }))
    const input = screen.getByLabelText('New task title')
    fireEvent.change(input, { target: { value: 'Fix header' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(createMutate).toHaveBeenCalledTimes(1)
    expect(createMutate.mock.calls[0][0]).toEqual({
      title: 'Fix header',
      project: { id: 'p1', name: 'Nimbus', key: 'NIM' },
    })
  })

  it('opens the drawer on the created ref (success routes ?task=)', () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: '+ New task' }))
    fireEvent.change(screen.getByLabelText('New task title'), { target: { value: 'Fix header' } })
    fireEvent.keyDown(screen.getByLabelText('New task title'), { key: 'Enter' })
    act(() => createMutate.mock.calls[0][1].onSuccess({ ref: 'NIM-107' }))
    expect(screen.getByTestId('qs').textContent).toContain('task=NIM-107')
    expect(screen.queryByLabelText('New task title')).toBeNull() // input closed
  })

  it('does not create on Enter with an empty title', () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: '+ New task' }))
    fireEvent.keyDown(screen.getByLabelText('New task title'), { key: 'Enter' })
    expect(createMutate).not.toHaveBeenCalled()
  })

  it('Escape cancels but keeps the draft for reopening', () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: '+ New task' }))
    fireEvent.change(screen.getByLabelText('New task title'), { target: { value: 'half-typed' } })
    fireEvent.keyDown(screen.getByLabelText('New task title'), { key: 'Escape' })
    expect(screen.queryByLabelText('New task title')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '+ New task' }))
    expect((screen.getByLabelText('New task title') as HTMLInputElement).value).toBe('half-typed')
  })

  it('keeps the draft when the mutation does not succeed', () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: '+ New task' }))
    fireEvent.change(screen.getByLabelText('New task title'), { target: { value: 'kept' } })
    fireEvent.keyDown(screen.getByLabelText('New task title'), { key: 'Enter' })
    // mutate was called but onSuccess never fires (failure path)
    expect((screen.getByLabelText('New task title') as HTMLInputElement).value).toBe('kept')
  })

  it('shows a project select only when more than one project exists', () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: '+ New task' }))
    expect(screen.queryByLabelText('Project')).toBeNull()
    fireEvent.keyDown(screen.getByLabelText('New task title'), { key: 'Escape' })

    projects.data = [
      { id: 'p1', name: 'Nimbus', key: 'NIM' },
      { id: 'p2', name: 'Zephyr', key: 'ZEP' },
    ]
    renderAt('/')
    fireEvent.click(screen.getAllByRole('button', { name: '+ New task' })[1])
    const sel = screen.getByLabelText('Project')
    fireEvent.change(sel, { target: { value: 'p2' } })
    fireEvent.change(screen.getAllByLabelText('New task title')[0], {
      target: { value: 'In Zephyr' },
    })
    fireEvent.keyDown(screen.getAllByLabelText('New task title')[0], { key: 'Enter' })
    expect(createMutate.mock.calls[0][0].project.id).toBe('p2')
  })

  it('disables + New task when the workspace has no projects', () => {
    projects.data = []
    renderAt('/')
    const btn = screen.getByRole('button', { name: '+ New task' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', 'Create a project first (see docs/admin.md)')
  })
})
