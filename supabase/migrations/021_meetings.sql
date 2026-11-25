-- 021 — פגישות ביומן
--
-- פגישה עם ספק במשרד היא יום בלוח כמו כל יום אחר, אבל היא לא התקנה
-- ולא עבודת הכנה. היא נכנסת כערך שלישי של purpose, ולכן מקבלת בחינם
-- את הלוח החודשי, שיוך המשתתפים, דף הפרטים ויומן הפעילות.
--
-- שתי החלטות של ואדים:
--   1. פגישה היא של ההנהלה והמשרד בלבד. עובדי ייצור לא רואים אותה.
--   2. פגישה לא עולה על מסך המפעל.
--
-- שתיהן נאכפות כאן, ב-RLS — לא בסינון במסך. משתמש המסך (tv@boxwoodwork.local)
-- הוא role='display', שאינו staff, ולכן הוא פשוט לא מקבל את השורות האלה.

-- ---------- 1. ערך שלישי ל-purpose ----------

alter table public.installations drop constraint if exists installations_purpose_check;
alter table public.installations
  add constraint installations_purpose_check
  check (purpose in ('install', 'prep', 'meeting'));

comment on column public.installations.purpose is
  '''install'' = התקנה. ''prep'' = עבודת הכנה בשטח. ''meeting'' = פגישה עסקית.';

-- ---------- 2. פגישה נראית למנהל ולמשרד בלבד ----------
--
-- "read installs" הייתה פתוחה לכל משתמש מחובר. עכשיו היא מחריגה פגישות
-- לכל מי שאינו מנהל או משרד. שאר העבודות ביומן לא מושפעות.

drop policy if exists "read installs" on public.installations;
create policy "read installs" on public.installations for select to authenticated
  using (purpose <> 'meeting' or public.is_staff());

-- הערה: הכתיבה כבר מוגבלת — "admin installs" ל-is_admin() ו-office_installs
-- ל-is_office(). עובד ייצור לא יכול ליצור פגישה גם בלי מדיניות נוספת.
