import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Shell } from './Shell'

const { ws, mockSignOut, members } = vi.hoisted(() => ({
  ws: { activeId: 'w1' as string | null, loading: false },
  mockSignOut: vi.fn(),
  members: { data: [{ user_id: 'u1', role: 'owner' }] as { user_id: string; role: string }[] },
}))
vi.mock('../lib/workspace', () => ({
  useActiveWorkspace: () => ({ ...ws, setActiveId: vi.fn() }),
}))
vi.mock('../lib/hooks/useSession', () => ({ signOut: mockSignOut, useActorId: () => 'u1' }))
vi.mock('../lib/hooks/useMembers', () => ({ useMembers: () => members }))

vi.mock('../components/WorkspaceSwitcher', () => ({
  WorkspaceSwitcher: () => null,
}))
vi.mock('../features/listView/ListView', () => ({
  ListView: () => null,
}))
vi.mock('../features/boardView/BoardView', () => ({
  BoardView: () => <div>board view</div>,
}))
vi.mock('../features/activityView/ActivityView', () => ({
  ActivityView: () => <div>activity feed mounted</div>,
}))
vi.mock('../features/ganttView/GanttView', () => ({
  GanttView: () => <div>gantt mounted</div>,
}))
vi.mock('../features/timelineView/TimelineView', () => ({
  TimelineView: () => <div>timeline mounted</div>,
}))
vi.mock('../features/workloadView/WorkloadView', () => ({
  WorkloadView: () => <div>workload mounted</div>,
}))
vi.mock('../features/settings/WorkspaceSettings', () => ({
  WorkspaceSettings: () => <div>settings mounted</div>,
  CreateWorkspaceForm: () => <div>Create your workspace</div>,
}))
vi.mock('../features/taskDrawer/TaskDrawer', () => ({ TaskDrawer: () => null }))
vi.mock('../features/toolbar/Toolbar', () => ({ Toolbar: () => null }))

const renderShell = () =>
  render(
    <MemoryRouter
      initialEntries={['/']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Shell />
    </MemoryRouter>,
  )

describe('Shell', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    ws.activeId = 'w1'
    ws.loading = false
    mockSignOut.mockClear()
    members.data = [{ user_id: 'u1', role: 'owner' }]
  })

  it('shows all six work views and settings to an owner', async () => {
    renderShell()
    for (const t of ['List', 'Board', 'Gantt', 'Timeline', 'Activity', 'Workload'])
      expect(screen.getByRole('button', { name: t })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    // Flush the lazy view's resolution inside act so it doesn't land after
    // the test and warn.
    await act(async () => {})
  })

  it('hides settings navigation from ordinary members', async () => {
    members.data = [{ user_id: 'u1', role: 'member' }]
    renderShell()
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull()
    await act(async () => {})
  })

  it('mounts settings for an owner', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(await screen.findByText('settings mounted')).toBeInTheDocument()
  })

  it('switches the active view when a tab is clicked', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Board' }))
    expect(await screen.findByText('board view')).toBeInTheDocument()
  })

  it('toggles the theme', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: /theme/i }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('slate')
  })

  it('applies the stored theme to the DOM on mount (render-synced, self-healing)', () => {
    localStorage.setItem('theme', 'slate')
    renderShell()
    expect(document.documentElement.getAttribute('data-theme')).toBe('slate')
  })

  it('mounts the Activity view on the Activity tab', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Activity' }))
    expect(await screen.findByText('activity feed mounted')).toBeInTheDocument()
  })

  it('mounts the Gantt view on the Gantt tab', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Gantt' }))
    expect(await screen.findByText('gantt mounted')).toBeInTheDocument()
  })

  it('mounts the Timeline view on the Timeline tab', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Timeline' }))
    expect(await screen.findByText('timeline mounted')).toBeInTheDocument()
  })

  it('mounts the Workload view on the Workload tab', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Workload' }))
    expect(await screen.findByText('workload mounted')).toBeInTheDocument()
  })

  it('shows the no-workspace state when the member list is loaded but empty', async () => {
    ws.activeId = null
    renderShell()
    expect(await screen.findByText('Create your workspace')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Board' })).toBeNull() // no app chrome
  })

  it('signs out from the no-workspace state', async () => {
    ws.activeId = null
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })

  it('does not flash the no-workspace state while workspaces load', () => {
    ws.activeId = null
    ws.loading = true
    renderShell()
    expect(screen.queryByText('No workspace yet')).toBeNull()
    expect(screen.getByRole('button', { name: 'Board' })).toBeInTheDocument()
  })
})
