import type { Task } from '../../data/tasksRepo'

// columnTasks: the target column's cards EXCLUDING the dragged task, sorted by position.
export function computeDropPosition(columnTasks: Task[], insertIndex: number): number {
  if (columnTasks.length === 0) return 0
  if (insertIndex <= 0) return columnTasks[0].position - 1
  if (insertIndex >= columnTasks.length) return columnTasks[columnTasks.length - 1].position + 1
  return (columnTasks[insertIndex - 1].position + columnTasks[insertIndex].position) / 2
}

// columnInclDragged: the target column's tasks INCLUDING the dragged card if same-status,
// position-sorted ascending. Handles the index-space mismatch between the full rendered
// column (which includes the dragged card at opacity .35) and the filtered list that
// computeDropPosition operates on.
export function dropPosition(
  columnInclDragged: Task[],
  draggedId: string,
  insertIndex: number,
): number {
  const draggedIdx = columnInclDragged.findIndex((t) => t.id === draggedId)
  // When dragging downward intra-column, insertIndex is in the full-column space which is
  // one higher than the filtered-column space for any slot below the dragged card.
  const adj = draggedIdx >= 0 && insertIndex > draggedIdx ? insertIndex - 1 : insertIndex
  const colTasks = columnInclDragged.filter((t) => t.id !== draggedId)
  return computeDropPosition(colTasks, adj)
}

export function dropTarget(columnInclDragged: Task[], draggedId: string, insertIndex: number) {
  const draggedIdx = columnInclDragged.findIndex((task) => task.id === draggedId)
  const adjustedIndex = draggedIdx >= 0 && insertIndex > draggedIdx ? insertIndex - 1 : insertIndex
  const columnTasks = columnInclDragged.filter((task) => task.id !== draggedId)
  const boundedIndex = Math.max(0, Math.min(adjustedIndex, columnTasks.length))
  return {
    beforeTaskId: columnTasks[boundedIndex - 1]?.id ?? null,
    afterTaskId: columnTasks[boundedIndex]?.id ?? null,
    position: computeDropPosition(columnTasks, boundedIndex),
  }
}
