import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { useWorkspaces, setActiveId, useActiveWorkspace } = vi.hoisted(() => {
  const setActiveId = vi.fn()
  return {
    setActiveId,
    useWorkspaces: vi.fn(),
    useActiveWorkspace: vi.fn(() => ({ activeId: 'a', setActiveId, loading: false })),
  }
})
vi.mock('../lib/hooks/useWorkspaces', () => ({ useWorkspaces }))
vi.mock('../lib/workspace', () => ({ useActiveWorkspace }))

import { WorkspaceSwitcher } from './WorkspaceSwitcher'

beforeEach(() => {
  vi.clearAllMocks()
  useWorkspaces.mockReturnValue({ data: [{ id: 'a', name: 'Acme' }, { id: 'b', name: 'Beta' }] })
})

describe('WorkspaceSwitcher', () => {
  it('lists workspaces and reflects the active one', () => {
    render(<WorkspaceSwitcher />)
    expect(screen.getByRole('combobox')).toHaveValue('a')
    expect(screen.getByRole('option', { name: 'Beta' })).toBeInTheDocument()
  })
  it('switches the active workspace on change', async () => {
    render(<WorkspaceSwitcher />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'b')
    expect(setActiveId).toHaveBeenCalledWith('b')
  })
})
