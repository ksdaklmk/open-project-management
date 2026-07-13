const required = [
  'SITE_URL',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SMOKE_EMAIL',
  'SMOKE_PASSWORD',
  'SMOKE_DENIED_WORKSPACE_ID',
]
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name}`)
}

const siteUrl = process.env.SITE_URL.replace(/\/$/, '')
const supabaseUrl = process.env.SUPABASE_URL.replace(/\/$/, '')
const anonKey = process.env.SUPABASE_ANON_KEY
const headers = { apikey: anonKey, 'Content-Type': 'application/json' }

async function checked(label, url, init = {}) {
  const started = performance.now()
  const response = await fetch(url, init)
  console.log(`${label}: ${response.status} (${Math.round(performance.now() - started)}ms)`)
  if (!response.ok) throw new Error(`${label} failed with ${response.status}`)
  return response
}

await checked('frontend', siteUrl)
await checked('auth health', `${supabaseUrl}/auth/v1/health`, { headers })
const sessionResponse = await checked(
  'smoke sign-in',
  `${supabaseUrl}/auth/v1/token?grant_type=password`,
  {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD }),
  },
)
const session = await sessionResponse.json()
const authenticated = { ...headers, Authorization: `Bearer ${session.access_token}` }
const workspacesResponse = await checked(
  'workspace read',
  `${supabaseUrl}/rest/v1/workspaces?select=id&limit=1`,
  { headers: authenticated },
)
const workspaces = await workspacesResponse.json()
if (!workspaces[0]?.id) throw new Error('Smoke account has no workspace')
const workspaceId = workspaces[0].id
const taskReadResponse = await checked(
  'bounded task read',
  `${supabaseUrl}/rest/v1/rpc/query_tasks`,
  {
    method: 'POST',
    headers: authenticated,
    body: JSON.stringify({ p_workspace_id: workspaceId, p_limit: 1 }),
  },
)
const taskRows = await taskReadResponse.json()
if (!Array.isArray(taskRows) || taskRows.length > 2) {
  throw new Error('Bounded task read returned an invalid response')
}

const deniedResponse = await checked(
  'foreign workspace denial',
  `${supabaseUrl}/rest/v1/rpc/query_tasks`,
  {
    method: 'POST',
    headers: authenticated,
    body: JSON.stringify({
      p_workspace_id: process.env.SMOKE_DENIED_WORKSPACE_ID,
      p_limit: 1,
    }),
  },
)
const deniedRows = await deniedResponse.json()
if (!Array.isArray(deniedRows) || deniedRows.length !== 0) {
  throw new Error('Smoke account can read the denied workspace')
}

const projectsResponse = await checked(
  'project read',
  `${supabaseUrl}/rest/v1/projects?select=id&workspace_id=eq.${encodeURIComponent(workspaceId)}&limit=1`,
  { headers: authenticated },
)
const projects = await projectsResponse.json()
if (!projects[0]?.id) throw new Error('Smoke account workspace has no project')

let createdTaskId
try {
  const createResponse = await checked('task create', `${supabaseUrl}/rest/v1/rpc/create_task`, {
    method: 'POST',
    headers: authenticated,
    body: JSON.stringify({
      p_project_id: projects[0].id,
      p_title: `Release smoke ${crypto.randomUUID()}`,
    }),
  })
  const created = await createResponse.json()
  createdTaskId = (Array.isArray(created) ? created[0] : created)?.id
  if (!createdTaskId) throw new Error('Task create returned no ID')
} finally {
  if (createdTaskId) {
    await checked(
      'task cleanup',
      `${supabaseUrl}/rest/v1/tasks?id=eq.${encodeURIComponent(createdTaskId)}`,
      { method: 'DELETE', headers: authenticated },
    )
  }
}

console.log(
  'Post-deploy smoke passed. The temporary task was removed; no task content, email, or token was logged.',
)
