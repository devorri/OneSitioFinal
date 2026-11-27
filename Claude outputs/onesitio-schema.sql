-- =====================================================================
-- OneSitio • Sangguniang Barangay ng Talampas, Bustos, Bulacan
-- Supabase / PostgreSQL schema
--
-- How to use:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file and click Run (safe to re-run)
--   3. Sign up one account in the app, then promote it to staff:
--        update public.profiles set role = 'admin', verification_status = 'verified'
--        where email = 'you@example.com';
--   4. (Recommended for demos) Authentication → Providers → Email →
--      turn OFF "Confirm email" so new residents can upload their ID right away.
--   5. Google / Facebook sign-in: Authentication → Providers → enable Google and
--      Facebook (client ID + secret), and add http://localhost:5173/auth/callback
--      (plus your deployed URL) under Authentication → URL Configuration → Redirect URLs.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('resident', 'secretary', 'treasurer', 'captain', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.verification_status as enum ('unverified', 'pending', 'verified', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.request_status as enum ('pending', 'under_review', 'approved', 'ready', 'released', 'rejected', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum ('unpaid', 'paid', 'waived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_method as enum ('gcash', 'maya', 'qrph', 'card', 'cash');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.project_status as enum ('proposed', 'ongoing', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ledger_type as enum ('allocation', 'collection', 'disbursement', 'project_update', 'adjustment');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.fund_type as enum ('general', 'development', 'digital_revenue');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- PROFILES (1:1 with auth.users)
-- ---------------------------------------------------------------------
create sequence if not exists public.resident_code_seq;

create table if not exists public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  resident_code        text unique,
  email                text,
  first_name           text not null default '',
  middle_name          text,
  last_name            text not null default '',
  suffix               text,
  birth_date           date,
  civil_status         text,
  mobile               text,
  purok                text,
  street_address       text,
  is_household_head    boolean not null default false,
  role                 public.user_role not null default 'resident',
  verification_status  public.verification_status not null default 'unverified',
  id_type              text,
  id_number            text,
  id_image_path        text,
  selfie_path          text,
  ocr_text             text,
  verification_note    text,
  verified_at          timestamptz,
  verified_by          uuid references public.profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- profile photo (added later — safe on existing databases)
alter table public.profiles add column if not exists avatar_url text;

-- helper: is the current user barangay staff?
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role <> 'resident');
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'captain'));
$$;

-- resident code: RES-TAL-2026-0001
create or replace function public.set_resident_code()
returns trigger language plpgsql as $$
begin
  if new.resident_code is null then
    new.resident_code := 'RES-TAL-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.resident_code_seq')::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_code on public.profiles;
create trigger trg_profiles_code before insert on public.profiles
  for each row execute function public.set_resident_code();

-- residents cannot change their own role / verification decision
create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.resident_code := old.resident_code;

  -- SQL editor / service role: allow everything
  if auth.uid() is null then
    return new;
  end if;

  if not public.is_staff() then
    new.role := old.role;
    new.verified_at := old.verified_at;
    new.verified_by := old.verified_by;
    new.verification_note := old.verification_note;
    -- a resident may only submit for review (unverified/rejected -> pending)
    if not (new.verification_status = 'pending' and old.verification_status in ('unverified', 'rejected')) then
      new.verification_status := old.verification_status;
    end if;
  else
    if new.role is distinct from old.role and not public.is_admin() then
      new.role := old.role;
    end if;
    if new.verification_status is distinct from old.verification_status
       and new.verification_status in ('verified', 'rejected') then
      new.verified_at := now();
      new.verified_by := auth.uid();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_protect on public.profiles;
