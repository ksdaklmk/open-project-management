import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { useActivity, useActiveWorkspace } = vi.hoisted(() => ({
  useActivity: vi.fn(),
  useActiveWorkspace: vi.fn(() => ({ activeId: 'w1', setActiveId: vi.fn(), loading: false })),
}))
vi.mock('../../lib/hooks/useActivity', () => ({ useActivity }))
vi.mock('../../lib/workspace', () => ({ useActiveWorkspace }))

import { ActivityView } from './ActivityView'

const MOVED = {
  id: 'a1', verb: 'moved', from_status: 'in_progress', to_status: 'in_review',
  created_at: '2026-06-27T10:00:00Z',
  actor: { name: 'Dana', color: '#6d5ef0' }, task: { ref: 'NIM-101', title: 'Fix login redirect' },
}

const COMMENTED = {
  id: 'a3', verb: 'commented', from_status: null, to_status: null,
  created_at: '2026-06-27T10:00:00Z',
  actor: { name: 'Sam', color: '#6d5ef0' }, task: { ref: 'NIM-7', title: 'Add SSO' },
}

const CREATED = {
  id: 'a4', verb: 'created', from_status: null, to_status: null,
  created_at: '2026-07-07T10:00:00Z',
  actor: { name: 'Kit', color: '#6d5ef0' }, task: { ref: 'NIM-107', title: 'Ship adoption' },
}

beforeEach(() => vi.clearAllMocks())

describe('ActivityView', () => {
  it('renders a commented activity row referencing the task', () => {
    useActivity.mockReturnValue({ data: [COMMENTED], isLoading: false, error: null })
    render(<ActivityView />)
    expect(screen.getByText('Sam')).toBeInTheDocument()
    expect(screen.getByText(/commented on/i)).toBeInTheDocument()
    expect(screen.getByText('NIM-7')).toBeInTheDocument()
    expect(screen.getByText(/Add SSO/)).toBeInTheDocument()
  })

  it('renders a moved activity row with actor, task, and from/to statuses', () => {
    useActivity.mockReturnValue({ data: [MOVED], isLoading: false, error: null })
    render(<ActivityView />)
    expect(screen.getByText('Dana')).toBeInTheDocument()
    expect(screen.getByText('NIM-101')).toBeInTheDocument()
    expect(screen.getByText(/Fix login redirect/)).toBeInTheDocument()
    expect(screen.getByText(/moved/)).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('In Review')).toBeInTheDocument()
  })

  it('renders a created activity row referencing the task', () => {
    useActivity.mockReturnValue({ data: [CREATED], isLoading: false, error: null })
    render(<ActivityView />)
    expect(screen.getByText('Kit')).toBeInTheDocument()
    expect(screen.getByText(/created/)).toBeInTheDocument()
    expect(screen.getByText('NIM-107')).toBeInTheDocument()
    expect(screen.getByText(/Ship adoption/)).toBeInTheDocument()
  })

  it('shows the loading state', () => {
    useActivity.mockReturnValue({ data: undefined, isLoading: true, error: null })
    render(<ActivityView />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows the error state', () => {
    useActivity.mockReturnValue({ data: undefined, isLoading: false, error: new Error('x') })
    render(<ActivityView />)
    expect(screen.getByText(/couldn't load activity/i)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('shows the empty state when there is no activity', () => {
    useActivity.mockReturnValue({ data: [], isLoading: false, error: null })
    render(<ActivityView />)
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument()
  })

  it('falls back gracefully for an unknown verb and null actor/task', () => {
    useActivity.mockReturnValue({
      data: [{ id: 'a2', verb: 'sneezed', from_status: null, to_status: null, created_at: '2026-06-27T10:00:00Z', actor: null, task: null }],
      isLoading: false, error: null,
    })
    render(<ActivityView />)
    expect(screen.getByText(/someone/i)).toBeInTheDocument()
    expect(screen.getByText(/sneezed/)).toBeInTheDocument()
  })
})
