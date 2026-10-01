-- 018_prep_phase.sql
--
-- Two-phase jobs.
--
-- A handful of jobs cannot be measured when we first walk in. A drywall wall
-- has to come down, or infrastructure has to be run, and only afterwards can
-- anyone take the measurements that production works from.
--
-- That preparation is a stage of the PROJECT, not an item: nothing is
-- manufactured in it, so it must not drag the item stage chain behind it
-- (CNC, edge banding, assembly…). It sits at seq 0 — before מדידה — and
-- everything else in the job stays locked until it is marked done.

/* ---------- 1. the flag on the project ---------- */

alter table public.projects
  add column if not exists prep_required boolean not null default false;
alter table public.projects
  add column if not exists prep_note text;

comment on column public.projects.prep_required is
  'On-site preparation must happen before measuring. Seeds project stage seq 0.';
comment on column public.projects.prep_note is
  'What has to be done on site before anyone can measure.';

/* ---------- 2. a prep visit is not an installation ---------- */
/* Same calendar, different job: the van drives out to demolish, not to fit. */

alter table public.installations
  add column if not exists purpose text not null default 'install';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'installations_purpose_check') then
    alter table public.installations
      add constraint installations_purpose_check check (purpose in ('install','prep'));
  end if;
end $$;

comment on column public.installations.purpose is
  '''install'' = fitting the finished work. ''prep'' = the preparatory site visit of a two-phase job.';

/* ---------- 3. seed the prep stage on a new project ---------- */

create or replace function public.seed_project_stages() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare sid uuid; rec record;
begin
  /* seq 0 — only for a two-phase job. Nothing is measured until it is done. */
  if coalesce(new.prep_required, false) then
    insert into stages (project_id, scope, seq, name, station)
    values (new.id, 'project', 0, 'עבודת הכנה בשטח', 'התקנה') returning id into sid;
    insert into stage_crew (stage_id, profile_id)
      select sid, profile_id from stage_defaults where scope='project' and seq=0;
  end if;

  if new.kind = 'contractor' then
    for rec in select * from (values
        (1,'חישוב חומר והצעת מחיר','מדידה ותכנון'),
        (2,'אישור הזמנה','מדידה ותכנון'),
        (3,'מקדמה שולמה','מדידה ותכנון'),
        (4,'תכנון סקיצה','מדידה ותכנון'),
        (5,'אישור סקיצה','מדידה ותכנון'),
        (6,'פירוק ללוחות והזמנת חומר','מדידה ותכנון')) as t(seq,nm,st)
    loop
      insert into stages (project_id, scope, seq, name, station)
      values (new.id,'project',rec.seq,rec.nm,rec.st) returning id into sid;
      insert into stage_crew (stage_id, profile_id)
        select sid, profile_id from stage_defaults where scope='project' and seq=rec.seq;
    end loop;
  else
    for rec in select * from (values
        (1,'מדידה','מדידה ותכנון'),
        (2,'תכנון הדמיה','מדידה ותכנון'),
        (3,'אישור לקוח','מדידה ותכנון')) as t(seq,nm,st)
    loop
      insert into stages (project_id, scope, seq, name, station)
      values (new.id,'project',rec.seq,rec.nm,rec.st) returning id into sid;
      insert into stage_crew (stage_id, profile_id)
        select sid, profile_id from stage_defaults where scope='project' and seq=rec.seq;
    end loop;
  end if;
  return new;
end $$;

/* ---------- 4. turn the prep stage on or off for a project that already exists ---------- */
/* Needed for every job opened before this migration — and for the one Vadim
   already opened as two items. */

create or replace function public.set_project_prep(pid uuid, want boolean, note text default null)
    returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare sid uuid; st stage_status;
begin
  if not coalesce((select role='admin' from profiles where id=auth.uid()), false) then
    raise exception 'רק ואדים או מקס יכולים לשנות שלב הכנה';
  end if;

  select status into st from stages
    where project_id=pid and scope='project' and seq=0;

  if want then
    update projects
       set prep_required = true,
           prep_note = coalesce(nullif(btrim(note),''), prep_note)
     where id = pid;

    if st is null then
      insert into stages (project_id, scope, seq, name, station)
      values (pid,'project',0,'עבודת הכנה בשטח','התקנה') returning id into sid;
      insert into stage_crew (stage_id, profile_id)
        select sid, profile_id from stage_defaults where scope='project' and seq=0;
    end if;
  else
    /* a stage somebody already worked is a record of work done — it stays */
    if st is not null and st <> 'idle' then
      raise exception 'שלב ההכנה כבר התחיל — אי אפשר לבטל אותו';
    end if;
    delete from stages where project_id=pid and scope='project' and seq=0;
    update projects set prep_required = false, prep_note = null where id = pid;
  end if;

  insert into activity_log(actor, action, entity, entity_id)
    values (auth.uid(),
            case when want then 'הוסיף שלב הכנה בשטח' else 'ביטל שלב הכנה בשטח' end,
            'project', pid);
end $$;

/* ---------- 5. the lock ---------- */
/* guard_gates() used to look only at item stages. A two-phase job needs the
   project's own stages held back too: no measuring on a wall that is still up. */

create or replace function public.guard_gates() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare k project_kind; ordered timestamptz; prep boolean; prep_status stage_status;
begin
  if new.status is distinct from old.status then
    /* seq 0 is the prep stage itself — it is never blocked by itself */
    if new.seq > 0 then
      select p.prep_required into prep from projects p where p.id = new.project_id;
      if coalesce(prep, false) then
        select status into prep_status from stages
          where project_id = new.project_id and scope = 'project' and seq = 0;
        if prep_status is not null and prep_status <> 'done' then
          raise exception 'נעול — קודם צריך לסיים את עבודת ההכנה בשטח';
        end if;
      end if;
    end if;
  end if;

  if new.status is distinct from old.status and new.item_id is not null then
    select p.kind, p.material_ordered_at into k, ordered
      from projects p where p.id = new.project_id;

    if k = 'contractor' then
      if ordered is null then
        raise exception 'נעול — החומר עוד לא הוזמן';
      end if;
      if new.seq >= 11 and not gate_release_ok(new.item_id) then
        raise exception 'נעול — ממתין לבקרה לפני אריזה';
      end if;
    else
      if not gate_plans_ok(new.project_id) then
        raise exception 'נעול — ממתין לאישור התוכניות של מקס';
      end if;
      if new.seq >= 9 and not gate_release_ok(new.item_id) then
        raise exception 'נעול — ממתין לבקרה לפני אריזה';
      end if;
    end if;
  end if;
  return new;
end $$;
