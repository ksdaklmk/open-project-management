-- Repair legacy values that predate the domain checks in 0007, then make
-- every constraint fully validated. New writes were already protected by the
-- NOT VALID checks; validation closes the grandfathered-row gap.

update tasks set title = ref where btrim(title) = '';
update tasks set points = greatest(0, least(999, points))
where points is not null and points not between 0 and 999;
update tasks set start_date = greatest(date '1900-01-01', least(date '2199-12-31', start_date))
where start_date is not null and start_date not between date '1900-01-01' and date '2199-12-31';
update tasks set end_date = greatest(date '1900-01-01', least(date '2199-12-31', end_date))
where end_date is not null and end_date not between date '1900-01-01' and date '2199-12-31';
update tasks set end_date = start_date
where start_date is not null and end_date is not null and start_date > end_date;

update subtasks set title = 'Untitled subtask' where btrim(title) = '';
update comments set body = '[Empty comment]' where btrim(body) = '';
update projects set name = coalesce(nullif(btrim(key), ''), 'Untitled project')
where btrim(name) = '';
update projects set key = 'P' || left(replace(id::text, '-', ''), 11)
where btrim(key) = '' or upper(btrim(key)) !~ '^[A-Z][A-Z0-9]{0,11}$';
update projects set key = upper(btrim(key));
update workspaces set name = 'Untitled workspace' where btrim(name) = '';
update workspace_members set capacity_per_week = greatest(0, least(168, capacity_per_week))
where capacity_per_week not between 0 and 168;

alter table projects add constraint projects_key_format
  check (key ~ '^[A-Z][A-Z0-9]{0,11}$') not valid;

alter table tasks validate constraint tasks_title_not_blank;
alter table tasks validate constraint tasks_points_range;
alter table tasks validate constraint tasks_dates_ordered;
alter table tasks validate constraint tasks_dates_sane;
alter table subtasks validate constraint subtasks_title_not_blank;
alter table comments validate constraint comments_body_not_blank;
alter table projects validate constraint projects_name_not_blank;
alter table projects validate constraint projects_key_not_blank;
alter table projects validate constraint projects_key_format;
alter table workspaces validate constraint workspaces_name_not_blank;
alter table workspace_members validate constraint members_capacity_range;
