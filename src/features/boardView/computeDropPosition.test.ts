import { describe, it, expect } from 'vitest'
import { computeDropPosition } from './computeDropPosition'
import type { Task } from '../../data/tasksRepo'

const at = (pos: number): Task => ({ position: pos } as Task)

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
