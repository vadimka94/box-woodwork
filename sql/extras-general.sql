-- ============================================================
-- חוסרים ותוספות — "כללי" (פתוח לכל הצוות)
-- דיווח שלא שויך לאף אחד (assigned_to ריק) גלוי לכל העובדים,
-- וכל עובד יכול לקחת אותו על עצמו. ברגע שלקח — הוא הבעלים.
-- בטוח להריץ יותר מפעם אחת.
-- ============================================================

-- 1. כל משתמש מחובר רואה דיווחים כלליים
drop policy if exists extras_general_read on public.extras;
create policy extras_general_read on public.extras
  for select to authenticated
  using (assigned_to is null);

-- 2. כל משתמש מחובר יכול "לקחת" דיווח כללי — רק לעצמו
drop policy if exists extras_general_claim on public.extras;
create policy extras_general_claim on public.extras
  for update to authenticated
  using (assigned_to is null)
  with check (assigned_to = auth.uid());

-- 3. העובד שלקח ממשיך לעדכן את הדיווח שלו (התחלתי / בוצע)
drop policy if exists extras_own_update on public.extras;
create policy extras_own_update on public.extras
  for update to authenticated
  using (assigned_to = auth.uid())
  with check (assigned_to = auth.uid());

-- 4. העובד רואה את הדיווחים שלו
drop policy if exists extras_own_read on public.extras;
create policy extras_own_read on public.extras
  for select to authenticated
  using (assigned_to = auth.uid());

-- 5. תמונות של דיווח כללי גלויות לכולם
drop policy if exists extra_photos_general_read on public.extra_photos;
create policy extra_photos_general_read on public.extra_photos
  for select to authenticated
  using (exists (
    select 1 from public.extras e
    where e.id = extra_photos.extra_id and e.assigned_to is null
  ));
