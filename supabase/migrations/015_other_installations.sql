-- 015_other_installations.sql
-- Not every job on the calendar is a project. A pop-up installation, or a
-- standing site like קמ"ג דימונה, needs a slot on the schedule without
-- inventing a fake project card for it.

alter table public.installations alter column project_id drop not null;
alter table public.installations add column if not exists title text;

-- An entry has to be about something: either a project, or a written title.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'installations_needs_subject') then
    alter table public.installations
      add constraint installations_needs_subject
      check (project_id is not null or nullif(btrim(title), '') is not null);
  end if;
end $$;

comment on column public.installations.title is
  'Free-text subject for a job with no project ("אחר"). Null when project_id is set.';
