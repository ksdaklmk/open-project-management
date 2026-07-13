import type {
  SavedViewConfiguration,
  SavedViewGroup,
  SavedViewType,
} from '../../data/savedViewsRepo'
import type { TaskFilters } from './filterTasks'
import type { SortKey } from './sortTasks'

export const SAVED_VIEW_TYPES: SavedViewType[] = ['list', 'board', 'gantt', 'timeline']

export const isSavedViewType = (view: string): view is SavedViewType =>
  SAVED_VIEW_TYPES.includes(view as SavedViewType)

export const groupForView = (view: SavedViewType): SavedViewGroup =>
  view === 'gantt' ? 'schedule' : view === 'timeline' ? 'date' : 'status'

export function currentSavedViewConfiguration(
  filters: TaskFilters,
  sort: SortKey,
  view: SavedViewType,
): SavedViewConfiguration {
  return {
    filters: {
      status: [...filters.status],
      priority: [...filters.priority],
      assignee: [...filters.assignee],
      type: [...filters.type],
      tag: [...filters.tag],
      q: filters.q,
    },
    sort,
    group: groupForView(view),
  }
}
