import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeObservability, recordTelemetry } from './observability'

beforeEach(() => {
  window.__OPM_TELEMETRY__ = { capture: vi.fn() }
})

describe('observability', () => {
  it('emits release-tagged events through a strict field allowlist', () => {
    const listener = vi.fn()
    window.addEventListener('opm:telemetry', listener)
    recordTelemetry('view_opened', { view: 'board', operation: 'read', secret: 'drop' } as never)
    expect(window.__OPM_TELEMETRY__?.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'view_opened',
        fields: { view: 'board', operation: 'read' },
      }),
    )
    expect(listener).toHaveBeenCalled()
    window.removeEventListener('opm:telemetry', listener)
  })

  it('captures global errors and unhandled rejections without message content', () => {
    initializeObservability()
    window.dispatchEvent(new ErrorEvent('error', { error: new TypeError('private detail') }))
    window.dispatchEvent(
      new PromiseRejectionEvent('unhandledrejection', {
        promise: Promise.resolve(),
        reason: new RangeError('private detail'),
      }),
    )
    expect(window.__OPM_TELEMETRY__?.capture).toHaveBeenCalledWith(
      expect.objectContaining({ fields: expect.objectContaining({ error_name: 'TypeError' }) }),
    )
    expect(window.__OPM_TELEMETRY__?.capture).toHaveBeenCalledWith(
      expect.objectContaining({ fields: expect.objectContaining({ error_name: 'RangeError' }) }),
    )
  })
})
