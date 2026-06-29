import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const post = vi.fn()
vi.mock('../../lib/hooks/useComments', () => ({
  useComments: () => ({
    data: [{ id: 'c1', body: 'First!', created_at: new Date().toISOString(), author: { name: 'Dana Lee' } }],
    isLoading: false, error: null,
  }),
  useAddComment: () => ({ mutate: post }),
}))
import { CommentThread } from './CommentThread'

describe('CommentThread', () => {
  it('lists comments and posts a new one', () => {
    render(<CommentThread taskId="t1" />)
    expect(screen.getByText('First!')).toBeInTheDocument()
    expect(screen.getByText('Dana Lee')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Add a comment'), { target: { value: 'Nice work' } })
    fireEvent.click(screen.getByRole('button', { name: /post/i }))
    expect(post).toHaveBeenCalledWith('Nice work')
  })
})
