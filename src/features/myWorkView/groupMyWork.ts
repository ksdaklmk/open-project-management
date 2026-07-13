import type { MyWorkGroup, MyWorkItem } from '../../data/myWorkRepo'

function dateBucket(item: MyWorkItem, today: string): string {
  if (!item.endDate) return 'No due date'
  if (item.endDate < today && item.status !== 'done') return 'Overdue'
  if (item.endDate === today) return 'Due today'
  return 'Upcoming'
}

export function groupMyWork(
  items: MyWorkItem[],
  group: MyWorkGroup,
  today = new Date().toISOString().slice(0, 10),
): Array<[string, MyWorkItem[]]> {
  const grouped = new Map<string, MyWorkItem[]>()
  for (const item of items) {
    const key =
      group === 'workspace'
        ? item.workspaceName
        : group === 'project'
          ? `${item.workspaceName} / ${item.projectName}`
          : dateBucket(item, today)
    grouped.set(key, [...(grouped.get(key) ?? []), item])
  }
  return [...grouped.entries()]
}
