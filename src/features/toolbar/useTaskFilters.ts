import { useSearchParams } from 'react-router-dom'
import type { SavedViewConfiguration } from '../../data/savedViewsRepo'
import type { TaskFilters } from './filterTasks'
import type { SortKey } from './sortTasks'

const LIST_KEYS = ['status', 'priority', 'assignee', 'type', 'tag'] as const
type ListKey = (typeof LIST_KEYS)[number]
const SORT_KEYS: SortKey[] = ['priority', 'due', 'title', 'status']
const CONFIG_KEYS = [...LIST_KEYS, 'q', 'sort', 'group'] as const
// Keep empty segments: '' is a meaningful assignee value (unassigned) and must round-trip.
const csv = (v: string | null): string[] => (v === null ? [] : v.split(','))

export function useTaskFilters() {
  const [params, setParams] = useSearchParams()

  const filters: TaskFilters = {
    status: csv(params.get('status')),
    priority: csv(params.get('priority')),
    assignee: csv(params.get('assignee')),
    type: csv(params.get('type')),
    tag: csv(params.get('tag')),
    q: params.get('q') ?? '',
  }
  const rawSort = params.get('sort')
  const sort: SortKey =
    rawSort && SORT_KEYS.includes(rawSort as SortKey) ? (rawSort as SortKey) : 'priority'
  const savedViewId = params.get('savedView')
  const hasExplicitConfiguration = CONFIG_KEYS.some((key) => params.has(key))

  const detachSavedView = (p: URLSearchParams) => {
    p.delete('savedView')
    return p
  }

  const setList = (key: ListKey, vals: string[]) =>
    setParams(
      (p) => {
        vals.length ? p.set(key, vals.join(',')) : p.delete(key)
        return detachSavedView(p)
      },
      { replace: true },
    )
  const setQ = (q: string) =>
    setParams(
      (p) => {
        q ? p.set('q', q) : p.delete('q')
        return detachSavedView(p)
      },
      { replace: true },
    )
  const setSort = (key: SortKey) =>
    setParams(
      (p) => {
        p.set('sort', key)
        return detachSavedView(p)
      },
      { replace: true },
    )
  const clear = () =>
    setParams(
      (p) => {
        ;[...LIST_KEYS, 'q'].forEach((k) => p.delete(k))
        p.delete('group')
        return detachSavedView(p)
      },
      { replace: true },
    )

  const applySavedView = (configuration: SavedViewConfiguration, id: string) =>
    setParams(
      (p) => {
        for (const key of LIST_KEYS) {
          const values = configuration.filters[key]
          values.length ? p.set(key, values.join(',')) : p.delete(key)
        }
        configuration.filters.q ? p.set('q', configuration.filters.q) : p.delete('q')
        p.set('sort', configuration.sort)
        p.set('group', configuration.group)
        p.set('savedView', id)
        return p
      },
      { replace: true },
    )

  const clearSavedView = () =>
    setParams(
      (p) => {
        p.delete('savedView')
        return p
      },
      { replace: true },
    )

  return {
    filters,
    sort,
    savedViewId,
    hasExplicitConfiguration,
    setList,
    setQ,
    setSort,
    clear,
    applySavedView,
    clearSavedView,
  }
}
