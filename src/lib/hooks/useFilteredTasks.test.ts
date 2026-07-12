import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

vi.mock('./useTasks', () => ({
  useTasks: () => ({
    data: [
      {
        id: 'a',
        ref: 'NIM-1',
        status: 'todo',
        priority: 'low',
        assignee_id: null,
        type: 'feature',
        tags: [],
        title: 'a',
        description: '',
      },
      {
        id: 'b',
        ref: 'NIM-2',
        status: 'done',
        priority: 'low',
        assignee_id: null,
        type: 'feature',
        tags: [],
        title: 'b',
        description: '',
      },
    ],
    isLoading: false,
    error: null,
  }),
}))
import { useFilteredTasks } from './useFilteredTasks'

const wrap =
  (initial: string) =>
  ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      MemoryRouter,
      {
        initialEntries: [initial],
        future: { v7_startTransition: true, v7_relativeSplatPath: true },
      },
      children,
    )

describe('useFilteredTasks', () => {
  it('narrows the task list by the URL filters', () => {
    const { result } = renderHook(() => useFilteredTasks('w1'), { wrapper: wrap('/?status=done') })
    expect(result.current.data?.map((t) => t.id)).toEqual(['b'])
  })
  it('passes everything through when no filters are set', () => {
    const { result } = renderHook(() => useFilteredTasks('w1'), { wrapper: wrap('/') })
    expect(result.current.data).toHaveLength(2)
  })
})
