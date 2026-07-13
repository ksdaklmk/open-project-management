import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { LoadMoreButton } from './LoadMoreButton'

it('invokes loading and exposes its pending state', () => {
  const load = vi.fn()
  const view = render(<LoadMoreButton label="Load older" pending={false} onClick={load} />)
  fireEvent.click(screen.getByRole('button', { name: 'Load older' }))
  expect(load).toHaveBeenCalled()
  view.rerender(<LoadMoreButton pending onClick={load} />)
  expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled()
})
