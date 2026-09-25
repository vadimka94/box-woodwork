-- 014_delivery.sql
-- "נמסר" (private client, after installation) and "נאסף" (contractor pickup).
-- Marking a job handed over archives it — unless the shop still owes something,
-- in which case the project waits quietly until the last shortage is closed.

alter table projects
  add column if not exists delivered_at  timestamptz,
  add column if not exists delivered_by  uuid references profiles(id),
  add column if not exists delivery_note text;

create index if not exists projects_delivered_idx
  on projects (delivered_at) where delivered_at is not null;

/*
 * The archive rule lives here rather than in the application, for the same
 * reason the gates do: whoever closes the last shortage should not have to
 * remember to also go and close the project.
 */
create or replace function auto_close_delivered_project()
returns trigger
language plpgsql
security definer
as $$
declare
  still_open int;
  p          projects%rowtype;
begin
  if new.project_id is null then return new; end if;
  if new.status not in ('done', 'cancelled') then return new; end if;

  select * into p from projects where id = new.project_id;
  if not found or p.delivered_at is null or p.status <> 'active' then
    return new;
  end if;

  select count(*) into still_open
    from extras
   where project_id = new.project_id
     and status in ('open', 'work');

  if still_open = 0 then
    update projects
       set status    = 'done',
           closed_at = now(),
           closed_by = p.delivered_by
     where id = new.project_id;

    insert into activity_log (actor, action, entity, entity_id, detail)
    values (p.delivered_by, 'נסגר אוטומטית — החוסר האחרון הושלם',
            'project', p.id, p.code);
  end if;

  return new;
end;
$$;

drop trigger if exists extras_auto_close on extras;
create trigger extras_auto_close
  after update of status on extras
  for each row execute function auto_close_delivered_project();
