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
})
