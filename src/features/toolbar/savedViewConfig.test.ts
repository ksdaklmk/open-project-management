import { describe, expect, it } from 'vitest'
import { currentSavedViewConfiguration, groupForView, isSavedViewType } from './savedViewConfig'

describe('savedViewConfig', () => {
  it('builds an independent configuration snapshot', () => {
    const filters = {
      status: ['todo'],
      priority: [],
      assignee: [''],
      type: [],
      tag: ['API'],
      q: 'launch',
    }
    const result = currentSavedViewConfiguration(filters, 'due', 'list')
    expect(result).toEqual({ filters, sort: 'due', group: 'status' })
    result.filters.status.push('done')
    expect(filters.status).toEqual(['todo'])
  })

  it('pins grouping to each supported view implementation', () => {
    expect(groupForView('board')).toBe('status')
    expect(groupForView('gantt')).toBe('schedule')
    expect(groupForView('timeline')).toBe('date')
    expect(isSavedViewType('list')).toBe(true)
    expect(isSavedViewType('activity')).toBe(false)
  })
})
