import type { Task } from '../../data/tasksRepo'

// columnTasks: the target column's cards EXCLUDING the dragged task, sorted by position.
export function computeDropPosition(columnTasks: Task[], insertIndex: number): number {
  if (columnTasks.length === 0) return 0
  if (insertIndex <= 0) return columnTasks[0].position - 1
  if (insertIndex >= columnTasks.length) return columnTasks[columnTasks.length - 1].position + 1
  return (columnTasks[insertIndex - 1].position + columnTasks[insertIndex].position) / 2
}
