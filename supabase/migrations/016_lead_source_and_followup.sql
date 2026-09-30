-- 016_lead_source_and_followup.sql
--
-- Two small changes, both about knowing what works.
--
-- 1. Lead source moves onto the DEAL. It lived on the customer, so a repeat
--    customer who came from Instagram once and from a referral the next time
--    was counted once. You cannot tell which channel earns money that way.
-- 2. follow_up_step drives the 3 → 7 → 14 day follow-up rhythm.

alter table public.leads add column if not exists source          text;
alter table public.leads add column if not exists follow_up_step  smallint not null default 0;

create index if not exists leads_source_idx on public.leads (source);

-- Existing deals inherit the source recorded on their customer, so history is
-- not empty on the first report.
update public.leads l
   set source = c.source
  from public.customers c
 where l.customer_id = c.id
   and l.source is null
   and c.source is not null;

comment on column public.leads.source is
  'Where this particular deal came from. Copied to customers.source on the first deal.';
comment on column public.leads.follow_up_step is
  '0 = none, 1 = +3d set, 2 = +7d set, 3 = +14d set (last automatic nudge).';
