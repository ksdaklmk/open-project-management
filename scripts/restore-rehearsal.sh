#!/usr/bin/env bash
set -euo pipefail

container="${SUPABASE_DB_CONTAINER:-supabase_db_open-project-management}"
runtime="${CONTAINER_RUNTIME:-podman}"
restore_db="opm_restore_rehearsal"
backup="$(mktemp -t opm-restore-XXXXXX.dump)"
started="$(date +%s)"

row_counts() {
  local database="$1"
  "$runtime" exec "$container" psql -U postgres -d "$database" -X -Atc \
    "select concat_ws(',',
       (select count(*) from workspaces),
       (select count(*) from projects),
       (select count(*) from tasks),
       (select count(*) from workspace_members),
       (select count(*) from activity),
       (select count(*) from activation_events),
       (select count(*) from onboarding_dismissals),
       (select count(*) from task_watchers),
       (select count(*) from comment_mentions),
       (select count(*) from notifications),
       (select count(*) from notification_reads),
       (select count(*) from notification_preferences),
       (select count(*) from notification_outbox),
       (select count(*) from saved_views),
       (select count(*) from saved_view_defaults)
     )"
}

cleanup() {
  "$runtime" exec "$container" dropdb -U postgres --if-exists --force "$restore_db" >/dev/null 2>&1 || true
  rm -f "$backup"
}
trap cleanup EXIT

source_counts="$(row_counts postgres)"
source_version="$("$runtime" exec "$container" psql -U postgres -d postgres -X -Atc \
  "select max(version) from supabase_migrations.schema_migrations")"
"$runtime" exec "$container" pg_dump -U supabase_admin -d postgres -Fc \
  --schema=public --schema=auth --schema=supabase_migrations >"$backup"
"$runtime" exec "$container" dropdb -U postgres --if-exists --force "$restore_db"
"$runtime" exec "$container" createdb -U postgres -T template0 "$restore_db"
"$runtime" exec "$container" psql -U supabase_admin -d "$restore_db" -X -v ON_ERROR_STOP=1 -c \
  "drop schema public cascade;
   create schema if not exists extensions;
   create extension if not exists pgcrypto with schema extensions;
   create extension if not exists pg_trgm with schema extensions;
   create extension if not exists pgtap with schema extensions;" >/dev/null
"$runtime" exec -i "$container" pg_restore -U supabase_admin -d "$restore_db" <"$backup"
# Schema-filtered logical dumps omit database-level publication membership.
# Recreate the app's Realtime publication explicitly before verification.
"$runtime" exec "$container" psql -U supabase_admin -d "$restore_db" -X -v ON_ERROR_STOP=1 -c \
  "create publication supabase_realtime;
   alter publication supabase_realtime add table
     public.tasks,
     public.task_tags,
     public.subtasks,
     public.comments,
     public.activity,
     public.workspace_members,
     public.projects,
     public.workspace_invitations,
     public.notifications,
     public.notification_reads;" >/dev/null
"$runtime" exec "$container" psql -U supabase_admin -d "$restore_db" -X -v ON_ERROR_STOP=1 -c \
  "grant all on schema public, auth, supabase_migrations to postgres;
   grant usage on schema extensions to postgres, authenticated, anon, service_role;
   grant all privileges on all tables in schema public, auth, supabase_migrations to postgres;
   grant all privileges on all sequences in schema public, auth, supabase_migrations to postgres;
   grant all privileges on all functions in schema public, auth, supabase_migrations to postgres;
   grant execute on all functions in schema extensions to public;" >/dev/null

version="$("$runtime" exec "$container" psql -U postgres -d "$restore_db" -X -Atc \
  "select max(version) from supabase_migrations.schema_migrations")"
if [[ "$version" != "$source_version" ]]; then
  echo "restored migration version is $version, expected source version $source_version" >&2
  exit 1
fi

restored_counts="$(row_counts "$restore_db")"
if [[ "$restored_counts" != "$source_counts" ]]; then
  echo "restored row counts $restored_counts do not match source $source_counts" >&2
  exit 1
fi

for file in \
  supabase/tests/schema_test.sql \
  supabase/tests/restore_smoke.sql \
  supabase/tests/scale_query_test.sql \
  supabase/tests/realtime_test.sql \
  supabase/tests/saved_views_test.sql; do
  echo "restore verification: $file"
  "$runtime" exec -i "$container" psql -U postgres -d "$restore_db" -X -v ON_ERROR_STOP=1 <"$file" >/dev/null
done

finished="$(date +%s)"

printf 'restore_rehearsal_status=passed\n'
printf 'migration_version=%s\n' "$version"
printf 'row_counts=workspaces,projects,tasks,members,activity,activation,dismissals,watchers,mentions,notifications,reads,preferences,outbox,saved_views,saved_view_defaults:%s\n' "$restored_counts"
printf 'duration_seconds=%s\n' "$((finished - started))"
