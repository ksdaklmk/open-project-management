import { describe, it, expect, vi, beforeEach } from 'vitest'
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

const draftBox = () => screen.getByLabelText('Add a comment') as HTMLTextAreaElement

describe('CommentThread', () => {
  beforeEach(() => post.mockReset())

  it('lists comments and posts a new one', () => {
    render(<CommentThread taskId="t1" />)
    expect(screen.getByText('First!')).toBeInTheDocument()
    expect(screen.getByText('Dana Lee')).toBeInTheDocument()
    fireEvent.change(draftBox(), { target: { value: 'Nice work' } })
    fireEvent.click(screen.getByRole('button', { name: /post/i }))
    expect(post).toHaveBeenCalledWith('Nice work', expect.objectContaining({ onSuccess: expect.any(Function) }))
  })

  it('keeps the draft when the post has not succeeded (e.g. it failed)', () => {
    render(<CommentThread taskId="t1" />)
    fireEvent.change(draftBox(), { target: { value: 'Nice work' } })
    fireEvent.click(screen.getByRole('button', { name: /post/i }))
    expect(draftBox().value).toBe('Nice work')
  })

  it('clears the draft once the post succeeds', () => {
    post.mockImplementation((_body: string, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.())
    render(<CommentThread taskId="t1" />)
    fireEvent.change(draftBox(), { target: { value: 'Nice work' } })
    fireEvent.click(screen.getByRole('button', { name: /post/i }))
    expect(draftBox().value).toBe('')
  })
})
