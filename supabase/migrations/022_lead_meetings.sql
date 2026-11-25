-- 022 — פגישת לקוח מהכרטיס מופיעה ביומן
--
-- עד עכשיו היו שתי פגישות במערכת: "פגישה נקבעה" בכרטיס הליד (עם
-- leads.meeting_at), ופגישה עסקית ביומן (purpose='meeting', מיגרציה 021).
-- ואדים ראה שתיהן ושאל למה הן לא אותו דבר. הן כן.
--
-- ההחלטה: **כרטיס הליד הוא מקור האמת.** השורה ביומן היא מראה שלו —
-- נוצרת, זזה ונמחקת לפי מה שקורה בכרטיס. אין סנכרון דו-כיווני, כי שני
-- מקורות אמת לאותו תאריך זה בדיוק איך שיומן מפסיק להיות אמין.

alter table public.installations
  add column if not exists lead_id uuid references public.leads(id) on delete cascade;

-- לליד אחד יש פגישה אחת ביומן. אם התאריך זז, השורה זזה — לא נוספת שנייה.
create unique index if not exists installations_lead_uidx
  on public.installations (lead_id)
  where lead_id is not null;

comment on column public.installations.lead_id is
  'כשמלא — השורה היא מראה של leads.meeting_at ולא נערכת מהיומן. מקור האמת הוא כרטיס הליד.';

-- ---------- פגישות שכבר נקבעו ----------
-- לידים עם meeting_at קיים לא יופיעו ביומן עד שמישהו יערוך אותם, ולכן
-- מושכים אותם פנימה פעם אחת. ההמרה נעשית בפוסטגרס עם אזור זמן מפורש:
-- meeting_at הוא רגע ב-UTC, והיומן מחזיק תאריך ושעה מקומיים.

insert into public.installations
  (lead_id, project_id, purpose, title, scheduled_date, start_time, address, status, created_by)
select
  l.id,
  null,
  'meeting',
  coalesce(nullif(btrim(c.name), ''), 'פגישה עם לקוח'),
  (l.meeting_at at time zone 'Asia/Jerusalem')::date,
  (l.meeting_at at time zone 'Asia/Jerusalem')::time,
  coalesce(nullif(btrim(l.meeting_address), ''), nullif(btrim(c.address), ''), nullif(btrim(c.city), '')),
  (case when l.stage = 'meeting_done' then 'done' else 'planned' end)::public.install_status,
  l.created_by
from public.leads l
left join public.customers c on c.id = l.customer_id
where l.meeting_at is not null
  and l.stage <> 'lost'
on conflict (lead_id) where lead_id is not null do nothing;
