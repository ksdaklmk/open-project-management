-- 0007_schema_hardening.sql
-- docs/AUDIT.md findings 6 & 8.
--
-- 1) Domain invariants become DB CHECKs: empty titles, negative
--    points/capacity, and reversed or absurd date ranges corrupt Workload
--    sums and Gantt geometry. NOT VALID: enforced for all new writes;
--    pre-existing rows are grandfathered until touched.
--
-- 2) Attribution FKs move to ON DELETE SET NULL: deleting an auth user
--    cascades to its profile, which NO ACTION FKs on historical rows would
--    otherwise block. History survives with null attribution (the UI already
--    renders a missing author as "Someone"). assignee_id was set-null in 0001.

alter table tasks add constraint tasks_title_not_blank
  check (btrim(title) <> '') not valid;
alter table tasks add constraint tasks_points_range
  check (points is null or points between 0 and 999) not valid;
alter table tasks add constraint tasks_dates_ordered
  check (start_date is null or end_date is null or start_date <= end_date) not valid;
alter table tasks add constraint tasks_dates_sane check (
  (start_date is null or start_date between date '1900-01-01' and date '2199-12-31') and
  (end_date   is null or end_date   between date '1900-01-01' and date '2199-12-31')) not valid;
alter table subtasks add constraint subtasks_title_not_blank
  check (btrim(title) <> '') not valid;
alter table comments add constraint comments_body_not_blank
  check (btrim(body) <> '') not valid;
alter table projects add constraint projects_name_not_blank
  check (btrim(name) <> '') not valid;
alter table projects add constraint projects_key_not_blank
  check (btrim(key) <> '') not valid;
alter table workspaces add constraint workspaces_name_not_blank
  check (btrim(name) <> '') not valid;
alter table workspace_members add constraint members_capacity_range
  check (capacity_per_week between 0 and 168) not valid;

alter table tasks drop constraint tasks_created_by_fkey;
alter table tasks add constraint tasks_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;
alter table comments drop constraint comments_author_id_fkey;
alter table comments add constraint comments_author_id_fkey
  foreign key (author_id) references profiles(id) on delete set null;
alter table activity drop constraint activity_actor_id_fkey;
alter table activity add constraint activity_actor_id_fkey
  foreign key (actor_id) references profiles(id) on delete set null;
alter table workspaces drop constraint workspaces_created_by_fkey;
alter table workspaces add constraint workspaces_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

notify pgrst, 'reload schema';
