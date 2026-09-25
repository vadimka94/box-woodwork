-- ============================================================
-- BOX WOODWORK — ניהול לקוחות ומכירות (CRM)
-- יוצר 4 טבלאות חדשות. לא נוגע בשום טבלה קיימת.
-- רק מנהלים (ואדים ומקס) רואים ומשנים. בטוח להריץ יותר מפעם אחת.
-- ============================================================

-- ---------- לקוחות ----------
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  city        text,
  address     text,
  kind        text not null default 'private' check (kind in ('private', 'contractor')),
  source      text,
  notes       text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists customers_phone_idx on public.customers (phone);

-- ---------- עסקאות (כל פנייה היא עסקה) ----------
create table if not exists public.leads (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references public.customers(id) on delete cascade,
  kind              text not null default 'private' check (kind in ('private', 'contractor')),
  stage             text not null default 'new' check (stage in (
                      'new', 'waiting_info', 'estimate_sent', 'meeting_set',
                      'meeting_done', 'awaiting_payment', 'won', 'lost')),
  title             text,
  request           text,
  estimate_min      numeric,
  estimate_max      numeric,
  final_price       numeric,
  style             text check (style in ('cladding', 'carpentry', 'combined')),
  models            text,
  meeting_at        timestamptz,
  meeting_address   text,
  contract_mode     text check (contract_mode in ('onsite', 'pdf')),
  follow_up_on      date,
  lost_reason       text,
  lost_note         text,
  deposit_amount    numeric,
  deposit_at        timestamptz,
  project_id        uuid references public.projects(id) on delete set null,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  stage_changed_at  timestamptz not null default now()
);
create index if not exists leads_stage_idx on public.leads (stage);
create index if not exists leads_customer_idx on public.leads (customer_id);
create index if not exists leads_project_idx on public.leads (project_id);

-- ---------- ציר זמן: שיחות, הערות, מעברי שלב ----------
create table if not exists public.lead_events (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  actor       uuid references public.profiles(id) on delete set null,
  kind        text not null default 'note',
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists lead_events_lead_idx on public.lead_events (lead_id, created_at desc);

-- ---------- קבצים: מידות, אישור העברה, חוזה ----------
create table if not exists public.lead_files (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  kind          text not null default 'other' check (kind in ('measure', 'transfer', 'contract', 'other')),
  storage_path  text not null,
  name          text,
  uploaded_by   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists lead_files_lead_idx on public.lead_files (lead_id);

-- ---------- הרשאות: מנהלים בלבד ----------
create or replace function public.crm_is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

alter table public.customers   enable row level security;
alter table public.leads       enable row level security;
alter table public.lead_events enable row level security;
alter table public.lead_files  enable row level security;

drop policy if exists crm_admin_all on public.customers;
create policy crm_admin_all on public.customers
  for all to authenticated using (public.crm_is_admin()) with check (public.crm_is_admin());

drop policy if exists crm_admin_all on public.leads;
create policy crm_admin_all on public.leads
  for all to authenticated using (public.crm_is_admin()) with check (public.crm_is_admin());

drop policy if exists crm_admin_all on public.lead_events;
create policy crm_admin_all on public.lead_events
  for all to authenticated using (public.crm_is_admin()) with check (public.crm_is_admin());

drop policy if exists crm_admin_all on public.lead_files;
create policy crm_admin_all on public.lead_files
  for all to authenticated using (public.crm_is_admin()) with check (public.crm_is_admin());

-- ---------- עדכון חי במסך (Realtime) ----------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['leads', 'lead_events', 'lead_files'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