create trigger trg_profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- create profile automatically on sign up (data comes from signUp options.data)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_full text := coalesce(m ->> 'full_name', m ->> 'name', '');
begin
  -- Google / Facebook sign-in only give a display name: split it into first/last
  if coalesce(m ->> 'first_name', '') = '' and v_full <> '' then
    m := m || jsonb_build_object(
      'first_name', coalesce(m ->> 'given_name', regexp_replace(v_full, '\s+\S+$', '')),
      'last_name',  coalesce(m ->> 'family_name', case when v_full ~ '\s' then regexp_replace(v_full, '^.*\s', '') else '' end)
    );
  end if;

  insert into public.profiles (
    id, email, first_name, middle_name, last_name, suffix, birth_date, civil_status,
    mobile, purok, street_address, is_household_head, id_type, id_number, ocr_text, avatar_url
  ) values (
    new.id,
    new.email,
    coalesce(m ->> 'first_name', ''),
    nullif(m ->> 'middle_name', ''),
    coalesce(m ->> 'last_name', ''),
    nullif(m ->> 'suffix', ''),
    nullif(m ->> 'birth_date', '')::date,
    nullif(m ->> 'civil_status', ''),
    nullif(m ->> 'mobile', ''),
    nullif(m ->> 'purok', ''),
    nullif(m ->> 'street_address', ''),
    coalesce((m ->> 'is_household_head')::boolean, false),
    nullif(m ->> 'id_type', ''),
    nullif(m ->> 'id_number', ''),
    nullif(m ->> 'ocr_text', ''),
    nullif(coalesce(m ->> 'avatar_url', m ->> 'picture'), '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- HOUSEHOLD MEMBERS (dependents a head of household can request for)
-- ---------------------------------------------------------------------
create table if not exists public.household_members (
  id            uuid primary key default gen_random_uuid(),
  head_id       uuid not null references public.profiles (id) on delete cascade,
  full_name     text not null,
  relationship  text not null,
  birth_date    date,
  created_at    timestamptz not null default now()
);
create index if not exists household_members_head_idx on public.household_members (head_id);

-- ---------------------------------------------------------------------
-- DOCUMENT TYPES (catalog)
-- ---------------------------------------------------------------------
create table if not exists public.document_types (
  code             text primary key,
  name             text not null,
  description      text,
  fee              numeric(10, 2) not null default 0,
  processing_time  text,
  requirements     text[] not null default '{}',
  active           boolean not null default true,
  sort_order       int not null default 0
);

insert into public.document_types (code, name, description, fee, processing_time, requirements, sort_order) values
  ('clearance', 'Barangay Clearance',
   'Para sa lokal na trabaho, postal ID, bank account, at NBI / Police clearance.',
   50, '1–2 business days', array['Valid government ID', 'Talampas residency record'], 1),
  ('indigency', 'Certificate of Indigency',
   'Para sa tulong medikal, scholarship, educational assistance, at PAO legal aid.',
   0, 'Same day – 24 hours', array['Endorsement ng Purok Leader'], 2),
  ('residency', 'Certificate of Residency',
   'Katunayan ng tirahan para sa Meralco, water district, enrollment, o affidavits.',
   50, '24 hours', array['Talaan sa Household Masterlist'], 3),
  ('business', 'Barangay Business Clearance',
   'Para sa sari-sari store, negosyo, at Mayor''s Permit renewal sa Bustos.',
   150, '2–3 business days', array['DTI / SEC registration', 'Kontrata ng upa o katibayan ng puwesto'], 4)
on conflict (code) do update set
  name = excluded.name, description = excluded.description, fee = excluded.fee,
  processing_time = excluded.processing_time, requirements = excluded.requirements, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------
-- DOCUMENT REQUESTS
-- ---------------------------------------------------------------------
create sequence if not exists public.request_code_seq start 1001;

create table if not exists public.document_requests (
  id                   uuid primary key default gen_random_uuid(),
  reference_code       text not null unique default ('REQ-' || lpad(nextval('public.request_code_seq')::text, 4, '0')),
  requester_id         uuid not null references public.profiles (id) on delete cascade,
  household_member_id  uuid references public.household_members (id) on delete set null,
  beneficiary_name     text not null,
  document_type        text not null references public.document_types (code),
  purpose              text not null,
  fee                  numeric(10, 2) not null default 0,
  status               public.request_status not null default 'pending',
  payment_status       public.payment_status not null default 'unpaid',
  staff_note           text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  released_at          timestamptz
);
create index if not exists document_requests_requester_idx on public.document_requests (requester_id);
create index if not exists document_requests_status_idx on public.document_requests (status);

create table if not exists public.request_events (
  id          bigserial primary key,
  request_id  uuid not null references public.document_requests (id) on delete cascade,
  status      public.request_status not null,
  note        text,
  actor_id    uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);
create index if not exists request_events_request_idx on public.request_events (request_id);

-- new request: fee from catalog, must be a verified resident, beneficiary must be self or own household member
create or replace function public.before_request_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_fee numeric;
  v_profile public.profiles;
begin
  select fee into v_fee from public.document_types where code = new.document_type and active;
  if v_fee is null then
    raise exception 'Unknown or inactive document type';
  end if;

  select * into v_profile from public.profiles where id = new.requester_id;
  if v_profile.verification_status <> 'verified' and not public.is_staff() then
    raise exception 'Your account must be verified by the Barangay Secretary before requesting documents.';
  end if;

  if new.household_member_id is not null then
    if not exists (select 1 from public.household_members
                   where id = new.household_member_id and head_id = new.requester_id) then
      raise exception 'Household member not found';
    end if;
    select full_name into new.beneficiary_name from public.household_members where id = new.household_member_id;
  else
    new.beneficiary_name := trim(concat_ws(' ', v_profile.first_name, v_profile.middle_name, v_profile.last_name, v_profile.suffix));
  end if;

  new.fee := v_fee;
  new.status := 'pending';
  new.payment_status := case when v_fee = 0 then 'waived'::public.payment_status else 'unpaid'::public.payment_status end;
  new.staff_note := null;
  new.created_at := now();
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_requests_before_insert on public.document_requests;
create trigger trg_requests_before_insert before insert on public.document_requests
  for each row execute function public.before_request_insert();

-- workflow rules on update (staff only — residents use the RPCs below)
create or replace function public.before_request_update()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.reference_code := old.reference_code;
  new.requester_id := old.requester_id;
  new.fee := old.fee;

  if new.status = 'ready' and new.payment_status not in ('paid', 'waived') then
    raise exception 'Request must be paid before it can be marked ready for release.';
  end if;
  if new.status = 'released' and old.status <> 'released' then
    if new.payment_status not in ('paid', 'waived') then
      raise exception 'Request must be paid before release.';
    end if;
    new.released_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_requests_before_update on public.document_requests;
create trigger trg_requests_before_update before update on public.document_requests
  for each row execute function public.before_request_update();

-- timeline log
create or replace function public.log_request_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.request_events (request_id, status, note, actor_id)
    values (new.id, new.status, 'Request submitted', auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.request_events (request_id, status, note, actor_id)
    values (new.id, new.status, new.staff_note, auth.uid());
  end if;
  return null;
end $$;

drop trigger if exists trg_requests_log on public.document_requests;
create trigger trg_requests_log after insert or update on public.document_requests
  for each row execute function public.log_request_event();

-- ---------------------------------------------------------------------
-- PAYMENTS (simulated e-wallet + cash)
-- ---------------------------------------------------------------------
create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null unique references public.document_requests (id) on delete cascade,
  payer_id      uuid not null references public.profiles (id),
  amount        numeric(10, 2) not null,
  method        public.payment_method not null,
  reference_no  text not null unique,
  recorded_by   uuid references public.profiles (id),
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- PROJECTS
-- ---------------------------------------------------------------------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  location    text,
  description text,
  budget      numeric(14, 2) not null default 0,
  contractor  text,
  status      public.project_status not null default 'proposed',
  progress    int not null default 0 check (progress between 0 and 100),
  image_url   text,
  start_date  date,
  end_date    date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- TRANSPARENCY LEDGER (append-only SHA-256 hash chain)
--   hash = sha256(payload), payload contains prev_hash → any edit breaks the chain.
--   Anyone can re-check it: sha256(payload) must equal hash, and
--   prev_hash must equal the previous block's hash.
-- ---------------------------------------------------------------------
create table if not exists public.ledger_blocks (
  block_number  bigint primary key,
  prev_hash     text not null,
  hash          text not null unique,
  payload       text not null,
  entry_type    public.ledger_type not null,
  fund          public.fund_type not null,
  title         text not null,
  description   text,
  amount        numeric(14, 2) not null default 0,   -- + money in / allocated, - money out
  reference     text,
  project_id    uuid references public.projects (id) on delete set null,
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now()
);

create or replace function public.ledger_chain()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_prev public.ledger_blocks;
begin
  perform pg_advisory_xact_lock(424242);
  select * into v_prev from public.ledger_blocks order by block_number desc limit 1;

  new.block_number := coalesce(v_prev.block_number, 0) + 1;
  new.prev_hash := coalesce(v_prev.hash, repeat('0', 64));
  new.created_at := date_trunc('milliseconds', now());
  new.created_by := coalesce(new.created_by, auth.uid());
  new.amount := round(coalesce(new.amount, 0), 2);
  new.payload := concat_ws('|',
    new.block_number::text,
    new.prev_hash,
    new.entry_type::text,
    new.fund::text,
    new.title,
    coalesce(new.description, ''),
    to_char(new.amount, 'FM999999999990.00'),
    coalesce(new.reference, ''),
    coalesce(new.project_id::text, ''),
    to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  new.hash := encode(digest(new.payload, 'sha256'), 'hex');
  return new;
end $$;

drop trigger if exists trg_ledger_chain on public.ledger_blocks;
create trigger trg_ledger_chain before insert on public.ledger_blocks
  for each row execute function public.ledger_chain();

create or replace function public.ledger_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Ledger blocks are append-only and cannot be changed or deleted.';
end $$;

drop trigger if exists trg_ledger_immutable on public.ledger_blocks;
create trigger trg_ledger_immutable before update or delete on public.ledger_blocks
  for each row execute function public.ledger_immutable();

-- server-side verification (also done in the browser)
create or replace function public.verify_ledger()
returns table (block_number bigint, hash_ok boolean, link_ok boolean)
language sql stable security definer set search_path = public, extensions as $$
  select b.block_number,
         encode(digest(b.payload, 'sha256'), 'hex') = b.hash as hash_ok,
         b.prev_hash = coalesce(lag(b.hash) over (order by b.block_number), repeat('0', 64)) as link_ok
  from public.ledger_blocks b
  order by b.block_number;
$$;

-- fund totals for the public dashboard
create or replace view public.fund_summary with (security_invoker = true) as
select fund,
       coalesce(sum(amount) filter (where entry_type = 'allocation'), 0)   as allocated,
       coalesce(sum(amount) filter (where entry_type = 'collection'), 0)   as collected,
       coalesce(-sum(amount) filter (where entry_type = 'disbursement'), 0) as disbursed,
       coalesce(sum(amount), 0)                                             as balance,
       count(*)                                                             as entries
from public.ledger_blocks
group by fund;

-- project changes are written to the ledger automatically
create or replace function public.log_project_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if new.status is distinct from old.status or new.progress is distinct from old.progress then
      insert into public.ledger_blocks (entry_type, fund, title, description, amount, project_id)
      values ('project_update', 'development', 'Project update: ' || new.title,
              'Status: ' || new.status::text || ' • Progress: ' || new.progress || '%', 0, new.id);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_projects_log on public.projects;
create trigger trg_projects_log before update on public.projects
  for each row execute function public.log_project_change();

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------

-- public request tracker (no login needed, beneficiary name masked)
create or replace function public.track_request(p_code text)
returns table (
  reference_code text, document_name text, beneficiary text,
  status public.request_status, payment_status public.payment_status,
  created_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.reference_code,
         d.name,
         split_part(r.beneficiary_name, ' ', 1) || ' ' ||
           left(regexp_replace(r.beneficiary_name, '^.*\s', ''), 1) || '.',
         r.status, r.payment_status, r.created_at, r.updated_at
  from public.document_requests r
  join public.document_types d on d.code = r.document_type
  where upper(r.reference_code) = upper(trim(p_code));
$$;

-- resident cancels own pending request
create or replace function public.cancel_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.document_requests
     set status = 'cancelled', staff_note = 'Cancelled by requester'
   where id = p_request_id and requester_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'Only your own pending requests can be cancelled.';
  end if;
end $$;

-- resident pays an approved request (SIMULATED e-wallet — no real money)
create or replace function public.pay_request(p_request_id uuid, p_method public.payment_method)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  r public.document_requests;
  v_ref text;
begin
  if p_method = 'cash' then
    raise exception 'Cash payments are recorded by the treasurer.';
  end if;

  select * into r from public.document_requests where id = p_request_id for update;
  if r.id is null or r.requester_id <> auth.uid() then
    raise exception 'Request not found.';
  end if;
  if r.status <> 'approved' or r.payment_status <> 'unpaid' then
    raise exception 'This request is not waiting for payment.';
  end if;

  v_ref := upper(p_method::text) || '-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));

  insert into public.payments (request_id, payer_id, amount, method, reference_no)
  values (r.id, r.requester_id, r.fee, p_method, v_ref);

  update public.document_requests set payment_status = 'paid' where id = r.id;

  insert into public.request_events (request_id, status, note, actor_id)
  values (r.id, r.status, 'Paid ₱' || to_char(r.fee, 'FM999990.00') || ' via ' || upper(p_method::text) || ' • Ref ' || v_ref, auth.uid());

  insert into public.ledger_blocks (entry_type, fund, title, description, amount, reference)
  values ('collection', 'digital_revenue', 'Document fee: ' || r.reference_code,
          'Paid via ' || upper(p_method::text), r.fee, v_ref);
  return v_ref;
end $$;

-- staff records a cash payment at the barangay hall
create or replace function public.record_cash_payment(p_request_id uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  r public.document_requests;
  v_ref text;
begin
  if not public.is_staff() then
    raise exception 'Staff only.';
  end if;

  select * into r from public.document_requests where id = p_request_id for update;
  if r.id is null then raise exception 'Request not found.'; end if;
  if r.payment_status <> 'unpaid' then raise exception 'Request is already paid.'; end if;

  v_ref := 'CASH-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));

  insert into public.payments (request_id, payer_id, amount, method, reference_no, recorded_by)
  values (r.id, r.requester_id, r.fee, 'cash', v_ref, auth.uid());

  update public.document_requests set payment_status = 'paid' where id = r.id;

  insert into public.request_events (request_id, status, note, actor_id)
  values (r.id, r.status, 'Cash payment ₱' || to_char(r.fee, 'FM999990.00') || ' recorded • Ref ' || v_ref, auth.uid());

  insert into public.ledger_blocks (entry_type, fund, title, description, amount, reference)
  values ('collection', 'general', 'Document fee: ' || r.reference_code, 'Cash at Barangay Hall', r.fee, v_ref);
  return v_ref;
end $$;

grant execute on function public.track_request(text) to anon, authenticated;
grant execute on function public.verify_ledger() to anon, authenticated;
grant execute on function public.cancel_request(uuid) to authenticated;
grant execute on function public.pay_request(uuid, public.payment_method) to authenticated;
grant execute on function public.record_cash_payment(uuid) to authenticated;
grant select on public.fund_summary to anon, authenticated;

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.household_members enable row level security;
alter table public.document_types    enable row level security;
alter table public.document_requests enable row level security;
alter table public.request_events    enable row level security;
alter table public.payments          enable row level security;
alter table public.projects          enable row level security;
alter table public.ledger_blocks     enable row level security;

-- profiles
drop policy if exists "profiles: read own or staff" on public.profiles;
create policy "profiles: read own or staff" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_staff());

drop policy if exists "profiles: update own or staff" on public.profiles;
create policy "profiles: update own or staff" on public.profiles
  for update to authenticated using (id = auth.uid() or public.is_staff())
  with check (id = auth.uid() or public.is_staff());

-- household
drop policy if exists "household: head manages" on public.household_members;
create policy "household: head manages" on public.household_members
  for all to authenticated using (head_id = auth.uid()) with check (head_id = auth.uid());

drop policy if exists "household: staff reads" on public.household_members;
create policy "household: staff reads" on public.household_members
  for select to authenticated using (public.is_staff());

-- document types
drop policy if exists "doc types: public read" on public.document_types;
create policy "doc types: public read" on public.document_types
  for select to anon, authenticated using (true);

drop policy if exists "doc types: staff manage" on public.document_types;
create policy "doc types: staff manage" on public.document_types
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- requests
drop policy if exists "requests: read own or staff" on public.document_requests;
create policy "requests: read own or staff" on public.document_requests
  for select to authenticated using (requester_id = auth.uid() or public.is_staff());

drop policy if exists "requests: create own" on public.document_requests;
create policy "requests: create own" on public.document_requests
  for insert to authenticated with check (requester_id = auth.uid());

drop policy if exists "requests: staff update" on public.document_requests;
create policy "requests: staff update" on public.document_requests
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- request events
drop policy if exists "events: read own or staff" on public.request_events;
create policy "events: read own or staff" on public.request_events
  for select to authenticated using (
    public.is_staff() or exists (
      select 1 from public.document_requests r where r.id = request_id and r.requester_id = auth.uid()
    )
  );

-- payments
drop policy if exists "payments: read own or staff" on public.payments;
create policy "payments: read own or staff" on public.payments
  for select to authenticated using (payer_id = auth.uid() or public.is_staff());

-- projects
drop policy if exists "projects: public read" on public.projects;
create policy "projects: public read" on public.projects
  for select to anon, authenticated using (true);

drop policy if exists "projects: staff manage" on public.projects;
create policy "projects: staff manage" on public.projects
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ledger (public read, staff append; never update/delete)
drop policy if exists "ledger: public read" on public.ledger_blocks;
create policy "ledger: public read" on public.ledger_blocks
  for select to anon, authenticated using (true);

drop policy if exists "ledger: staff append" on public.ledger_blocks;
create policy "ledger: staff append" on public.ledger_blocks
  for insert to authenticated with check (public.is_staff());

-- ---------------------------------------------------------------------
-- STORAGE
--   resident-docs  (private): <user id>/id.<ext>, <user id>/selfie.jpg
--   project-images (public)
--   avatars        (public):  <user id>/avatar-<timestamp>.jpg
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('resident-docs', 'resident-docs', false)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('project-images', 'project-images', true)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "resident-docs: upload own" on storage.objects;
create policy "resident-docs: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'resident-docs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "resident-docs: update own" on storage.objects;
create policy "resident-docs: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'resident-docs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "resident-docs: read own or staff" on storage.objects;
create policy "resident-docs: read own or staff" on storage.objects
  for select to authenticated
  using (bucket_id = 'resident-docs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));

drop policy if exists "avatars: upload own" on storage.objects;
create policy "avatars: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: update own" on storage.objects;
create policy "avatars: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: delete own" on storage.objects;
create policy "avatars: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "project-images: staff write" on storage.objects;
create policy "project-images: staff write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'project-images' and public.is_staff());

-- ---------------------------------------------------------------------
-- SEED DATA (only when empty)
-- ---------------------------------------------------------------------
do $$
declare
  p_flood uuid; p_solar uuid; p_health uuid;
begin
  if not exists (select 1 from public.projects) then
    insert into public.projects (title, location, description, budget, contractor, status, progress, image_url, start_date)
    values ('Flood Mitigation Barrier & Drainage Rehabilitation', 'Purok 4, Talampas',
            'Paglalagay ng flood barriers at pagsasaayos ng daluyan ng tubig upang maiwasan ang pagbaha sa mga kabahayan at sakahan.',
            450000, 'Bustos Infra Developers Corp', 'ongoing', 65, '/images/project_flood_control.png', '2026-08-01')
    returning id into p_flood;

    insert into public.projects (title, location, description, budget, contractor, status, progress, image_url, start_date, end_date)
    values ('Solar Streetlighting Program • Phase 2', 'Talampas – Bustos Dam Road',
            'Paglalagay ng 42 solar LED streetlight posts para sa mas ligtas na daan sa gabi.',
            280000, 'Bulacan Solar Solutions Inc', 'completed', 100, '/images/project_solar_lights.jpg', '2026-05-01', '2026-10-15')
    returning id into p_solar;

    insert into public.projects (title, location, description, budget, contractor, status, progress, image_url, start_date)
    values ('Health Center & Birthing Station Upgrade', 'Barangay Hall Complex, Talampas',
            'Pagpapalawak ng consultation rooms at modernong vaccine storage para sa mga buntis at sanggol.',
            320000, null, 'proposed', 0, '/images/project_health_center.png', '2026-12-01')
    returning id into p_health;
  end if;

  if not exists (select 1 from public.ledger_blocks) then
    insert into public.ledger_blocks (entry_type, fund, title, description, amount, reference)
    values ('allocation', 'general', 'Annual General Fund 2026', 'Approved barangay budget', 14520000, 'ORD-2026-01');
    insert into public.ledger_blocks (entry_type, fund, title, description, amount, reference)
    values ('allocation', 'development', '20% Development Fund 2026', 'From IRA / NTA share', 2904000, 'ORD-2026-02');
    insert into public.ledger_blocks (entry_type, fund, title, description, amount, project_id)
    select 'disbursement', 'development', 'Solar Streetlighting Phase 2 — full payment', 'Bulacan Solar Solutions Inc', -280000, id
      from public.projects where title like 'Solar Streetlighting%' limit 1;
    insert into public.ledger_blocks (entry_type, fund, title, description, amount, project_id)
    select 'disbursement', 'development', 'Flood Mitigation — progress billing 1', 'Bustos Infra Developers Corp', -225000, id
      from public.projects where title like 'Flood Mitigation%' limit 1;
  end if;
end $$;
