import { beforeEach, describe, expect, it, vi } from 'vitest'

const { maybeSingle, eq, from, rpc } = vi.hoisted(() => {
  const maybeSingle = vi.fn()
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  const rpc = vi.fn()
  return { maybeSingle, eq, from, rpc }
})

vi.mock('../lib/supabase', () => ({ supabase: { from, rpc } }))

import { getTaskRecurrence, removeTaskRecurrence, saveTaskRecurrence } from './recurrencesRepo'

beforeEach(() => vi.clearAllMocks())

describe('recurrencesRepo', () => {
  it('reads a task recurrence through RLS', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { id: 'r1', frequency: 'weekly' }, error: null })
    await expect(getTaskRecurrence('t1')).resolves.toEqual({ id: 'r1', frequency: 'weekly' })
    expect(from).toHaveBeenCalledWith('task_recurrences')
    expect(eq).toHaveBeenCalledWith('source_task_id', 't1')
  })

  it('saves timezone-local schedule fields through the guarded RPC', async () => {
    rpc.mockResolvedValueOnce({ data: { id: 'r1' }, error: null })
    await saveTaskRecurrence({
      taskId: 't1',
      timezone: 'Asia/Bangkok',
      frequency: 'weekly',
      interval: 2,
      firstOccurrenceLocal: '2026-07-20 09:00:00',
    })
    expect(rpc).toHaveBeenCalledWith('upsert_task_recurrence', {
      p_task_id: 't1',
      p_timezone: 'Asia/Bangkok',
      p_frequency: 'weekly',
      p_interval: 2,
      p_first_occurrence_local: '2026-07-20 09:00:00',
    })
  })

  it('removes recurrence through the task-scoped RPC', async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null })
    await removeTaskRecurrence('t1')
    expect(rpc).toHaveBeenCalledWith('delete_task_recurrence', { p_task_id: 't1' })
  })
})
