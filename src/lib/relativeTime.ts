const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

// ponytail: native Intl, no date library. Largest sensible unit; absolute date past a week.
export function relativeTime(iso: string, now: number = Date.now()): string {
  const diffSec = Math.round((new Date(iso).getTime() - now) / 1000) // negative = past
  const abs = Math.abs(diffSec)
  if (abs < 45) return 'just now'
  if (abs < 3600) return RTF.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86400) return RTF.format(Math.round(diffSec / 3600), 'hour')
  if (abs < 604800) return RTF.format(Math.round(diffSec / 86400), 'day')
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}
