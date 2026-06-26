create type task_status   as enum ('backlog','todo','in_progress','in_review','done');
create type task_priority as enum ('urgent','high','medium','low');
create type task_type     as enum ('feature','bug','chore','improvement');
create type member_role   as enum ('owner','admin','member');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  color text not null default '#8a93a6',
  created_at timestamptz not null default now()
);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role member_role not null default 'member',
  capacity_per_week int not null default 40,
  color text not null default '#8a93a6',
  primary key (workspace_id, user_id)
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  key text not null,
  color text not null default '#6d5ef0',
  created_at timestamptz not null default now(),
  unique (workspace_id, key)
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  ref text not null,
  type task_type not null default 'feature',
  title text not null,
  description text not null default '',
  status task_status not null default 'backlog',
  priority task_priority not null default 'medium',
  assignee_id uuid references profiles(id) on delete set null,
  start_date date,
  end_date date,
  points int,
  position double precision not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, ref)
);

create table subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  position double precision not null default 0
);

create table task_tags (
  task_id uuid not null references tasks(id) on delete cascade,
  tag text not null,
  primary key (task_id, tag)
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  author_id uuid references profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  actor_id uuid references profiles(id),
  task_id uuid references tasks(id) on delete set null,
  verb text not null check (verb in ('created','moved','assigned','commented')),
  from_status task_status,
  to_status task_status,
  comment_id uuid references comments(id) on delete set null,
  created_at timestamptz not null default now()
);

create index on tasks (workspace_id);
create index on tasks (project_id);
create index on tasks (assignee_id);
create index on subtasks (task_id);
create index on activity (workspace_id, created_at desc);
