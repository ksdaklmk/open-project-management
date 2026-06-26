import { useTasks } from '../../lib/hooks/useTasks'
import { useMembers } from '../../lib/hooks/useMembers'
import { useActiveWorkspace } from '../../lib/workspace'
import { useViewState } from '../../app/useViewState'
import { useUpdateTask } from '../../lib/hooks/useUpdateTask'
import { groupTasksByStatus } from './grouping'
import { TaskTable } from './TaskTable'

export function ListView() {
  const { activeId } = useActiveWorkspace()
  const { data: tasks, isLoading, error } = useTasks(activeId ?? '')
  const { data: members } = useMembers(activeId ?? '')
  const { setTaskRef } = useViewState()
  const update = useUpdateTask(activeId ?? '')
  const onPatch = (id: string, patch: Parameters<typeof update.mutate>[0]['patch']) =>
    update.mutate({ id, patch })

  if (isLoading) return <p className="text-[var(--muted)]">Loading…</p>
  if (error) return <p className="text-[var(--muted)]">Couldn't load tasks.</p>
  const groups = groupTasksByStatus(tasks ?? [])
  if (groups.length === 0) return <p className="text-[var(--muted)]">No tasks yet.</p>

  return (
    <div>
      {groups.map((g) => (
        <TaskTable key={g.status} status={g.status} tasks={g.tasks}
          members={members ?? []} onSelect={setTaskRef} onPatch={onPatch} />
      ))}
    </div>
  )
}
