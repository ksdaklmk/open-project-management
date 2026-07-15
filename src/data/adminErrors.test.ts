import { describe, expect, it } from 'vitest'
import { mapAdminError } from './adminErrors'

describe('mapAdminError', () => {
  it.each([
    ['42501', 'denied', "You don't have permission"],
    ['23514', 'workspace_members_owner_required', 'Transfer ownership'],
    ['23514', 'workspace must retain at least one owner', 'Transfer ownership'],
    ['23514', 'members_capacity_range', 'between 0 and 168'],
    ['23505', 'projects_workspace_id_key_key', 'already in use'],
    ['23505', 'project_templates_workspace_name_idx', 'template name is already in use'],
  ])('maps %s errors to actionable copy', (code, message, expected) => {
    expect(mapAdminError({ code, message }).message).toContain(expected)
  })

  it('preserves server validation and unknown messages', () => {
    expect(mapAdminError({ code: '22023', message: 'Project name is required' }).message).toBe(
      'Project name is required',
    )
    expect(mapAdminError({ code: 'XX000', message: 'Unexpected' }).message).toBe('Unexpected')
  })
})
