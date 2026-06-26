import { useTasks } from '../../lib/hooks/useTasks'
import { useMembers } from '../../lib/hooks/useMembers'
import { useActiveWorkspace } from '../../lib/workspace'
import { useViewState } from '../../app/useViewState'
import { groupTasksByStatus } from './grouping'
import { TaskTable } from './TaskTable'

export function ListView() {
  const { activeId } = useActiveWorkspace()
  const { data: tasks, isLoading, error } = useTasks(activeId ?? '')
  const { data: members } = useMembers(activeId ?? '')
  const { setTaskRef } = useViewState()

  if (isLoading) return <p className="text-[var(--muted)]">Loading…</p>
  if (error) return <p className="text-[var(--muted)]">Couldn't load tasks.</p>
  const groups = groupTasksByStatus(tasks ?? [])
  if (groups.length === 0) return <p className="text-[var(--muted)]">No tasks yet.</p>

  return (
    <div>
      {groups.map((g) => (
        <TaskTable key={g.status} status={g.status} tasks={g.tasks}
          members={members ?? []} onSelect={setTaskRef} />
      ))}
    </div>
  )
}
