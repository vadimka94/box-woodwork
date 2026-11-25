-- 020 — ההרשאות של תפקיד "משרד"
--
-- רץ אחרי 019, בהרצה נפרדת.
--
-- הקריאה כבר פתוחה: המדיניות "read projects/items/stages/photos/media"
-- עוברת דרך project_visible(), שמחזירה אמת לכל פרויקט שאינו טיוטה, ו-
-- "read extras/blocks/installs/crew/team" פתוחות לכל משתמש מחובר. לכן
-- משתמש משרד כבר רואה את מה שהוא צריך לראות ברגע שנוצר, ואין צורך
-- במדיניות קריאה חדשה.
--
-- מה שכן חסר לו זה כתיבה בשני מקומות: צינור המכירות, ולוח ההתקנות.

-- ---------- עוזרים ----------

create or replace function public.is_office() returns boolean
  language sql stable security definer set search_path to 'public'
as $$
  select coalesce((select role = 'office' from profiles where id = auth.uid()), false)
$$;

create or replace function public.is_staff() returns boolean
  language sql stable security definer set search_path to 'public'
as $$
  select coalesce((select role in ('admin','office') from profiles where id = auth.uid()), false)
$$;

comment on function public.is_staff() is
  'מנהל או משרד. מי שעובד מול לקוחות. לא כולל עובדי ייצור.';
comment on function public.is_admin() is
  'מנהל בלבד — ואדים או מקס. מחיקה, שערי אישור, מעקב שימוש.';

-- ---------- 1. צינור המכירות ----------
-- היה crm_is_admin() (מנהל בלבד). עכשיו גם משרד.

drop policy if exists crm_admin_all on public.customers;
create policy crm_staff_all on public.customers for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists crm_admin_all on public.leads;
create policy crm_staff_all on public.leads for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists crm_admin_all on public.lead_events;
create policy crm_staff_all on public.lead_events for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists crm_admin_all on public.lead_files;
create policy crm_staff_all on public.lead_files for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- פניות מהאתר (מיגרציה 017)
drop policy if exists site_leads_admin on public.site_leads;
create policy site_leads_staff on public.site_leads for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- crm_is_admin() נשארת בחיים בכוונה — אם נשכח קריאה אליה במקום כלשהו,
-- היא עדיין תחזיר תשובה נכונה למנהל במקום להתפוצץ. אף מדיניות לא
-- משתמשת בה יותר.

-- ---------- 2. לוח ההתקנות ----------
-- "admin installs" נשארת כמו שהיא. מדיניות נפרדת למשרד, כי מדיניות RLS
-- מצטרפות ב-OR — כך שינוי אחד לא נוגע בהרשאות הקיימות של המנהל.

drop policy if exists office_installs on public.installations;
create policy office_installs on public.installations for all to authenticated
  using (public.is_office()) with check (public.is_office());

drop policy if exists office_install_crew on public.installation_crew;
create policy office_install_crew on public.installation_crew for all to authenticated
  using (public.is_office()) with check (public.is_office());

drop policy if exists office_install_items on public.installation_items;
create policy office_install_items on public.installation_items for all to authenticated
  using (public.is_office()) with check (public.is_office());

-- ---------- 3. סגירת עסקה פותחת טיוטת פרויקט ----------
-- markWon ב-crm-actions.ts מכניס שורה ל-projects עם status='draft'.
-- בלי זה המזכירה לא יכולה לסגור עסקה בכלל.
--
-- טיוטה אינה פרויקט: היא לא נכנסת לייצור עד שמנהל מאשר אותה
-- (approveForProduction, שנשאר admin בלבד). לכן זו הרשאה צרה ולא פרצה.

drop policy if exists office_open_draft on public.projects;
create policy office_open_draft on public.projects for insert to authenticated
  with check (public.is_office() and status = 'draft');

-- project_visible() הסתירה טיוטות מכל מי שאינו מנהל. אחרי סגירת עסקה
-- המסך קופץ לכרטיס הפרויקט — ובלי השינוי הזה המזכירה הייתה מגיעה
-- לעמוד ריק על פרויקט שהיא בדיוק פתחה.
create or replace function public.project_visible(pid uuid) returns boolean
  language sql stable security definer set search_path to 'public'
as $$
  select is_staff() or exists (select 1 from projects p where p.id = pid and p.status <> 'draft')
$$;

-- ---------- מה שבמתכוון לא ניתן ----------
-- projects — מחיקה, אישור לייצור, עריכת פרטים: רק מנהל (למשרד רק הכנסת טיוטה)
-- items / stages            — כתיבה: רק מנהל
-- stage_crew / stage_defaults — רק מנהל (הגדרות שיוך)
-- app_sessions / activity_log — רק מנהל (מעקב שימוש)
-- blocks (סגירה)              — רק מנהל
-- extras (כתיבה)              — רק מנהל ומי שהחוסר שויך אליו
-- gate_plans_ok / gate_release_ok — דרך can_approve_plans / can_release בשורת
--   הפרופיל, שנשארים false אצל משרד
