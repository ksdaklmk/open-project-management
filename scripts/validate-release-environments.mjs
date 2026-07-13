import { readFileSync } from 'node:fs'

const path = process.argv[2]
if (!path)
  throw new Error('usage: node scripts/validate-release-environments.mjs <private-record.json>')
const record = JSON.parse(readFileSync(path, 'utf8'))

function required(value, label) {
  if (!value || /replace|example|todo/i.test(String(value)))
    throw new Error(`${label} is not recorded`)
}

for (const name of ['staging', 'production']) {
  const environment = record[name]
  required(environment, name)
  required(environment.projectRef, `${name}.projectRef`)
  required(environment.region, `${name}.region`)
  required(environment.owner, `${name}.owner`)
  required(environment.siteUrl, `${name}.siteUrl`)
  if (!String(environment.siteUrl).startsWith('https://')) {
    throw new Error(`${name}.siteUrl must use HTTPS`)
  }
  for (const field of [
    'smtpVerified',
    'emailConfirmations',
    'securePasswordChange',
    'strongPasswordPolicy',
    'abuseProtection',
    'redirectsVerified',
    'monitoringConfigured',
    'backupsEnabled',
  ]) {
    if (environment[field] !== true) throw new Error(`${name}.${field} is not verified`)
  }
  required(environment.backupMode, `${name}.backupMode`)
  required(environment.alertOwner, `${name}.alertOwner`)
  required(environment.keyRotationOwner, `${name}.keyRotationOwner`)
}

if (record.staging.projectRef === record.production.projectRef) {
  throw new Error('staging and production must use different Supabase projects')
}
console.log('Staging and production release environment records are complete and distinct.')
