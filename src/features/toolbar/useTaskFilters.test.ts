import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import { useTaskFilters } from './useTaskFilters'

const wrap = (initial: string) => ({ children }: { children: React.ReactNode }) =>
  React.createElement(MemoryRouter, { initialEntries: [initial], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, children)

describe('useTaskFilters', () => {
  it('parses comma lists, q, and sort from the URL', () => {
    const { result } = renderHook(() => useTaskFilters(), { wrapper: wrap('/?status=todo,done&q=login&sort=due') })
    expect(result.current.filters.status).toEqual(['todo', 'done'])
    expect(result.current.filters.q).toBe('login')
    expect(result.current.sort).toBe('due')
  })
  it('defaults to empty filters and priority sort', () => {
    const { result } = renderHook(() => useTaskFilters(), { wrapper: wrap('/') })
    expect(result.current.filters).toEqual({ status: [], priority: [], assignee: [], type: [], tag: [], q: '' })
    expect(result.current.sort).toBe('priority')
  })
  it('setList writes a comma list and clears the key when empty', () => {
    const { result } = renderHook(() => useTaskFilters(), { wrapper: wrap('/?status=todo') })
    act(() => result.current.setList('priority', ['high', 'urgent']))
    expect(result.current.filters.priority).toEqual(['high', 'urgent'])
    act(() => result.current.setList('status', []))
    expect(result.current.filters.status).toEqual([])
  })
  it('clear removes every filter key', () => {
    const { result } = renderHook(() => useTaskFilters(), { wrapper: wrap('/?status=todo&q=x&tag=API') })
    act(() => result.current.clear())
    expect(result.current.filters).toEqual({ status: [], priority: [], assignee: [], type: [], tag: [], q: '' })
  })
})
