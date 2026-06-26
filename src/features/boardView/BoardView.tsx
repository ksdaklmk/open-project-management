import { useRef } from 'react'
import { useTasks } from '../../lib/hooks/useTasks'
import { useMembers } from '../../lib/hooks/useMembers'
import { useMoveTask } from '../../lib/hooks/useMoveTask'
import { useActiveWorkspace } from '../../lib/workspace'
import { boardColumns } from './boardColumns'
import { BoardColumn } from './BoardColumn'
import { computeDropPosition } from './computeDropPosition'
import type { Status } from '../../types/constants'

export function BoardView() {
  const { activeId, loading: wsLoading } = useActiveWorkspace()
  const { data: tasks, isLoading, error } = useTasks(activeId ?? '')
  const { data: members } = useMembers(activeId ?? '')
  const move = useMoveTask(activeId ?? '')
  const dragId = useRef<string | null>(null)

  const onCardDragStart = (taskId: string) => { dragId.current = taskId }

  const onDrop = (toStatus: Status, insertIndex: number) => {
    const taskId = dragId.current
    dragId.current = null
    if (!taskId) return
    const all = tasks ?? []
    const dragged = all.find((t) => t.id === taskId)
    if (!dragged) return
    const colTasks = all
      .filter((t) => t.status === toStatus && t.id !== taskId)
      .sort((a, b) => a.position - b.position)
    const position = computeDropPosition(colTasks, insertIndex)
    move.mutate({ taskId, toStatus, position, fromStatus: dragged.status })
  }

  if (wsLoading || isLoading) return <p className="text-[var(--muted)]">Loading…</p>
  if (error) return <p className="text-[var(--muted)]">Couldn't load tasks.</p>

  const columns = boardColumns(tasks ?? [])
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((c) => (
        <BoardColumn
          key={c.status}
          status={c.status}
          tasks={c.tasks}
          members={members ?? []}
          onCardDragStart={onCardDragStart}
          onDrop={onDrop}
        />
      ))}
    </div>
  )
}
