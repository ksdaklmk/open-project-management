import { useSearchParams } from 'react-router-dom'

export type ViewId = 'list' | 'board' | 'gantt' | 'timeline' | 'activity' | 'workload'
export const VIEWS: ViewId[] = ['list', 'board', 'gantt', 'timeline', 'activity', 'workload']

export function useViewState() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('view') as ViewId | null
  const view: ViewId = raw && VIEWS.includes(raw) ? raw : 'list'
  const taskRef = params.get('task')

  const setView = (v: ViewId) =>
    setParams(p => { p.set('view', v); return p }, { replace: true })
  const setTaskRef = (ref: string | null) =>
    setParams(p => { ref ? p.set('task', ref) : p.delete('task'); return p }, { replace: true })

  return { view, taskRef, setView, setTaskRef }
}
