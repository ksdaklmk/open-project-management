import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { AppErrorBoundary } from './AppErrorBoundary'

vi.mock('../lib/observability', () => ({ recordTelemetry: vi.fn() }))

it('reports render failures and offers a recovery action', async () => {
  const { recordTelemetry } = await import('../lib/observability')
  const boundary = new AppErrorBoundary({ children: <span>content</span> })
  boundary.componentDidCatch(new TypeError('render failed'), {} as never)
  boundary.state = AppErrorBoundary.getDerivedStateFromError()
  render(boundary.render())
  expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  expect(recordTelemetry).toHaveBeenCalledWith('frontend_exception', {
    operation: 'react_render',
    error_name: 'TypeError',
  })
})
