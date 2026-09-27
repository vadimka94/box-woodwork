--
-- PostgreSQL database dump
--

\restrict gZ3Zudv465eImCGfi7BO6WCWXiT6Gf3d3gG49peoXrygW1g5DlsM0ue12zcGizs

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: block_reason; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.block_reason AS ENUM (
    'missing_hardware',
    'missing_material',
    'missing_details',
    'machine_down',
    'rework',
    'waiting_customer'
);


--
-- Name: extra_route; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.extra_route AS ENUM (
    'cnc',
    'manual',
    'general'
);


--
-- Name: extra_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.extra_source AS ENUM (
    'missing',
    'customer_request',
    'damaged',
    'remake'
);


--
-- Name: extra_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.extra_status AS ENUM (
    'open',
    'work',
    'done',
    'cancelled'
);


--
-- Name: install_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.install_status AS ENUM (
    'planned',
    'done',
    'cancelled'
);


--
-- Name: media_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.media_kind AS ENUM (
    'image',
    'pdf',
    'sketchup',
    'other'
);


--
-- Name: project_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.project_kind AS ENUM (
    'full',
    'contractor'
);


--
-- Name: project_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.project_status AS ENUM (
    'draft',
    'active',
    'done',
    'cancelled'
);


--
-- Name: stage_scope; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.stage_scope AS ENUM (
    'project',
    'item'
);


--
-- Name: stage_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.stage_status AS ENUM (
    'idle',
    'work',
    'done',
    'stop'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'cnc',
    'worker',
    'display'
);


