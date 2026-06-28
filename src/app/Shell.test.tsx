import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

  it('shows all six view tabs', () => {
    renderShell()
    for (const t of ['List', 'Board', 'Gantt', 'Timeline', 'Activity', 'Workload'])
      expect(screen.getByRole('button', { name: t })).toBeInTheDocument()
  })

  it('switches the active view when a tab is clicked', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Board' }))
    expect(screen.getByTestId('view-region')).toHaveTextContent('board')
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
    expect(screen.getByTestId('view-region')).toHaveTextContent('activity feed mounted')
  })

  it('mounts the Gantt view on the Gantt tab', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Gantt' }))
    expect(screen.getByTestId('view-region')).toHaveTextContent('gantt mounted')
  })

  it('mounts the Timeline view on the Timeline tab', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Timeline' }))
    expect(screen.getByTestId('view-region')).toHaveTextContent('timeline mounted')
  })

  it('mounts the Workload view on the Workload tab', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Workload' }))
    expect(screen.getByTestId('view-region')).toHaveTextContent('workload mounted')
  })
})
