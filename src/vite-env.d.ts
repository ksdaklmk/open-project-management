/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_RELEASE?: string
  readonly VITE_FEATURE_REALTIME?: string
  readonly VITE_FEATURE_ADMIN?: string
}

interface Window {
  __OPM_TELEMETRY__?: {
    capture(event: import('./lib/observability').TelemetryEvent): void
  }
}
