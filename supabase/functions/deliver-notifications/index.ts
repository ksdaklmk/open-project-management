import { createClient } from 'npm:@supabase/supabase-js@2'

interface ClaimedDelivery {
  outbox_id: string
  notification_id: string
  recipient_email: string
  notification_kind:
    'assignment' | 'mention' | 'watched_comment' | 'status_change' | 'invitation' | 'due_soon'
  task_ref: string | null
  workspace_id: string
  attempts: number
}

const label = (delivery: ClaimedDelivery) => {
  const ref = delivery.task_ref ?? 'a task'
  switch (delivery.notification_kind) {
    case 'assignment':
      return `You were assigned to ${ref}`
    case 'mention':
      return `You were mentioned on ${ref}`
    case 'watched_comment':
      return `There is a new comment on watched task ${ref}`
    case 'status_change':
      return `The status changed on ${ref}`
    case 'invitation':
      return 'You were invited to a workspace'
    case 'due_soon':
      return `${ref} is due soon`
  }
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    }
    return entities[character]
  })

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('NOTIFICATION_FROM_EMAIL')
  const siteUrl = Deno.env.get('SITE_URL')
  if (!supabaseUrl || !serviceRoleKey || !resendKey || !from || !siteUrl) {
    return new Response('Notification worker is not configured', { status: 500 })
  }
  if (request.headers.get('Authorization') !== `Bearer ${serviceRoleKey}`) {
    return new Response('Forbidden', { status: 403 })
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  // A scheduler may invoke this worker repeatedly. Recurrence generation and
  // due notifications are idempotent; both workers use SKIP LOCKED so
  // concurrent invocations cannot share an occurrence or delivery.
  const { data: generated, error: recurrenceError } = await client.rpc('generate_due_recurrences', {
    p_limit: 25,
  })
  if (recurrenceError) return new Response('Could not generate recurring work', { status: 500 })
  await client.rpc('enqueue_due_notifications', { p_days: 3 })
  const { data, error } = await client.rpc('claim_notification_outbox', { p_limit: 25 })
  if (error) return new Response('Could not claim notification queue', { status: 500 })

  let delivered = 0
  for (const delivery of (data ?? []) as ClaimedDelivery[]) {
    const message = label(delivery)
    let succeeded = false
    let errorCode: string | null
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [delivery.recipient_email],
          subject: message,
          html: `<p>${escapeHtml(message)}</p><p><a href="${escapeHtml(siteUrl)}?view=inbox">Open Inbox</a></p>`,
        }),
      })
      succeeded = response.ok
      errorCode = response.ok ? null : `provider_${response.status}`
    } catch {
      errorCode = 'network_error'
    }
    await client.rpc('complete_notification_delivery', {
      p_outbox_id: delivery.outbox_id,
      p_succeeded: succeeded,
      p_error_code: errorCode,
    })
    if (succeeded) delivered += 1
  }

  console.log(
    JSON.stringify({
      event: 'notification_delivery_batch',
      recurrences_generated: generated?.length ?? 0,
      claimed: data?.length ?? 0,
      delivered,
    }),
  )
  return Response.json({
    recurrences_generated: generated?.length ?? 0,
    claimed: data?.length ?? 0,
    delivered,
  })
})
