import { describe, it, expect } from 'vitest'
import { computeDropPosition, dropPosition, dropTarget } from './computeDropPosition'
import type { Task } from '../../data/tasksRepo'

const at = (pos: number, id = `t${pos}`): Task => ({ id, position: pos }) as Task

describe('computeDropPosition', () => {
  it('returns 0 for an empty column', () => {
    expect(computeDropPosition([], 0)).toBe(0)
  })
  it('places above the first card', () => {
    expect(computeDropPosition([at(10), at(20)], 0)).toBe(9)
  })
  it('places below the last card', () => {
    expect(computeDropPosition([at(10), at(20)], 2)).toBe(21)
  })
  it('averages the neighbors when inserting between', () => {
    expect(computeDropPosition([at(10), at(20)], 1)).toBe(15)
  })
})

describe('dropPosition', () => {
  // Intra-column downward: T1 dragged down, hover gap between T2 and T3 (insertIndex=2)
  it('intra-column downward — corrects index so card lands between neighbors', () => {
    const col = [at(0, 'T1'), at(1, 'T2'), at(2, 'T3')]
    // hoverIndex=2 in the full column means "after T2, before T3"
    // after removing T1 that's index 1 in the [T2,T3] slice → midpoint 1.5
    expect(dropPosition(col, 'T1', 2)).toBe(1.5)
  })

  // Intra-column upward: T3 dragged up, hover gap between T1 and T2 (insertIndex=1)
  it('intra-column upward — no adjustment needed, places between first two cards', () => {
    const col = [at(0, 'T1'), at(1, 'T2'), at(2, 'T3')]
    // hoverIndex=1 in the full column, T3 is at index 2 which is >= 1, no adjustment
    // Wait, T3 is at index 2 and insertIndex is 1. draggedIdx (2) >= insertIndex (1) is false,
    // so adj = insertIndex = 1. colTasks = [T1, T2]. computeDropPosition([T1,T2], 1) = 0.5
    expect(dropPosition(col, 'T3', 1)).toBe(0.5)
  })

  // Cross-column: draggedId not in the column (empty target → 0)
  it('cross-column drop onto empty column → 0', () => {
    expect(dropPosition([], 'T_other', 0)).toBe(0)
  })

  // Cross-column: draggedId not in the column (drop at bottom)
  it('cross-column drop at bottom of non-empty column → last.position + 1', () => {
    const col = [at(10, 'T2'), at(20, 'T3')]
    // draggedId not present, no adjustment, insertIndex=2 >= length → 20 + 1 = 21
    expect(dropPosition(col, 'T_other', 2)).toBe(21)
  })

  // Dropping card onto its own slot (draggedIdx === insertIndex): sane value, doesn't skip past neighbor
  it('same-slot drop — lands between self and next card without jumping past it', () => {
    const col = [at(0, 'T1'), at(1, 'T2'), at(2, 'T3')]
    // T1 at index 0, insertIndex 0 (top slot). draggedIdx=0, insertIndex=0, adj=0
    // colTasks=[T2,T3], computeDropPosition([T2,T3],0) = T2.position - 1 = 0
    expect(dropPosition(col, 'T1', 0)).toBe(0)
  })
})

describe('dropTarget', () => {
  it('returns visible neighbour IDs and an optimistic position', () => {
    expect(dropTarget([at(10, 'a'), at(20, 'b')], 'x', 1)).toEqual({
      beforeTaskId: 'a',
      afterTaskId: 'b',
      position: 15,
    })
  })

  it('adjusts downward same-column drops around the dragged card', () => {
    expect(dropTarget([at(10, 'a'), at(20, 'drag'), at(30, 'b')], 'drag', 3)).toEqual({
      beforeTaskId: 'b',
      afterTaskId: null,
      position: 31,
    })
  })
})
