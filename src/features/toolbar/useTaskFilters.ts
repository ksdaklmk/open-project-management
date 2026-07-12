import { useSearchParams } from 'react-router-dom'
import type { TaskFilters } from './filterTasks'
import type { SortKey } from './sortTasks'

const LIST_KEYS = ['status', 'priority', 'assignee', 'type', 'tag'] as const
type ListKey = (typeof LIST_KEYS)[number]
const SORT_KEYS: SortKey[] = ['priority', 'due', 'title', 'status']
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

  const setList = (key: ListKey, vals: string[]) =>
    setParams(
      (p) => {
        vals.length ? p.set(key, vals.join(',')) : p.delete(key)
        return p
      },
      { replace: true },
    )
  const setQ = (q: string) =>
    setParams(
      (p) => {
        q ? p.set('q', q) : p.delete('q')
        return p
      },
      { replace: true },
    )
  const setSort = (key: SortKey) =>
    setParams(
      (p) => {
        p.set('sort', key)
        return p
      },
      { replace: true },
    )
  const clear = () =>
    setParams(
      (p) => {
        ;[...LIST_KEYS, 'q'].forEach((k) => p.delete(k))
        return p
      },
      { replace: true },
    )

  return { filters, sort, setList, setQ, setSort, clear }
}
