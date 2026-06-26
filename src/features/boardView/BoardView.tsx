import { useTasks } from '../../lib/hooks/useTasks'
import { useMembers } from '../../lib/hooks/useMembers'
import { useActiveWorkspace } from '../../lib/workspace'
import { boardColumns } from './boardColumns'
import { BoardColumn } from './BoardColumn'

export function BoardView() {
  const { activeId, loading: wsLoading } = useActiveWorkspace()
  const { data: tasks, isLoading, error } = useTasks(activeId ?? '')
  const { data: members } = useMembers(activeId ?? '')

  if (wsLoading || isLoading) return <p className="text-[var(--muted)]">Loading…</p>
  if (error) return <p className="text-[var(--muted)]">Couldn't load tasks.</p>

  const columns = boardColumns(tasks ?? [])
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((c) => (
        <BoardColumn key={c.status} status={c.status} tasks={c.tasks} members={members ?? []} />
      ))}
    </div>
  )
}
