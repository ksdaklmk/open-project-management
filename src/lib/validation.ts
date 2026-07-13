export const MIN_TASK_DATE = '1900-01-01'
export const MAX_TASK_DATE = '2199-12-31'

export function titleError(value: string): string | null {
  return value.trim() ? null : 'Title is required.'
}

export function pointsError(value: number | null): string | null {
  if (value === null) return null
  if (!Number.isInteger(value)) return 'Points must be a whole number.'
  return value >= 0 && value <= 999 ? null : 'Points must be between 0 and 999.'
}

export function dateRangeError(start: string | null, end: string | null): string | null {
  for (const value of [start, end]) {
    if (value && (value < MIN_TASK_DATE || value > MAX_TASK_DATE))
      return `Dates must be between ${MIN_TASK_DATE} and ${MAX_TASK_DATE}.`
  }
  return start && end && start > end ? 'Start date must be on or before the due date.' : null
}

export function normaliseProjectKey(value: string): string {
  return value.trim().toUpperCase()
}

export function projectKeyError(value: string): string | null {
  const key = normaliseProjectKey(value)
  if (!key) return 'Project key is required.'
  return /^[A-Z][A-Z0-9]{0,11}$/.test(key)
    ? null
    : 'Use 1–12 letters or numbers, starting with a letter.'
}

export function capacityError(value: number): string | null {
  return Number.isInteger(value) && value >= 0 && value <= 168
    ? null
    : 'Capacity must be a whole number between 0 and 168.'
}

export function emailError(value: string): string | null {
  const email = value.trim()
  if (!email) return 'Email address is required.'
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? null : 'Enter a valid email address.'
}
