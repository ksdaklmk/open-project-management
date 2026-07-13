export type TelemetryValue = string | number | boolean

export interface TelemetryEvent {
  name: string
  release: string
  timestamp: string
  fields: Record<string, TelemetryValue>
}

const release = import.meta.env.VITE_APP_RELEASE || 'development'
const SAFE_FIELDS = new Set([
  'view',
  'operation',
  'status',
  'duration_ms',
  'value',
  'metric',
  'reconnect',
  'error_name',
])

function safeFields(fields: Record<string, TelemetryValue>) {
  return Object.fromEntries(Object.entries(fields).filter(([key]) => SAFE_FIELDS.has(key)))
}

export function recordTelemetry(name: string, fields: Record<string, TelemetryValue> = {}) {
  const event: TelemetryEvent = {
    name,
    release,
    timestamp: new Date().toISOString(),
    fields: safeFields(fields),
  }
  window.dispatchEvent(new CustomEvent('opm:telemetry', { detail: event }))
  window.__OPM_TELEMETRY__?.capture(event)
}

let initialized = false

export function initializeObservability() {
  if (initialized) return
  initialized = true
  window.addEventListener('error', (event) => {
    recordTelemetry('frontend_exception', {
      operation: 'window_error',
      error_name: event.error instanceof Error ? event.error.name : 'Error',
    })
  })
  window.addEventListener('unhandledrejection', (event) => {
    recordTelemetry('frontend_exception', {
      operation: 'unhandled_rejection',
      error_name: event.reason instanceof Error ? event.reason.name : 'Error',
    })
  })

  if (!('PerformanceObserver' in window)) return
  for (const entryType of ['largest-contentful-paint', 'layout-shift', 'longtask']) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const value =
            'value' in entry && typeof entry.value === 'number' ? entry.value : entry.duration
          recordTelemetry('performance_metric', {
            metric: entry.entryType,
            value: Math.round(value * 100) / 100,
          })
        }
      })
      observer.observe({ type: entryType, buffered: true })
    } catch {
      // Older browsers do not support every observer type.
    }
  }
}
