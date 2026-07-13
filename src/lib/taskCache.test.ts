import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { cachedTasks, patchTaskCaches, restoreTaskCaches, snapshotTaskCaches } from './taskCache'

const task = (id: string, title: string) => ({ id, title, ref: id, tags: [] }) as never

describe('taskCache', () => {
  it('patches legacy, infinite, and drawer caches and can restore snapshots', () => {
    const client = new QueryClient()
    client.setQueryData(['tasks', 'w1', 'legacy'], [task('a', 'A')])
    client.setQueryData(['tasks', 'w1', 'pages'], {
      pages: [{ items: [task('b', 'B')], nextCursor: null }],
      pageParams: [null],
    })
    client.setQueryData(['task', 'w1', 'B-1'], task('b', 'B'))
    const snapshot = snapshotTaskCaches(client, 'w1')
    patchTaskCaches(client, 'w1', (row) => ({ ...row, title: `${row.title}!` }))
    expect(
      cachedTasks(client, 'w1')
        .map((row) => row.title)
        .sort(),
    ).toEqual(['A!', 'B!'])
    expect(client.getQueryData<{ title: string }>(['task', 'w1', 'B-1'])?.title).toBe('B!')
    restoreTaskCaches(client, snapshot)
    expect(
      cachedTasks(client, 'w1')
        .map((row) => row.title)
        .sort(),
    ).toEqual(['A', 'B'])
  })

  it('ignores unrelated cache shapes', () => {
    const client = new QueryClient()
    client.setQueryData(['tasks', 'w1', 'other'], { value: true })
    patchTaskCaches(client, 'w1', (row) => row)
    expect(cachedTasks(client, 'w1')).toEqual([])
  })
})