--
-- Name: auto_close_delivered_project(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_close_delivered_project() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  still_open int;
  p          projects%rowtype;
begin
  if new.project_id is null then return new; end if;
  if new.status not in ('done', 'cancelled') then return new; end if;

  select * into p from projects where id = new.project_id;
  if not found or p.delivered_at is null or p.status <> 'active' then
    return new;
  end if;

  select count(*) into still_open
    from extras
   where project_id = new.project_id
     and status in ('open', 'work');

  if still_open = 0 then
    update projects
       set status    = 'done',
           closed_at = now(),
           closed_by = p.delivered_by
     where id = new.project_id;

    insert into activity_log (actor, action, entity, entity_id, detail)
    values (p.delivered_by, 'נסגר אוטומטית — החוסר האחרון הושלם',
            'project', p.id, p.code);
  end if;

  return new;
end;
$$;


--
-- Name: crm_is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;


--
-- Name: gate_plans_ok(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gate_plans_ok(pid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select gate_plans_ok from projects where id = pid $$;


--
-- Name: gate_release_ok(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gate_release_ok(iid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select gate_release_ok from items where id = iid), true)
$$;


--
-- Name: guard_gates(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_gates() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare k project_kind; ordered timestamptz;
begin
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


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select role='admin' from profiles where id=auth.uid()), false) $$;


--
-- Name: material_arrived(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.material_arrived(pid uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not coalesce((select role='admin' from profiles where id=auth.uid()), false) then
    raise exception 'רק מנהל יכול לסמן שהחומר הגיע';
  end if;
  update projects set material_arrived_at = now() where id = pid;
  insert into activity_log(actor, action, entity, entity_id)
    values (auth.uid(), 'החומר הגיע', 'project', pid);
end $$;


--
-- Name: my_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_role() RETURNS public.user_role
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select role from profiles where id = auth.uid() $$;


--
-- Name: new_sketch_round(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.new_sketch_round(pid uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare r int;
begin
  if not coalesce((select role='admin' from profiles where id=auth.uid()), false) then
    raise exception 'רק מנהל יכול לפתוח סבב סקיצה';
  end if;
  update projects set sketch_round = sketch_round + 1 where id = pid returning sketch_round into r;
  update stages set status = 'work', completed_at = null
   where project_id = pid and scope = 'project' and seq = 4;
  update stages set status = 'idle', completed_at = null
   where project_id = pid and scope = 'project' and seq = 5;
  insert into activity_log(actor, action, entity, entity_id, detail)
    values (auth.uid(), 'פתח סבב סקיצה', 'project', pid, 'סבב ' || r);
end $$;


--
-- Name: on_stage(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.on_stage(sid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from stage_crew c where c.stage_id=sid and c.profile_id=auth.uid()) $$;


--
-- Name: order_material(uuid, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.order_material(pid uuid, eta date, note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not coalesce((select role='admin' from profiles where id=auth.uid()), false) then
    raise exception 'רק ואדים או מקס יכולים להזמין חומר';
  end if;
  update projects
     set material_ordered_at = now(), material_eta = eta, material_note = note
   where id = pid;
  insert into activity_log(actor, action, entity, entity_id, detail)
    values (auth.uid(), 'הזמין חומר', 'project', pid, coalesce(eta::text,''));
end $$;


--
-- Name: project_visible(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.project_visible(pid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select is_admin() or exists (select 1 from projects p where p.id=pid and p.status<>'draft') $$;


--
-- Name: prune_app_sessions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prune_app_sessions() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  delete from app_sessions where started_at < now() - interval '90 days';
$$;


--
-- Name: seed_item_stages(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_item_stages() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  sid uuid; rec record;
  k project_kind; carp boolean;
begin
  select kind, has_carpentry into k, carp from projects where id = new.project_id;

  if k = 'contractor' then
    for rec in select * from (values
        (7,  'חיתוך וחירוץ CNC', 'מכונת CNC',  true),
        (8,  'הדבקת קנט',        'קנט',        false),   -- נגרות בלבד
        (9,  'הרכבה',            'הרכבה',      false),   -- נגרות בלבד
        (10, 'בקרת איכות',       'בקרת איכות', true),
        (11, 'ניקוי ואריזה',     'אריזה',      true),
        (12, 'מוכן לאיסוף',      'אריזה',      true))
      as t(seq,nm,st,always)
    loop
      if rec.always or carp then
        insert into stages (project_id, item_id, scope, seq, name, station)
        values (new.project_id,new.id,'item',rec.seq,rec.nm,rec.st) returning id into sid;
        insert into stage_crew (stage_id, profile_id)
          select sid, profile_id from stage_defaults where scope='item' and seq=least(rec.seq-3,9);
      end if;
    end loop;
  else
    for rec in select * from (values
        (4,'תכנות CNC','תכנות CNC'),
        (5,'חיתוך CNC','מכונת CNC'),
        (6,'הדבקת קנט','קנט'),
        (7,'הרכבה','הרכבה'),
        (8,'בקרת איכות','בקרת איכות'),
        (9,'אריזה','אריזה'),
        (10,'התקנה','התקנה')) as t(seq,nm,st)
    loop
      insert into stages (project_id, item_id, scope, seq, name, station)
      values (new.project_id,new.id,'item',rec.seq,rec.nm,rec.st) returning id into sid;
      insert into stage_crew (stage_id, profile_id)
        select sid, profile_id from stage_defaults where scope='item' and seq=rec.seq;
    end loop;
  end if;
  return new;
end $$;


--
-- Name: seed_project_stages(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_project_stages() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare sid uuid; rec record;
begin
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


--
-- Name: sign_gate_plans(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sign_gate_plans(pid uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not coalesce((select can_approve_plans from profiles where id=auth.uid()),false) then
    raise exception 'רק מקס יכול לאשר תוכניות לביצוע';
  end if;
  update projects set gate_plans_ok=true, gate_plans_by=auth.uid(), gate_plans_at=now() where id=pid;
  insert into activity_log(actor,action,entity,entity_id) values (auth.uid(),'אישר תוכניות לביצוע','project',pid);
end $$;


--
-- Name: sign_gate_release(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sign_gate_release(iid uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not coalesce((select can_release from profiles where id=auth.uid()),false) then
    raise exception 'רק ואדים או מקס יכולים לשחרר לאריזה';
  end if;
  update items set gate_release_ok=true, gate_release_by=auth.uid(), gate_release_at=now() where id=iid;
  insert into activity_log(actor,action,entity,entity_id) values (auth.uid(),'אישר שחרור לאריזה','item',iid);
end $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Box woodwork; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Box woodwork" (
    "-- ============================================================" text
);


--
-- Name: TABLE "Box woodwork"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."Box woodwork" IS 'Pr';


--
-- Name: Box-woodwork; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Box-woodwork" (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE "Box-woodwork"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."Box-woodwork" IS 'Project management';


--
-- Name: Box-woodwork_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."Box-woodwork" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."Box-woodwork_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_log (
    id bigint NOT NULL,
    actor uuid,
    action text NOT NULL,
    entity text,
    entity_id uuid,
    detail text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: activity_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.activity_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: activity_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.activity_log_id_seq OWNED BY public.activity_log.id;


--
-- Name: app_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone DEFAULT now() NOT NULL,
    path text
);


--
-- Name: blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stage_id uuid NOT NULL,
    project_id uuid NOT NULL,
    item_id uuid,
    reason_code public.block_reason NOT NULL,
    note text NOT NULL,
    note_lang text DEFAULT 'he'::text,
    note_tr jsonb DEFAULT '{}'::jsonb,
    reported_by uuid,
    reported_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    resolution_note text
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text,
    city text,
    address text,
    kind text DEFAULT 'private'::text NOT NULL,
    source text,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customers_kind_check CHECK ((kind = ANY (ARRAY['private'::text, 'contractor'::text])))
);


--
-- Name: extra_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extra_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    extra_id uuid NOT NULL,
    project_id uuid,
    storage_path text NOT NULL,
    taken_by uuid,
    taken_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: extras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extras (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    item_id uuid,
    title text NOT NULL,
    description text,
    description_lang text DEFAULT 'he'::text,
    description_tr jsonb DEFAULT '{}'::jsonb,
    source public.extra_source DEFAULT 'missing'::public.extra_source NOT NULL,
    route public.extra_route DEFAULT 'manual'::public.extra_route NOT NULL,
    assigned_to uuid,
    status public.extra_status DEFAULT 'open'::public.extra_status NOT NULL,
    qty integer DEFAULT 1 NOT NULL,
    reported_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    done_at timestamp with time zone
);


--
-- Name: installation_crew; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.installation_crew (
    installation_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: installation_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.installation_items (
    installation_id uuid NOT NULL,
    item_id uuid NOT NULL
);


--
-- Name: installations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.installations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    scheduled_date date NOT NULL,
    start_time time without time zone,
    address text,
    note text,
    status public.install_status DEFAULT 'planned'::public.install_status NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: item_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id uuid NOT NULL,
    project_id uuid NOT NULL,
    storage_path text NOT NULL,
    caption text,
    taken_by uuid,
    taken_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    qty integer DEFAULT 1 NOT NULL,
    note text,
    note_lang text DEFAULT 'he'::text,
    note_tr jsonb DEFAULT '{}'::jsonb,
    sort integer DEFAULT 0 NOT NULL,
    due_date date,
    gate_release_ok boolean DEFAULT false NOT NULL,
    gate_release_by uuid,
    gate_release_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lead_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    actor uuid,
    kind text DEFAULT 'note'::text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lead_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    kind text DEFAULT 'other'::text NOT NULL,
    storage_path text NOT NULL,
    name text,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lead_files_kind_check CHECK ((kind = ANY (ARRAY['measure'::text, 'transfer'::text, 'contract'::text, 'other'::text])))
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    kind text DEFAULT 'private'::text NOT NULL,
    stage text DEFAULT 'new'::text NOT NULL,
    title text,
    request text,
    estimate_min numeric,
    estimate_max numeric,
    final_price numeric,
    style text,
    models text,
    meeting_at timestamp with time zone,
    meeting_address text,
    contract_mode text,
    follow_up_on date,
    lost_reason text,
    lost_note text,
    deposit_amount numeric,
    deposit_at timestamp with time zone,
    project_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    stage_changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT leads_contract_mode_check CHECK ((contract_mode = ANY (ARRAY['onsite'::text, 'pdf'::text]))),
    CONSTRAINT leads_kind_check CHECK ((kind = ANY (ARRAY['private'::text, 'contractor'::text]))),
    CONSTRAINT leads_stage_check CHECK ((stage = ANY (ARRAY['new'::text, 'waiting_info'::text, 'estimate_sent'::text, 'meeting_set'::text, 'meeting_done'::text, 'awaiting_payment'::text, 'won'::text, 'lost'::text]))),
    CONSTRAINT leads_style_check CHECK ((style = ANY (ARRAY['cladding'::text, 'carpentry'::text, 'combined'::text])))
);


--
-- Name: media_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    item_id uuid,
    folder_id uuid,
    revision_id uuid,
    name text NOT NULL,
    kind public.media_kind DEFAULT 'other'::public.media_kind NOT NULL,
    storage_path text NOT NULL,
    size_bytes bigint,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: media_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    sort integer DEFAULT 0 NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text NOT NULL,
    role public.user_role DEFAULT 'worker'::public.user_role NOT NULL,
    title text[] DEFAULT '{}'::text[],
    lang text DEFAULT 'he'::text NOT NULL,
    can_approve_plans boolean DEFAULT false NOT NULL,
    can_release boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: project_revisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    rev text NOT NULL,
    customer_approved_at timestamp with time zone,
    approved_by uuid,
    note text,
    superseded boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    client_name text NOT NULL,
    client_phone text,
    city text,
    due_date date,
    status public.project_status DEFAULT 'draft'::public.project_status NOT NULL,
    production_note text,
    note_lang text DEFAULT 'he'::text,
    note_tr jsonb DEFAULT '{}'::jsonb,
    current_rev text,
    approved_at timestamp with time zone,
    approved_by uuid,
    gate_plans_ok boolean DEFAULT false NOT NULL,
    gate_plans_by uuid,
    gate_plans_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    closed_by uuid,
    kind public.project_kind DEFAULT 'full'::public.project_kind NOT NULL,
    has_carpentry boolean DEFAULT true NOT NULL,
    material_ordered_at timestamp with time zone,
    material_eta date,
    material_arrived_at timestamp with time zone,
    material_note text,
    sketch_round integer DEFAULT 1 NOT NULL,
    delivered_at timestamp with time zone,
    delivered_by uuid,
    delivery_note text
);


--
-- Name: stage_crew; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stage_crew (
    stage_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    added_by uuid
);


--
-- Name: stage_defaults; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stage_defaults (
    scope public.stage_scope NOT NULL,
    seq integer NOT NULL,
    profile_id uuid NOT NULL
);


--
-- Name: stage_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stage_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stage_id uuid NOT NULL,
    project_id uuid NOT NULL,
    item_id uuid,
    from_status public.stage_status,
    to_status public.stage_status NOT NULL,
    actor uuid,
    reason_code public.block_reason,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    item_id uuid,
    scope public.stage_scope NOT NULL,
    seq integer NOT NULL,
    name text NOT NULL,
    station text,
    status public.stage_status DEFAULT 'idle'::public.stage_status NOT NULL,
    lead_id uuid,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: v_floor; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_floor AS
 SELECT s.station,
    p.code,
    p.name AS project,
    p.client_name,
    p.due_date,
    i.name AS item,
    s.name AS stage,
    s.status,
    ( SELECT string_agg(pr.full_name, ', '::text) AS string_agg
           FROM (public.stage_crew c
             JOIN public.profiles pr ON ((pr.id = c.profile_id)))
          WHERE (c.stage_id = s.id)) AS crew,
    b.reason_code,
    b.note AS block_note,
    b.note_tr AS block_note_tr,
    b.reported_at,
    p.gate_plans_ok,
    i.gate_release_ok
   FROM (((public.stages s
     JOIN public.projects p ON (((p.id = s.project_id) AND (p.status = 'active'::public.project_status))))
     LEFT JOIN public.items i ON ((i.id = s.item_id)))
     LEFT JOIN public.blocks b ON (((b.stage_id = s.id) AND (b.resolved_at IS NULL))))
  WHERE (s.status = ANY (ARRAY['work'::public.stage_status, 'stop'::public.stage_status]));


--
-- Name: v_item_progress; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_item_progress AS
SELECT
    NULL::uuid AS item_id,
    NULL::uuid AS project_id,
    NULL::text AS name,
    NULL::integer AS done_stages,
    NULL::integer AS total_stages,
    NULL::numeric AS pct;


--
-- Name: v_project_progress; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_project_progress AS
SELECT
    NULL::uuid AS project_id,
    NULL::text AS code,
    NULL::integer AS done_stages,
    NULL::integer AS total_stages,
    NULL::integer AS blocked_stages,
    NULL::numeric AS pct;


--
-- Name: v_schedule; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_schedule AS
 SELECT i.id,
    i.scheduled_date,
    i.start_time,
    i.status,
    i.address,
    i.note,
    p.code,
    p.name AS project,
    p.client_name,
    p.city,
    ( SELECT string_agg(pr.full_name, ', '::text) AS string_agg
           FROM (public.installation_crew c
             JOIN public.profiles pr ON ((pr.id = c.profile_id)))
          WHERE (c.installation_id = i.id)) AS crew
   FROM (public.installations i
     JOIN public.projects p ON ((p.id = i.project_id)))
  WHERE (i.status <> 'cancelled'::public.install_status)
  ORDER BY i.scheduled_date, i.start_time;


--
-- Name: v_signatures; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_signatures AS
 SELECT e.created_at,
    pr.full_name AS who,
    e.to_status,
    e.reason_code,
    e.note,
    p.code AS project,
    i.name AS item,
    s.name AS stage
   FROM ((((public.stage_events e
     JOIN public.stages s ON ((s.id = e.stage_id)))
     JOIN public.projects p ON ((p.id = e.project_id)))
     LEFT JOIN public.items i ON ((i.id = e.item_id)))
     LEFT JOIN public.profiles pr ON ((pr.id = e.actor)))
  ORDER BY e.created_at DESC;


--
-- Name: activity_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log ALTER COLUMN id SET DEFAULT nextval('public.activity_log_id_seq'::regclass);


--
-- Name: Box-woodwork Box-woodwork_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Box-woodwork"
    ADD CONSTRAINT "Box-woodwork_pkey" PRIMARY KEY (id);


--
-- Name: activity_log activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);


--
-- Name: app_sessions app_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_sessions
    ADD CONSTRAINT app_sessions_pkey PRIMARY KEY (id);


--
-- Name: blocks blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: extra_photos extra_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extra_photos
    ADD CONSTRAINT extra_photos_pkey PRIMARY KEY (id);


--
-- Name: extras extras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extras
    ADD CONSTRAINT extras_pkey PRIMARY KEY (id);


--
-- Name: installation_crew installation_crew_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installation_crew
    ADD CONSTRAINT installation_crew_pkey PRIMARY KEY (installation_id, profile_id);


--
-- Name: installation_items installation_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installation_items
    ADD CONSTRAINT installation_items_pkey PRIMARY KEY (installation_id, item_id);


--
-- Name: installations installations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installations
    ADD CONSTRAINT installations_pkey PRIMARY KEY (id);


--
-- Name: item_photos item_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_photos
    ADD CONSTRAINT item_photos_pkey PRIMARY KEY (id);


--
-- Name: items items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_pkey PRIMARY KEY (id);


--
-- Name: lead_events lead_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_events
    ADD CONSTRAINT lead_events_pkey PRIMARY KEY (id);


--
-- Name: lead_files lead_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_files
    ADD CONSTRAINT lead_files_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: media_files media_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_files
    ADD CONSTRAINT media_files_pkey PRIMARY KEY (id);


--
-- Name: media_folders media_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_folders
    ADD CONSTRAINT media_folders_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: project_revisions project_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_revisions
    ADD CONSTRAINT project_revisions_pkey PRIMARY KEY (id);


--
-- Name: project_revisions project_revisions_project_id_rev_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_revisions
    ADD CONSTRAINT project_revisions_project_id_rev_key UNIQUE (project_id, rev);


--
-- Name: projects projects_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_code_key UNIQUE (code);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: stage_crew stage_crew_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_crew
    ADD CONSTRAINT stage_crew_pkey PRIMARY KEY (stage_id, profile_id);


--
-- Name: stage_defaults stage_defaults_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_defaults
    ADD CONSTRAINT stage_defaults_pkey PRIMARY KEY (scope, seq, profile_id);


--
-- Name: stage_events stage_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_events
    ADD CONSTRAINT stage_events_pkey PRIMARY KEY (id);


--
-- Name: stages stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stages
    ADD CONSTRAINT stages_pkey PRIMARY KEY (id);


--
-- Name: activity_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_log_created_at_idx ON public.activity_log USING btree (created_at DESC);


--
-- Name: app_sessions_profile_id_started_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_sessions_profile_id_started_at_idx ON public.app_sessions USING btree (profile_id, started_at DESC);


--
-- Name: app_sessions_started_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_sessions_started_at_idx ON public.app_sessions USING btree (started_at DESC);


--
-- Name: blocks_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blocks_project_id_idx ON public.blocks USING btree (project_id) WHERE (resolved_at IS NULL);


--
-- Name: customers_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customers_phone_idx ON public.customers USING btree (phone);


--
-- Name: extra_photos_extra_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX extra_photos_extra_id_idx ON public.extra_photos USING btree (extra_id);


--
-- Name: extras_assigned_to_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX extras_assigned_to_status_idx ON public.extras USING btree (assigned_to, status);


--
-- Name: extras_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX extras_project_id_idx ON public.extras USING btree (project_id);


--
-- Name: extras_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX extras_status_idx ON public.extras USING btree (status);


--
-- Name: installation_crew_profile_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX installation_crew_profile_id_idx ON public.installation_crew USING btree (profile_id);


--
-- Name: installations_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX installations_project_id_idx ON public.installations USING btree (project_id);


--
-- Name: installations_scheduled_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX installations_scheduled_date_idx ON public.installations USING btree (scheduled_date);


--
-- Name: item_photos_item_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_photos_item_id_idx ON public.item_photos USING btree (item_id);


--
-- Name: items_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX items_project_id_idx ON public.items USING btree (project_id);


--
-- Name: lead_events_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_events_lead_idx ON public.lead_events USING btree (lead_id, created_at DESC);


--
-- Name: lead_files_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_files_lead_idx ON public.lead_files USING btree (lead_id);


--
-- Name: leads_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_customer_idx ON public.leads USING btree (customer_id);


--
-- Name: leads_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_project_idx ON public.leads USING btree (project_id);


--
-- Name: leads_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_stage_idx ON public.leads USING btree (stage);


--
-- Name: media_files_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_files_project_id_idx ON public.media_files USING btree (project_id);


--
-- Name: projects_delivered_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_delivered_idx ON public.projects USING btree (delivered_at) WHERE (delivered_at IS NOT NULL);


--
-- Name: projects_due_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_due_date_idx ON public.projects USING btree (due_date);


--
-- Name: projects_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_status_idx ON public.projects USING btree (status);


--
-- Name: stage_crew_profile_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stage_crew_profile_id_idx ON public.stage_crew USING btree (profile_id);


--
-- Name: stage_events_actor_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stage_events_actor_created_at_idx ON public.stage_events USING btree (actor, created_at);


--
-- Name: stage_events_project_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stage_events_project_id_created_at_idx ON public.stage_events USING btree (project_id, created_at);


--
-- Name: stages_item_id_seq_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX stages_item_id_seq_idx ON public.stages USING btree (item_id, seq) WHERE (item_id IS NOT NULL);


--
-- Name: stages_project_id_seq_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX stages_project_id_seq_idx ON public.stages USING btree (project_id, seq) WHERE (item_id IS NULL);


--
-- Name: stages_station_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stages_station_status_idx ON public.stages USING btree (station, status);


--
-- Name: stages_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stages_status_idx ON public.stages USING btree (status);


--
-- Name: v_item_progress _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.v_item_progress AS
 SELECT i.id AS item_id,
    i.project_id,
    i.name,
    (count(*) FILTER (WHERE (s.status = 'done'::public.stage_status)))::integer AS done_stages,
    (count(*))::integer AS total_stages,
    round(((100.0 * (count(*) FILTER (WHERE (s.status = 'done'::public.stage_status)))::numeric) / (NULLIF(count(*), 0))::numeric)) AS pct
   FROM (public.items i
     JOIN public.stages s ON ((s.item_id = i.id)))
  GROUP BY i.id;


--
-- Name: v_project_progress _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.v_project_progress AS
 SELECT p.id AS project_id,
    p.code,
    (count(*) FILTER (WHERE (s.status = 'done'::public.stage_status)))::integer AS done_stages,
    (count(*))::integer AS total_stages,
    (count(*) FILTER (WHERE (s.status = 'stop'::public.stage_status)))::integer AS blocked_stages,
    round(((100.0 * (count(*) FILTER (WHERE (s.status = 'done'::public.stage_status)))::numeric) / (NULLIF(count(*), 0))::numeric)) AS pct
   FROM (public.projects p
     JOIN public.stages s ON ((s.project_id = p.id)))
  GROUP BY p.id;


--
-- Name: extras extras_auto_close; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER extras_auto_close AFTER UPDATE OF status ON public.extras FOR EACH ROW EXECUTE FUNCTION public.auto_close_delivered_project();


--
-- Name: stages trg_guard_gates; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_gates BEFORE UPDATE ON public.stages FOR EACH ROW EXECUTE FUNCTION public.guard_gates();


--
-- Name: items trg_seed_item_stages; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_seed_item_stages AFTER INSERT ON public.items FOR EACH ROW EXECUTE FUNCTION public.seed_item_stages();


--
-- Name: projects trg_seed_project_stages; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_seed_project_stages AFTER INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION public.seed_project_stages();


--
-- Name: activity_log activity_log_actor_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_actor_fkey FOREIGN KEY (actor) REFERENCES public.profiles(id);


--
-- Name: app_sessions app_sessions_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_sessions
    ADD CONSTRAINT app_sessions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: blocks blocks_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: blocks blocks_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: blocks blocks_reported_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES public.profiles(id);


--
-- Name: blocks blocks_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.profiles(id);


--
-- Name: blocks blocks_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.stages(id) ON DELETE CASCADE;


--
-- Name: customers customers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: extra_photos extra_photos_extra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extra_photos
    ADD CONSTRAINT extra_photos_extra_id_fkey FOREIGN KEY (extra_id) REFERENCES public.extras(id) ON DELETE CASCADE;


--
-- Name: extra_photos extra_photos_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extra_photos
    ADD CONSTRAINT extra_photos_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: extra_photos extra_photos_taken_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extra_photos
    ADD CONSTRAINT extra_photos_taken_by_fkey FOREIGN KEY (taken_by) REFERENCES public.profiles(id);


--
-- Name: extras extras_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extras
    ADD CONSTRAINT extras_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id);


--
-- Name: extras extras_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extras
    ADD CONSTRAINT extras_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE SET NULL;


--
-- Name: extras extras_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extras
    ADD CONSTRAINT extras_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: extras extras_reported_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extras
    ADD CONSTRAINT extras_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES public.profiles(id);


--
-- Name: installation_crew installation_crew_installation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installation_crew
    ADD CONSTRAINT installation_crew_installation_id_fkey FOREIGN KEY (installation_id) REFERENCES public.installations(id) ON DELETE CASCADE;


--
-- Name: installation_crew installation_crew_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installation_crew
    ADD CONSTRAINT installation_crew_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: installation_items installation_items_installation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installation_items
    ADD CONSTRAINT installation_items_installation_id_fkey FOREIGN KEY (installation_id) REFERENCES public.installations(id) ON DELETE CASCADE;


--
-- Name: installation_items installation_items_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installation_items
    ADD CONSTRAINT installation_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: installations installations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installations
    ADD CONSTRAINT installations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: installations installations_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installations
    ADD CONSTRAINT installations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: item_photos item_photos_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_photos
    ADD CONSTRAINT item_photos_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: item_photos item_photos_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_photos
    ADD CONSTRAINT item_photos_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: item_photos item_photos_taken_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_photos
    ADD CONSTRAINT item_photos_taken_by_fkey FOREIGN KEY (taken_by) REFERENCES public.profiles(id);


--
-- Name: items items_gate_release_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_gate_release_by_fkey FOREIGN KEY (gate_release_by) REFERENCES public.profiles(id);


--
-- Name: items items_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: lead_events lead_events_actor_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_events
    ADD CONSTRAINT lead_events_actor_fkey FOREIGN KEY (actor) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: lead_events lead_events_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_events
    ADD CONSTRAINT lead_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_files lead_files_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_files
    ADD CONSTRAINT lead_files_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_files lead_files_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_files
    ADD CONSTRAINT lead_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: leads leads_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: leads leads_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: leads leads_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: media_files media_files_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_files
    ADD CONSTRAINT media_files_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.media_folders(id) ON DELETE SET NULL;


--
-- Name: media_files media_files_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_files
    ADD CONSTRAINT media_files_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE SET NULL;


--
-- Name: media_files media_files_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_files
    ADD CONSTRAINT media_files_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: media_files media_files_revision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_files
    ADD CONSTRAINT media_files_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES public.project_revisions(id) ON DELETE SET NULL;


--
-- Name: media_files media_files_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_files
    ADD CONSTRAINT media_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id);


--
-- Name: media_folders media_folders_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_folders
    ADD CONSTRAINT media_folders_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: project_revisions project_revisions_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_revisions
    ADD CONSTRAINT project_revisions_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);


--
-- Name: project_revisions project_revisions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_revisions
    ADD CONSTRAINT project_revisions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: projects projects_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);


--
-- Name: projects projects_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.profiles(id);


--
-- Name: projects projects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: projects projects_delivered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_delivered_by_fkey FOREIGN KEY (delivered_by) REFERENCES public.profiles(id);


--
-- Name: projects projects_gate_plans_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_gate_plans_by_fkey FOREIGN KEY (gate_plans_by) REFERENCES public.profiles(id);


--
-- Name: stage_crew stage_crew_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_crew
    ADD CONSTRAINT stage_crew_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.profiles(id);


--
-- Name: stage_crew stage_crew_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_crew
    ADD CONSTRAINT stage_crew_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: stage_crew stage_crew_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_crew
    ADD CONSTRAINT stage_crew_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.stages(id) ON DELETE CASCADE;


--
-- Name: stage_defaults stage_defaults_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_defaults
    ADD CONSTRAINT stage_defaults_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: stage_events stage_events_actor_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_events
    ADD CONSTRAINT stage_events_actor_fkey FOREIGN KEY (actor) REFERENCES public.profiles(id);


--
-- Name: stage_events stage_events_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_events
    ADD CONSTRAINT stage_events_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: stage_events stage_events_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_events
    ADD CONSTRAINT stage_events_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: stage_events stage_events_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_events
    ADD CONSTRAINT stage_events_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.stages(id) ON DELETE CASCADE;


--
-- Name: stages stages_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stages
    ADD CONSTRAINT stages_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: stages stages_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stages
    ADD CONSTRAINT stages_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.profiles(id);


--
-- Name: stages stages_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stages
    ADD CONSTRAINT stages_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: Box woodwork; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Box woodwork" ENABLE ROW LEVEL SECURITY;

--
-- Name: Box-woodwork; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Box-woodwork" ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

--
-- Name: extra_photos add extra photo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "add extra photo" ON public.extra_photos FOR INSERT WITH CHECK ((taken_by = auth.uid()));


--
-- Name: item_photos add photo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "add photo" ON public.item_photos FOR INSERT WITH CHECK ((taken_by = auth.uid()));


--
-- Name: stage_crew admin crew; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin crew" ON public.stage_crew USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: stage_defaults admin defaults; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin defaults" ON public.stage_defaults USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: extra_photos admin extra photo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin extra photo" ON public.extra_photos USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: extras admin extras; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin extras" ON public.extras USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: media_folders admin folders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin folders" ON public.media_folders USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: installation_crew admin install crew; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin install crew" ON public.installation_crew USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: installation_items admin install items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin install items" ON public.installation_items USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: installations admin installs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin installs" ON public.installations USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: items admin items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin items" ON public.items USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: media_files admin media; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin media" ON public.media_files USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: item_photos admin photos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin photos" ON public.item_photos USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: projects admin projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin projects" ON public.projects USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: project_revisions admin revisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin revisions" ON public.project_revisions USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: stages admin stages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin stages" ON public.stages USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: profiles admin writes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin writes" ON public.profiles USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: app_sessions admins read sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins read sessions" ON public.app_sessions FOR SELECT USING (public.is_admin());


--
-- Name: app_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: extras assignee extra; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "assignee extra" ON public.extras FOR UPDATE USING ((assigned_to = auth.uid())) WITH CHECK ((assigned_to = auth.uid()));


--
-- Name: blocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: blocks close block; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "close block" ON public.blocks FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: stages crew stages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crew stages" ON public.stages FOR UPDATE USING (public.on_stage(id)) WITH CHECK (public.on_stage(id));


--
-- Name: customers crm_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_admin_all ON public.customers TO authenticated USING (public.crm_is_admin()) WITH CHECK (public.crm_is_admin());


--
-- Name: lead_events crm_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_admin_all ON public.lead_events TO authenticated USING (public.crm_is_admin()) WITH CHECK (public.crm_is_admin());


--
-- Name: lead_files crm_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_admin_all ON public.lead_files TO authenticated USING (public.crm_is_admin()) WITH CHECK (public.crm_is_admin());


--
-- Name: leads crm_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_admin_all ON public.leads TO authenticated USING (public.crm_is_admin()) WITH CHECK (public.crm_is_admin());


--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: extra_photos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extra_photos ENABLE ROW LEVEL SECURITY;

--
-- Name: extra_photos extra_photos_general_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY extra_photos_general_read ON public.extra_photos FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.extras e
  WHERE ((e.id = extra_photos.extra_id) AND (e.assigned_to IS NULL)))));


--
-- Name: extras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extras ENABLE ROW LEVEL SECURITY;

--
-- Name: extras extras_general_claim; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY extras_general_claim ON public.extras FOR UPDATE TO authenticated USING ((assigned_to IS NULL)) WITH CHECK ((assigned_to = auth.uid()));


--
-- Name: extras extras_general_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY extras_general_read ON public.extras FOR SELECT TO authenticated USING ((assigned_to IS NULL));


--
-- Name: extras extras_own_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY extras_own_read ON public.extras FOR SELECT TO authenticated USING ((assigned_to = auth.uid()));


--
-- Name: extras extras_own_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY extras_own_update ON public.extras FOR UPDATE TO authenticated USING ((assigned_to = auth.uid())) WITH CHECK ((assigned_to = auth.uid()));


--
-- Name: stage_events insert events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insert events" ON public.stage_events FOR INSERT WITH CHECK ((actor = auth.uid()));


--
-- Name: installation_crew; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.installation_crew ENABLE ROW LEVEL SECURITY;

--
-- Name: installation_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.installation_items ENABLE ROW LEVEL SECURITY;

--
-- Name: installations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.installations ENABLE ROW LEVEL SECURITY;

--
-- Name: item_photos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.item_photos ENABLE ROW LEVEL SECURITY;

--
-- Name: items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_files ENABLE ROW LEVEL SECURITY;

--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

--
-- Name: media_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_files ENABLE ROW LEVEL SECURITY;

--
-- Name: media_folders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_folders ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: project_revisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_revisions ENABLE ROW LEVEL SECURITY;

--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: blocks read blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read blocks" ON public.blocks FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: stage_crew read crew; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read crew" ON public.stage_crew FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: stage_defaults read defaults; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read defaults" ON public.stage_defaults FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: stage_events read events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read events" ON public.stage_events FOR SELECT USING ((public.is_admin() OR (actor = auth.uid())));


--
-- Name: extra_photos read extra photos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read extra photos" ON public.extra_photos FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: extras read extras; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read extras" ON public.extras FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: media_folders read folders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read folders" ON public.media_folders FOR SELECT USING (public.project_visible(project_id));


--
-- Name: installation_crew read install crew; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read install crew" ON public.installation_crew FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: installation_items read install items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read install items" ON public.installation_items FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: installations read installs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read installs" ON public.installations FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: items read items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read items" ON public.items FOR SELECT USING (public.project_visible(project_id));


--
-- Name: activity_log read log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read log" ON public.activity_log FOR SELECT USING (public.is_admin());


--
-- Name: media_files read media; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read media" ON public.media_files FOR SELECT USING (public.project_visible(project_id));


--
-- Name: item_photos read photos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read photos" ON public.item_photos FOR SELECT USING (public.project_visible(project_id));


--
-- Name: projects read projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read projects" ON public.projects FOR SELECT USING (public.project_visible(id));


--
-- Name: project_revisions read revisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read revisions" ON public.project_revisions FOR SELECT USING (public.project_visible(project_id));


--
-- Name: stages read stages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read stages" ON public.stages FOR SELECT USING (public.project_visible(project_id));


--
-- Name: profiles read team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read team" ON public.profiles FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: blocks report block; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "report block" ON public.blocks FOR INSERT WITH CHECK ((reported_by = auth.uid()));


--
-- Name: extras report extra; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "report extra" ON public.extras FOR INSERT WITH CHECK ((reported_by = auth.uid()));


--
-- Name: app_sessions session self insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "session self insert" ON public.app_sessions FOR INSERT WITH CHECK ((profile_id = auth.uid()));


--
-- Name: app_sessions session self update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "session self update" ON public.app_sessions FOR UPDATE USING ((profile_id = auth.uid())) WITH CHECK ((profile_id = auth.uid()));


--
-- Name: stage_crew; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stage_crew ENABLE ROW LEVEL SECURITY;

--
-- Name: stage_defaults; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stage_defaults ENABLE ROW LEVEL SECURITY;

--
-- Name: stage_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stage_events ENABLE ROW LEVEL SECURITY;

--
-- Name: stages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_log write log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "write log" ON public.activity_log FOR INSERT WITH CHECK ((actor = auth.uid()));


--
-- PostgreSQL database dump complete
--

\unrestrict gZ3Zudv465eImCGfi7BO6WCWXiT6Gf3d3gG49peoXrygW1g5DlsM0ue12zcGizs

