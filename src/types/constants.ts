export const STATUSES = [
  { id: 'backlog',     label: 'Backlog',     color: '#9aa0ad' },
  { id: 'todo',        label: 'To Do',       color: '#4f86f7' },
  { id: 'in_progress', label: 'In Progress', color: '#f5a623' },
  { id: 'in_review',   label: 'In Review',   color: '#a06bf0' },
  { id: 'done',        label: 'Done',        color: '#2bb673' },
] as const
export type Status = (typeof STATUSES)[number]['id']

export const PRIORITIES = [
  { id: 'urgent', label: 'Urgent', color: '#e5484d', rank: 4 },
  { id: 'high',   label: 'High',   color: '#f2820a', rank: 3 },
  { id: 'medium', label: 'Medium', color: '#d9a118', rank: 2 },
  { id: 'low',    label: 'Low',    color: '#8a93a6', rank: 1 },
] as const
export type Priority = (typeof PRIORITIES)[number]['id']

export const TASK_TYPES = {
  feature:     { label: 'Feature',     color: '#6d5ef0', shape: 'square' },
  bug:         { label: 'Bug',         color: '#e5484d', shape: 'circle' },
  chore:       { label: 'Chore',       color: '#8a93a6', shape: 'line' },
  improvement: { label: 'Improvement', color: '#14b8a6', shape: 'triangle' },
} as const
export type TaskTypeId = keyof typeof TASK_TYPES

// Partial fixed map; reconcile the full set against the design (DesignSync).
export const TAG_COLORS: Record<string, string> = {
  Frontend: '#3b82f6', Backend: '#22a06b', API: '#14b8a6',
  Design: '#8b5cf6', Mobile: '#ef6b53',
}
