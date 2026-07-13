import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { WorkspaceRealtimeEvent } from '../../data/realtimeRepo'
import { allWorkspaceQueryKeys, eventFingerprint, eventQueryKeys } from './eventMapping'

const event = (
  table: WorkspaceRealtimeEvent['table'],
  row: Record<string, unknown>,
  eventType: WorkspaceRealtimeEvent['eventType'] = 'UPDATE',
): WorkspaceRealtimeEvent => ({ table, eventType, new: row, old: {}, commitTimestamp: 'now' })

describe('eventQueryKeys', () => {
  it('maps workspace tables to narrow cache keys', () => {
    const client = new QueryClient()
    expect(eventQueryKeys(event('tasks', { workspace_id: 'w1' }), 'w1', client)).toEqual([
      ['tasks', 'w1'],
      ['task', 'w1'],
      ['workload', 'w1'],
    ])
    expect(eventQueryKeys(event('projects', { workspace_id: 'w1' }), 'w1', client)).toEqual([
      ['projects', 'w1'],
      ['tasks', 'w1'],
    ])
  })

  it('rejects a mismatched workspace defensively', () => {
    expect(
      eventQueryKeys(event('activity', { workspace_id: 'other' }), 'w1', new QueryClient()),
    ).toEqual([])
  })

  it('maps personal notifications across workspace filters', () => {
    expect(
      eventQueryKeys(event('notifications', { workspace_id: 'other' }), 'w1', new QueryClient()),
    ).toEqual([['notifications'], ['notification-unread']])
  })

  it('maps child payloads only when their task belongs to the active workspace', () => {
    const client = new QueryClient()
    client.setQueryData(['tasks', 'w1'], [{ id: 't1' }])
    expect(eventQueryKeys(event('comments', { id: 'c1', task_id: 't1' }), 'w1', client)).toEqual([
      ['comments', 't1'],
    ])
    expect(
      eventQueryKeys(event('comments', { id: 'c2', task_id: 'foreign' }), 'w1', client),
    ).toEqual([])
  })

  it('resolves a child delete with only its primary key from the narrow cache', () => {
    const client = new QueryClient()
    client.setQueryData(['tasks', 'w1'], [{ id: 't1' }])
    client.setQueryData(['subtasks', 't1'], [{ id: 's1' }])
    const deletion: WorkspaceRealtimeEvent = {
      table: 'subtasks',
      eventType: 'DELETE',
      new: {},
      old: { id: 's1' },
    }
    expect(eventQueryKeys(deletion, 'w1', client)).toEqual([['subtasks', 't1']])
  })
})

describe('reconnect mapping', () => {
  it('includes fixed workspace keys and open active child queries', () => {
    const client = new QueryClient()
    client.setQueryData(['tasks', 'w1'], [{ id: 't1' }])
    client.setQueryData(['comments', 't1'], [])
    client.setQueryData(['comments', 'foreign'], [])
    expect(allWorkspaceQueryKeys(client, 'w1')).toContainEqual(['comments', 't1'])
    expect(allWorkspaceQueryKeys(client, 'w1')).not.toContainEqual(['comments', 'foreign'])
  })

  it('builds a stable event fingerprint for burst deduplication', () => {
    expect(eventFingerprint(event('tasks', { id: 't1' }))).toBe('tasks:UPDATE:t1:now')
  })
})
