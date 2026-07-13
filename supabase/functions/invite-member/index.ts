import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
}

type InviteRole = 'admin' | 'member'
interface InviteRequest {
  workspaceId?: string
  email?: string
  role?: InviteRole
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function isExistingAccount(error: { status?: number; message?: string }) {
  const message = error.message?.toLowerCase() ?? ''
  return error.status === 422 && (message.includes('already') || message.includes('registered'))
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const startedAt = performance.now()
  const requestId = crypto.randomUUID()
  const respond = (status: number, body: Record<string, unknown>) => {
    console.log(
      JSON.stringify({
        event: 'invite_member_request',
        request_id: requestId,
        status,
        outcome: status < 400 ? 'success' : 'failure',
        duration_ms: Math.round(performance.now() - startedAt),
      }),
    )
    return json(status, body)
  }
  if (request.method !== 'POST') return respond(405, { error: 'Method not allowed.' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const siteUrl = Deno.env.get('SITE_URL')
  const authorization = request.headers.get('Authorization')
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !siteUrl) {
    return respond(500, { error: 'Invitation service is not configured.' })
  }
  if (!authorization?.startsWith('Bearer ')) {
    return respond(401, { error: 'Authentication required.' })
  }

  let body: InviteRequest
  try {
    body = (await request.json()) as InviteRequest
  } catch {
    return respond(400, { error: 'Invalid request.' })
  }
  const workspaceId = body.workspaceId
  const email = body.email?.trim().toLowerCase()
  const role = body.role ?? 'member'
  if (!workspaceId || !email || !['admin', 'member'].includes(role)) {
    return respond(400, { error: 'Workspace, email, and role are required.' })
  }

  const token = authorization.slice('Bearer '.length)
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await callerClient.auth.getUser(token)
  if (userError || !userData.user) return respond(401, { error: 'Authentication required.' })

  // Verify membership and role with the caller's JWT before the service-role
  // client is constructed or the Auth Admin API is called.
  const { data: membership, error: membershipError } = await callerClient
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (membershipError || !membership || !['owner', 'admin'].includes(membership.role)) {
    return respond(403, { error: 'You do not have permission to invite workspace members.' })
  }
  if (role === 'admin' && membership.role !== 'owner') {
    return respond(403, { error: 'Only a workspace owner can invite an admin.' })
  }

  const { data: invitation, error: invitationError } = await callerClient.rpc(
    'upsert_workspace_invitation',
    { p_workspace_id: workspaceId, p_email: email, p_role: role },
  )
  if (invitationError || !invitation) {
    return respond(invitationError?.code === '22023' ? 400 : 403, {
      error: invitationError?.message ?? 'Invitation could not be prepared.',
    })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: deliveryError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: siteUrl,
    data: { workspace_invitation_id: invitation.id },
  })

  // Treat an existing account like a successful request: the invitation will
  // be accepted on that user's next verified login, without disclosing that
  // the address already has an account.
  if (deliveryError && !isExistingAccount(deliveryError)) {
    await callerClient.rpc('revoke_workspace_invitation', { p_invitation_id: invitation.id })
    return respond(502, {
      error: 'Invitation could not be delivered. Check the email provider and try again.',
    })
  }

  return respond(200, {
    invitationId: invitation.id,
    message: 'If this address can receive invitations, an email will arrive shortly.',
  })
})
