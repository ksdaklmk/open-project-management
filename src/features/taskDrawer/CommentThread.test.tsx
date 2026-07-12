import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const post = vi.fn()
const comment = {
  id: 'c1',
  body: 'First!',
  created_at: new Date().toISOString(),
  author: { name: 'Dana Lee' },
}
const comments: { data: (typeof comment)[] | undefined; isLoading: boolean; error: Error | null } =
  { data: [comment], isLoading: false, error: null }
vi.mock('../../lib/hooks/useComments', () => ({
  useComments: () => comments,
  useAddComment: () => ({ mutate: post }),
}))
import { CommentThread } from './CommentThread'

const draftBox = () => screen.getByLabelText('Add a comment') as HTMLTextAreaElement

beforeEach(() => {
  post.mockReset()
  comments.data = [comment]
  comments.isLoading = false
  comments.error = null
})

describe('CommentThread', () => {
  it('lists comments and posts a new one', () => {
    render(<CommentThread taskId="t1" workspaceId="w1" />)
    expect(screen.getByText('First!')).toBeInTheDocument()
    expect(screen.getByText('Dana Lee')).toBeInTheDocument()
    fireEvent.change(draftBox(), { target: { value: 'Nice work' } })
    fireEvent.click(screen.getByRole('button', { name: /post/i }))
    expect(post).toHaveBeenCalledWith(
      'Nice work',
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('keeps the draft when the post has not succeeded (e.g. it failed)', () => {
    render(<CommentThread taskId="t1" workspaceId="w1" />)
    fireEvent.change(draftBox(), { target: { value: 'Nice work' } })
    fireEvent.click(screen.getByRole('button', { name: /post/i }))
    expect(draftBox().value).toBe('Nice work')
  })

  it('clears the draft once the post succeeds', () => {
    post.mockImplementation((_body: string, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    )
    render(<CommentThread taskId="t1" workspaceId="w1" />)
    fireEvent.change(draftBox(), { target: { value: 'Nice work' } })
    fireEvent.click(screen.getByRole('button', { name: /post/i }))
    expect(draftBox().value).toBe('')
  })

  it('shows a loading line while comments load', () => {
    comments.data = undefined
    comments.isLoading = true
    render(<CommentThread taskId="t1" workspaceId="w1" />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows an error line when comments fail to load', () => {
    comments.data = undefined
    comments.error = new Error('boom')
    render(<CommentThread taskId="t1" workspaceId="w1" />)
    expect(screen.getByText(/couldn't load comments/i)).toBeInTheDocument()
  })
})
