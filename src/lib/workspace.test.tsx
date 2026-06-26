import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'

const { useWorkspaces } = vi.hoisted(() => ({ useWorkspaces: vi.fn() }))
vi.mock('./hooks/useWorkspaces', () => ({ useWorkspaces }))

import { WorkspaceProvider, useActiveWorkspace } from './workspace'

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(WorkspaceProvider, null, children)

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useWorkspaces.mockReturnValue({
    data: [{ id: 'a', name: 'Acme' }, { id: 'b', name: 'Beta' }], isLoading: false,
  })
})

describe('useActiveWorkspace', () => {
  it('defaults to the first workspace', () => {
    const { result } = renderHook(() => useActiveWorkspace(), { wrapper })
    expect(result.current.activeId).toBe('a')
  })
  it('persists and uses the chosen workspace', () => {
    const { result } = renderHook(() => useActiveWorkspace(), { wrapper })
    act(() => result.current.setActiveId('b'))
    expect(localStorage.getItem('activeWorkspace')).toBe('b')
    expect(result.current.activeId).toBe('b')
  })
  it('ignores a stored workspace the user no longer belongs to', () => {
    localStorage.setItem('activeWorkspace', 'gone')
    const { result } = renderHook(() => useActiveWorkspace(), { wrapper })
    expect(result.current.activeId).toBe('a')
  })
})
