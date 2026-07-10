import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Shell } from './Shell'

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
vi.mock('../features/taskDrawer/TaskDrawer', () => ({ TaskDrawer: () => null }))
vi.mock('../features/toolbar/Toolbar', () => ({ Toolbar: () => null }))

const renderShell = () =>
  render(
    <MemoryRouter initialEntries={['/']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Shell />
    </MemoryRouter>,
  )

describe('Shell', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('shows all six view tabs', async () => {
    renderShell()
    for (const t of ['List', 'Board', 'Gantt', 'Timeline', 'Activity', 'Workload'])
      expect(screen.getByRole('button', { name: t })).toBeInTheDocument()
    // Flush the lazy view's resolution inside act so it doesn't land after
    // the test and warn.
    await act(async () => {})
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
})
