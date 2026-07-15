import { parseDate, startOfWeek, addDays, daysBetween } from '../../lib/weeks'
import type { Task } from '../../data/tasksRepo'

export function splitGantt(tasks: Task[]): { scheduled: Task[]; unscheduled: Task[] } {
  const scheduled: Task[] = []
  const unscheduled: Task[] = []
  for (const t of tasks) (t.start_date && t.end_date ? scheduled : unscheduled).push(t)
  return { scheduled, unscheduled }
}

export interface GanttScale {
  weeks: { start: Date; label: string }[]
  rangeStart: Date
  rangeDays: number
  todayPct: number | null
  position(start: Date, end: Date): { leftPct: number; widthPct: number }
}

const LABEL = { month: 'short', day: 'numeric' } as const

export function buildScale(scheduled: Task[], now: Date, markerDates: Date[] = []): GanttScale {
  const starts = [
    ...scheduled.map((t) => parseDate(t.start_date!).getTime()),
    ...markerDates.map((date) => date.getTime()),
  ]
  const ends = [
    ...scheduled.map((t) => parseDate(t.end_date!).getTime()),
    ...markerDates.map((date) => date.getTime()),
  ]
  const rangeStart = startOfWeek(new Date(Math.min(...starts)))
  const lastWeek = startOfWeek(new Date(Math.max(...ends)))
  const weekCount = Math.floor(daysBetween(rangeStart, lastWeek) / 7) + 1
  const weeks = Array.from({ length: weekCount }, (_, i) => {
    const start = addDays(rangeStart, i * 7)
    return { start, label: start.toLocaleDateString('en-US', LABEL) }
  })
  const rangeDays = weekCount * 7
  // Marker reflects today's DATE: normalize now to local midnight (whole-day
  // offset), and hide it once today leaves the range — valid offsets are
  // 0..rangeDays-1; rangeDays itself is the day after the last range day.
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayOffset = daysBetween(rangeStart, todayMidnight)
  const todayPct =
    todayOffset >= 0 && todayOffset < rangeDays ? (todayOffset / rangeDays) * 100 : null

  return {
    weeks,
    rangeStart,
    rangeDays,
    todayPct,
    position(start, end) {
      const leftPct = Math.max(0, (daysBetween(rangeStart, start) / rangeDays) * 100)
      const widthPct = Math.min(((daysBetween(start, end) + 1) / rangeDays) * 100, 100 - leftPct)
      return { leftPct, widthPct }
    },
  }
}
