import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, useSearchParams } from 'react-router-dom'

vi.mock('../../lib/workspace', () => ({ useActiveWorkspace: () => ({ activeId: 'w1', loading: false }) }))
vi.mock('../../lib/hooks/useMembers', () => ({ useMembers: () => ({ data: [] }) }))
import { Toolbar } from './Toolbar'

function Probe() {
  const [params] = useSearchParams()
  return <output data-testid="qs">{params.toString()}</output>
}
const renderAt = (initial: string, showSort = false) =>
  render(
    <MemoryRouter initialEntries={[initial]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Toolbar showSort={showSort} />
      <Probe />
    </MemoryRouter>,
  )

describe('Toolbar', () => {
  it('checking a status writes it to the URL', () => {
    renderAt('/')
    fireEvent.click(screen.getByLabelText('To Do'))
    expect(screen.getByTestId('qs').textContent).toContain('status=todo')
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
})
