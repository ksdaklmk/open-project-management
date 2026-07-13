# Key and credential rotation

Inventory Supabase publishable/anon and service-role keys, database credentials, SMTP, OAuth,
CAPTCHA, monitoring, deployment, and CI credentials with owner and expiry. Never place values in
this repository or browser-visible variables unless explicitly publishable.

For a planned rotation: create the replacement, update encrypted staging secrets, deploy and smoke,
promote the same change to production, verify Auth/API/Edge/email/monitoring, revoke the old value,
and search build artifacts/logs for accidental exposure. Record UTC times and two-person approval.

For emergency rotation: declare an incident, contain access, rotate service-role/database/provider
secrets before public keys, redeploy affected services, revoke sessions when required, validate RLS
and cross-tenant denial, preserve privacy-safe evidence, notify affected parties, and complete a
post-incident review. Service-role compromise is never remediated by disabling RLS.
