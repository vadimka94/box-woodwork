-- ============================================================
-- חוסרים ותוספות — מסלול ייצור "כללי" (general)
-- מאפשר לשמור route = 'general' בנוסף ל-cnc ו-manual.
-- הקובץ מזהה לבד איך העמודה מוגדרת (enum או check), ובטוח להריץ שוב.
-- ============================================================

do $$
declare
  col_type text;
  con record;
begin
  select udt_name into col_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'extras' and column_name = 'route';

  -- מקרה 1: העמודה היא enum — מוסיפים לו ערך
  if exists (select 1 from pg_type where typname = col_type and typtype = 'e') then
    execute format('alter type %I add value if not exists %L', col_type, 'general');
  end if;

  -- מקרה 2: יש check שמגביל את route — מחליפים אותו בגרסה שכוללת general
  for con in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'extras'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%route%'
  loop
    execute format('alter table public.extras drop constraint %I', con.conname);
  end loop;

  if col_type = 'text' or col_type = 'varchar' then
    alter table public.extras
      add constraint extras_route_check check (route in ('general', 'cnc', 'manual'));
  end if;
end $$;
