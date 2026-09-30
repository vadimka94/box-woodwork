-- 017 — פניות מהאתר
--
-- טופס פתוח באינטרנט הוא גם צינור לספאם, ולכן פנייה מהאתר לא נכנסת
-- ישירות לטבלת הלידים. היא נוחתת כאן, ואדים מאשר, ורק אז נוצרים
-- לקוח וליד אמיתיים. כך צינור המכירות נשאר נקי ואף בוט לא מגיע אליו.
--
-- אף אחד מהאתר לא נוגע בטבלה הזו ישירות: הכתיבה נעשית בפונקציית שרת
-- ב-Vercel שמחזיקה את מפתח השירות. לכן אין כאן שום מדיניות ל-anon.

create table if not exists public.site_leads (
  id           uuid primary key default gen_random_uuid(),

  name         text not null,
  phone        text not null,
  city         text,
  style        text,                  -- אותם ערכים כמו leads.style
  request      text,

  landed_on    text,                  -- מאיזו כתובת נכנס (/nfc, /ig וכו')
  referrer     text,

  status       text not null default 'new',
  lead_id      uuid references public.leads(id) on delete set null,
  handled_at   timestamptz,
  handled_by   uuid references public.profiles(id),

  created_at   timestamptz not null default now(),

  constraint site_leads_status_check
    check (status in ('new', 'approved', 'spam')),
  constraint site_leads_style_check
    check (style is null or style in ('cladding', 'carpentry', 'combined'))
);

-- המסך מציג קודם את מה שממתין, לפי סדר הגעה
create index if not exists site_leads_pending_idx
  on public.site_leads (created_at desc)
  where status = 'new';

alter table public.site_leads enable row level security;

-- רק מנהל רואה ומטפל. אין מדיניות ל-anon, ולכן אין גישה מהדפדפן.
drop policy if exists site_leads_admin on public.site_leads;
create policy site_leads_admin on public.site_leads
  to authenticated
  using (public.crm_is_admin())
  with check (public.crm_is_admin());
