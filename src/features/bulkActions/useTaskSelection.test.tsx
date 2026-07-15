import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Task } from '../../data/tasksRepo'
import { MAX_BULK_SELECTION, useTaskSelection } from './useTaskSelection'

const tasks = (...ids: string[]) => ids.map((id) => ({ id }) as Task)

describe('useTaskSelection', () => {
  it('toggles, groups, clears, and scopes selection to a workspace', () => {
    const { result, rerender } = renderHook(
      ({ workspaceId, visibleTasks }) => useTaskSelection(workspaceId, visibleTasks),
      { initialProps: { workspaceId: 'w1', visibleTasks: tasks('t1', 't2', 't3') } },
    )

    act(() => result.current.toggle('t1'))
    expect([...result.current.selectedIds]).toEqual(['t1'])
    act(() => result.current.toggle('t1'))
    expect(result.current.selectedIds.size).toBe(0)

    act(() => result.current.setMany(['t1', 't2'], true))
    expect(result.current.isAllSelected(['t1', 't2'])).toBe(true)
    act(() => result.current.setMany(['t1'], false))
    expect([...result.current.selectedIds]).toEqual(['t2'])

    rerender({ workspaceId: 'w2', visibleTasks: tasks('t1', 't2', 't3') })
    expect(result.current.selectedIds.size).toBe(0)
    act(() => result.current.toggle('t3'))
    rerender({ workspaceId: 'w1', visibleTasks: tasks('t1', 't2', 't3') })
    expect([...result.current.selectedIds]).toEqual(['t2'])

    act(() => result.current.clear())
    expect(result.current.isAllSelected([])).toBe(false)
  })

  it('drops hidden ids from the actionable selection and enforces the 500-task cap', () => {
    const visibleTasks = tasks(
      ...Array.from({ length: MAX_BULK_SELECTION + 1 }, (_, index) => `t${index}`),
    )
    const { result, rerender } = renderHook(
      ({ currentTasks }) => useTaskSelection('w1', currentTasks),
      { initialProps: { currentTasks: visibleTasks } },
    )

    act(() =>
      result.current.setMany(
        visibleTasks.map((task) => task.id),
        true,
      ),
    )
    expect(result.current.selectedIds.size).toBe(MAX_BULK_SELECTION)

    rerender({ currentTasks: tasks('t500') })
    expect(result.current.selectedIds.size).toBe(0)
  })
})
