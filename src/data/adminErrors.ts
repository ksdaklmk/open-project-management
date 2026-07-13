interface DatabaseErrorLike {
  code?: string
  message: string
  details?: string
}

export class AdminError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'AdminError'
  }
}

export function mapAdminError(error: DatabaseErrorLike): AdminError {
  const context = `${error.message} ${error.details ?? ''}`.toLowerCase()

  if (error.code === '42501') {
    return new AdminError("You don't have permission to perform this action.", error.code)
  }
  if (
    error.code === '23514' &&
    (context.includes('workspace_members_owner_required') ||
      context.includes('retain at least one owner'))
  ) {
    return new AdminError(
      'Transfer ownership before removing or demoting the final owner.',
      error.code,
    )
  }
  if (error.code === '23514' && context.includes('members_capacity_range')) {
    return new AdminError('Capacity must be between 0 and 168 hours.', error.code)
  }
  if (error.code === '23505' && context.includes('projects_workspace_id_key_key')) {
    return new AdminError('That project key is already in use in this workspace.', error.code)
  }
  if (error.code === '22023') {
    return new AdminError(error.message, error.code)
  }
  return new AdminError(error.message, error.code)
}

export function throwAdminError(error: DatabaseErrorLike): never {
  throw mapAdminError(error)
}
