import { addDays, isoLocal, parseDate, startOfWeek } from '../../lib/weeks'
import type { Task, WorkloadPoint } from '../../data/tasksRepo'
import type { Member } from '../../data/membersRepo'

export type Level = 'none' | 'under' | 'near' | 'over'
export interface Cell {
  points: number
  ratio: number | null
  level: Level
}
export interface Row {
  id: string
  name: string
  capacity: number | null
  cells: Cell[]
  total: number
}
export interface WeekCol {
  key: string
  label: string
}
export interface Workload {
  weeks: WeekCol[]
  rows: Row[]
  unscheduledPoints: number
  outOfRangePoints: number
}

const WEEKS = 6
const UNASSIGNED = '__unassigned__'

const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

function levelFor(points: number, ratio: number | null): Level {
  if (points === 0 || ratio === null) return 'none'
  if (ratio <= 0.8) return 'under'
  if (ratio <= 1) return 'near'
  return 'over'
}

export function buildWorkload(tasks: Task[], members: Member[], now: Date): Workload {
  const monday0 = startOfWeek(now)
  const weeks: WeekCol[] = Array.from({ length: WEEKS }, (_, i) => {
    const d = addDays(monday0, i * 7)
    return { key: isoLocal(d), label: fmt(d) }
  })
  const windowKeys = new Set(weeks.map((w) => w.key))

  const load: Record<string, Record<string, number>> = {}
  let unscheduledPoints = 0
  let outOfRangePoints = 0

  for (const task of tasks) {
    if (task.status === 'done') continue
    const points = task.points ?? 0
    if (points === 0) continue
    if (!task.start_date) {
      unscheduledPoints += points
      continue
    }
    const wk = isoLocal(startOfWeek(parseDate(task.start_date)))
    if (!windowKeys.has(wk)) {
      outOfRangePoints += points
      continue
    }
    const who = task.assignee_id ?? UNASSIGNED
    load[who] ??= {}
    load[who][wk] = (load[who][wk] ?? 0) + points // ?? 0 is runtime-required (index is undefined on first write)
  }

  const rowFor = (id: string, name: string, capacity: number | null): Row => {
    let total = 0
    const cells = weeks.map((w): Cell => {
      const points = load[id]?.[w.key] ?? 0
      total += points
      const ratio = capacity !== null && capacity > 0 ? points / capacity : null
      // Unassigned (capacity null) stays neutral regardless of points.
      const level = capacity === null ? 'none' : levelFor(points, ratio)
      return { points, ratio, level }
    })
    return { id, name, capacity, cells, total }
  }

  const rows = members
    .map((mem) => rowFor(mem.user_id, mem.name.trim() || 'Someone', mem.capacity_per_week))
    .sort((a, b) => a.name.localeCompare(b.name))

  if (load[UNASSIGNED]) rows.push(rowFor(UNASSIGNED, 'Unassigned', null))

  return { weeks, rows, unscheduledPoints, outOfRangePoints }
}

export function buildWorkloadFromPoints(
  points: WorkloadPoint[],
  members: Member[],
  now: Date,
): Workload {
  const monday0 = startOfWeek(now)
  const weeks: WeekCol[] = Array.from({ length: WEEKS }, (_, i) => {
    const date = addDays(monday0, i * 7)
    return { key: isoLocal(date), label: fmt(date) }
  })
  const load: Record<string, Record<string, number>> = {}
  let unscheduledPoints = 0
  let outOfRangePoints = 0

  for (const point of points) {
    if (point.bucket === 'unscheduled') {
      unscheduledPoints += point.points
      continue
    }
    if (point.bucket === 'out_of_range') {
      outOfRangePoints += point.points
      continue
    }
    if (!point.weekStart) continue
    const who = point.assigneeId ?? UNASSIGNED
    load[who] ??= {}
    load[who][point.weekStart] = point.points
  }

  const rowFor = (id: string, name: string, capacity: number | null): Row => {
    let total = 0
    const cells = weeks.map((week): Cell => {
      const cellPoints = load[id]?.[week.key] ?? 0
      total += cellPoints
      const ratio = capacity !== null && capacity > 0 ? cellPoints / capacity : null
      return {
        points: cellPoints,
        ratio,
        level: capacity === null ? 'none' : levelFor(cellPoints, ratio),
      }
    })
    return { id, name, capacity, cells, total }
  }

  const rows = members
    .map((member) =>
      rowFor(member.user_id, member.name.trim() || 'Someone', member.capacity_per_week),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
  if (load[UNASSIGNED]) rows.push(rowFor(UNASSIGNED, 'Unassigned', null))
  return { weeks, rows, unscheduledPoints, outOfRangePoints }
}
