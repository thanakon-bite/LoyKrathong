-- =====================================================================
-- ลอยกระทงออนไลน์ – Floating Wish Lantern Festival
-- Initial schema: tables, constraints, indexes, RLS, triggers,
-- realtime broadcast, storage bucket, RPC functions
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Settings helpers
-- ---------------------------------------------------------------------

-- อายุโคม (30 นาที) – กำหนดจาก Server เท่านั้น
create or replace function public.lantern_lifetime()
returns interval
language sql
immutable
as $$ select interval '30 minutes' $$;

-- จำนวน report ที่ทำให้โคมถูกซ่อนอัตโนมัติเพื่อรอตรวจสอบ
create or replace function public.report_auto_hide_threshold()
returns integer
language sql
immutable
as $$ select 5 $$;

-- ---------------------------------------------------------------------
-- users (profile ของ auth.users รวมถึง Anonymous/Guest)
-- ---------------------------------------------------------------------
create table public.users (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text check (display_name is null or char_length(display_name) <= 60),
  email         text,
  avatar_url    text check (avatar_url is null or char_length(avatar_url) <= 500),
  role          text not null default 'user' check (role in ('user', 'moderator', 'admin')),
  is_anonymous  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index users_role_idx on public.users (role) where role <> 'user';

-- ---------------------------------------------------------------------
-- packages (ราคาปรับได้จาก Admin – ไม่ Hardcode ใน Frontend)
-- ---------------------------------------------------------------------
create table public.packages (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name         text not null check (char_length(name) between 1 and 80),
  description  text not null default '' check (char_length(description) <= 500),
  price        numeric(10, 2) not null default 0 check (price >= 0 and price <= 100000),
  currency     text not null default 'thb' check (currency = lower(currency) and char_length(currency) = 3),
  features     jsonb not null default '{}'::jsonb,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Stripe ไม่รองรับยอดชำระ THB ต่ำกว่า 10 บาท
  constraint packages_min_paid_price check (price = 0 or price >= 10)
);

create index packages_active_sort_idx on public.packages (is_active, sort_order);

-- ---------------------------------------------------------------------
-- lanterns
-- ---------------------------------------------------------------------
create table public.lanterns (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users (id) on delete cascade,
  package_id         uuid references public.packages (id) on delete set null,
  display_name       text not null check (char_length(display_name) between 1 and 40),
  wish_message       text not null default '' check (char_length(wish_message) <= 200),
  blessing_message   text not null default '' check (char_length(blessing_message) <= 160),
  extra_message      text not null default '' check (char_length(extra_message) <= 80),
  lantern_type       text not null check (lantern_type ~ '^[a-z0-9-]{2,40}$'),
  lantern_color      text not null check (lantern_color ~ '^#[0-9a-fA-F]{6}$'),
  decoration         text check (decoration is null or decoration ~ '^[a-z0-9-]{2,40}$'),
  text_config        jsonb not null default '{}'::jsonb,
  image_config       jsonb,
  drawing_data       jsonb,
  -- Storage object path ใน bucket "lantern-assets" (API แปลงเป็น Signed URL)
  image_url          text check (image_url is null or image_url ~ '^[0-9a-f-]{36}/[a-z0-9-]+\.(webp|png)$'),
  client_request_id  uuid,
  payment_id         uuid unique,
  status             text not null default 'pending_payment'
                     check (status in ('pending_payment', 'active', 'expired', 'removed', 'cancelled')),
  report_count       integer not null default 0 check (report_count >= 0),
  moderation_note    text,
  created_at         timestamptz not null default now(),
  released_at        timestamptz,
  expires_at         timestamptz,
  content_purged_at  timestamptz,
  updated_at         timestamptz not null default now(),
  constraint lanterns_active_has_expiry check (status <> 'active' or (released_at is not null and expires_at is not null)),
  constraint lanterns_request_unique unique (user_id, client_request_id)
);

-- Festival scene query: active & not expired, newest first
create index lanterns_active_expires_idx on public.lanterns (expires_at desc) where status = 'active';
create index lanterns_user_created_idx on public.lanterns (user_id, created_at desc);
create index lanterns_purge_idx on public.lanterns (expires_at) where content_purged_at is null;
create index lanterns_reported_idx on public.lanterns (report_count desc) where report_count > 0;
create index lanterns_status_created_idx on public.lanterns (status, created_at desc);

-- ---------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------
create table public.payments (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references public.users (id) on delete cascade,
  lantern_id                uuid unique references public.lanterns (id) on delete set null,
  package_id                uuid references public.packages (id) on delete set null,
  package_name              text not null,
  stripe_session_id         text unique,
  stripe_payment_intent_id  text unique,
  amount                    numeric(10, 2) not null check (amount >= 0),
  currency                  text not null default 'thb',
  payment_method            text,
  payment_status            text not null default 'pending'
                            check (payment_status in ('pending', 'paid', 'failed', 'cancelled', 'expired', 'refunded')),
  failure_reason            text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  paid_at                   timestamptz
);

create index payments_user_created_idx on public.payments (user_id, created_at desc);
create index payments_status_created_idx on public.payments (payment_status, created_at desc);

alter table public.lanterns
  add constraint lanterns_payment_fk foreign key (payment_id) references public.payments (id) on delete set null;

-- Stripe webhook idempotency (ป้องกัน Webhook ซ้ำ)
create table public.stripe_events (
  id            text primary key,
  type          text not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz
);

-- ---------------------------------------------------------------------
-- festival statistics
-- ---------------------------------------------------------------------
create table public.festival_statistics (
  id                  smallint primary key default 1 check (id = 1),
  total_lanterns      bigint not null default 0,
  total_participants  bigint not null default 0,
  total_wishes        bigint not null default 0,
  updated_at          timestamptz not null default now()
);
insert into public.festival_statistics (id) values (1) on conflict do nothing;

create table public.festival_participants (
  user_id            uuid primary key references public.users (id) on delete cascade,
  first_released_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- moderation & ops
-- ---------------------------------------------------------------------
create table public.lantern_reports (
  id           uuid primary key default gen_random_uuid(),
  lantern_id   uuid not null references public.lanterns (id) on delete cascade,
  reporter_id  uuid not null references public.users (id) on delete cascade,
  reason       text not null check (reason in ('inappropriate', 'spam', 'harassment', 'personal-info', 'other')),
  details      text check (details is null or char_length(details) <= 300),
  status       text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at   timestamptz not null default now(),
  constraint lantern_reports_once unique (lantern_id, reporter_id)
);
create index lantern_reports_open_idx on public.lantern_reports (status, created_at desc);

create table public.error_logs (
  id          bigint generated always as identity primary key,
  level       text not null default 'error' check (level in ('info', 'warn', 'error')),
  source      text not null,
  message     text not null,
  context     jsonb,
  created_at  timestamptz not null default now()
);
create index error_logs_created_idx on public.error_logs (created_at desc);

create table public.rate_limits (
  key           text primary key,
  window_start  timestamptz not null,
  count         integer not null
);

-- =====================================================================
-- Triggers & functions
-- =====================================================================

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger users_touch before update on public.users for each row execute function public.touch_updated_at();
create trigger packages_touch before update on public.packages for each row execute function public.touch_updated_at();
create trigger lanterns_touch before update on public.lanterns for each row execute function public.touch_updated_at();
create trigger payments_touch before update on public.payments for each row execute function public.touch_updated_at();

-- auth.users → public.users
create or replace function public.handle_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, is_anonymous, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.is_anonymous, false),
    nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60), '')
  )
  on conflict (id) do update
    set email = excluded.email,
        is_anonymous = excluded.is_anonymous;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_auth_user();

create trigger on_auth_user_updated
  after update of email, is_anonymous on auth.users
  for each row execute function public.handle_auth_user();

-- เวลา Release/Expire ถูกกำหนดโดย Database เท่านั้น (ไม่เชื่อเวลา Client)
create or replace function public.lantern_set_lifetime()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'active' and new.released_at is null then
    new.released_at := now();
    new.expires_at := now() + public.lantern_lifetime();
  end if;
  if tg_op = 'UPDATE' then
    -- ห้ามแก้ไขเวลาหลังปล่อยแล้ว
    if old.released_at is not null then
      new.released_at := old.released_at;
      new.expires_at := old.expires_at;
    end if;
  end if;
  return new;
end;
$$;

create trigger lanterns_lifetime
  before insert or update on public.lanterns
  for each row execute function public.lantern_set_lifetime();

-- Statistics + Realtime broadcast เมื่อโคมถูกปล่อย / ถูกนำออก
create or replace function public.lantern_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  became_active  boolean := new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active');
  first_release  boolean := became_active and (tg_op = 'INSERT' or old.released_at is null);
  left_active    boolean := tg_op = 'UPDATE' and old.status = 'active' and new.status <> 'active';
  new_participant integer := 0;
begin
  if first_release then
    insert into public.festival_participants (user_id) values (new.user_id)
    on conflict (user_id) do nothing;
    get diagnostics new_participant = row_count;

    update public.festival_statistics
       set total_lanterns = total_lanterns + 1,
           total_wishes = total_wishes + (case when char_length(trim(new.wish_message)) > 0 then 1 else 0 end),
           total_participants = total_participants + new_participant,
           updated_at = now()
     where id = 1;
  end if;

  if became_active and new.expires_at > now() then
    perform realtime.send(
      jsonb_build_object('id', new.id, 'expires_at', new.expires_at),
      'lantern:new',
      'festival',
      true
    );
  elsif left_active then
    perform realtime.send(
      jsonb_build_object('id', new.id, 'status', new.status),
      'lantern:removed',
      'festival',
      true
    );
  end if;

  return null;
end;
$$;

create trigger lanterns_after_change
  after insert or update of status on public.lanterns
  for each row execute function public.lantern_after_change();

-- รายงานโคม → นับ + ซ่อนอัตโนมัติเมื่อถึง threshold
create or replace function public.lantern_report_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lanterns
     set report_count = report_count + 1,
         status = case
           when status = 'active' and report_count + 1 >= public.report_auto_hide_threshold() then 'removed'
           else status
         end,
         moderation_note = case
           when status = 'active' and report_count + 1 >= public.report_auto_hide_threshold()
             then 'auto-hidden: report threshold reached'
           else moderation_note
         end
   where id = new.lantern_id;
  return null;
end;
$$;

create trigger lantern_reports_after_insert
  after insert on public.lantern_reports
  for each row execute function public.lantern_report_after_insert();

-- =====================================================================
-- RPC (service_role เท่านั้น)
-- =====================================================================

-- Fixed-window rate limit แบบ atomic
create or replace function public.check_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set count = case
                  when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1
                  else rl.count + 1
                end,
        window_start = case
                  when rl.window_start < now() - make_interval(secs => p_window_seconds) then now()
                  else rl.window_start
                end
  returning count into current_count;

  return current_count <= p_limit;
end;
$$;

-- ยืนยันการชำระเงิน + ปล่อยโคม (idempotent, transaction เดียว)
create or replace function public.activate_paid_lantern(
  p_session_id text,
  p_payment_intent_id text,
  p_payment_method text,
  p_amount_total numeric
)
returns table (lantern_id uuid, payment_id uuid, already_processed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
begin
  select * into v_payment
    from public.payments
   where stripe_session_id = p_session_id
   for update;

  if not found then
    raise exception 'payment not found for session %', p_session_id using errcode = 'P0002';
  end if;

  if v_payment.payment_status = 'paid' then
    return query select v_payment.lantern_id, v_payment.id, true;
    return;
  end if;

  if p_amount_total is distinct from v_payment.amount then
    raise exception 'amount mismatch for payment % (expected %, got %)', v_payment.id, v_payment.amount, p_amount_total
      using errcode = 'P0001';
  end if;

  update public.payments
     set payment_status = 'paid',
         stripe_payment_intent_id = coalesce(p_payment_intent_id, stripe_payment_intent_id),
         payment_method = coalesce(p_payment_method, payment_method),
         paid_at = now(),
         failure_reason = null
   where id = v_payment.id;

  -- ปล่อยโคม (trigger จะกำหนด released_at / expires_at และ broadcast)
  update public.lanterns
     set status = 'active'
   where id = v_payment.lantern_id
     and status in ('pending_payment', 'cancelled');

  return query select v_payment.lantern_id, v_payment.id, false;
end;
$$;

-- ปิดรายการที่ไม่สำเร็จ (ยกเลิก/หมดเวลา/ล้มเหลว)
create or replace function public.close_unpaid_payment(
  p_session_id text,
  p_status text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
begin
  if p_status not in ('failed', 'cancelled', 'expired') then
    raise exception 'invalid status %', p_status;
  end if;

  select * into v_payment from public.payments where stripe_session_id = p_session_id for update;
  if not found or v_payment.payment_status <> 'pending' then
    return false;
  end if;

  update public.payments
     set payment_status = p_status, failure_reason = left(p_reason, 300)
   where id = v_payment.id;

  update public.lanterns
     set status = 'cancelled'
   where id = v_payment.lantern_id and status = 'pending_payment';

  return true;
end;
$$;

-- ทำเครื่องหมายโคมหมดอายุ
create or replace function public.expire_lanterns()
returns integer
language sql
security definer
set search_path = public
as $$
  with expired as (
    update public.lanterns
       set status = 'expired'
     where status = 'active' and expires_at <= now()
    returning 1
  )
  select count(*)::integer from expired;
$$;

-- ย้ายโคม/ประวัติชำระเงินจาก Guest (anonymous) ไปยังบัญชีจริง
create or replace function public.claim_guest_data(p_from uuid, p_to uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  moved integer;
begin
  if p_from = p_to then
    return 0;
  end if;
  if not exists (select 1 from public.users where id = p_from and is_anonymous) then
    raise exception 'source account is not a guest account' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.users where id = p_to and not is_anonymous) then
    raise exception 'target account must be a registered account' using errcode = 'P0001';
  end if;

  update public.lanterns set user_id = p_to where user_id = p_from;
  get diagnostics moved = row_count;
  update public.payments set user_id = p_to where user_id = p_from;
  delete from public.lantern_reports r
   where r.reporter_id = p_from
     and exists (select 1 from public.lantern_reports x where x.reporter_id = p_to and x.lantern_id = r.lantern_id);
  update public.lantern_reports set reporter_id = p_to where reporter_id = p_from;
  insert into public.festival_participants (user_id, first_released_at)
    select p_to, first_released_at from public.festival_participants where user_id = p_from
  on conflict (user_id) do nothing;
  delete from public.festival_participants where user_id = p_from;
  return moved;
end;
$$;

revoke all on function public.claim_guest_data(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_guest_data(uuid, uuid) to service_role;

revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.activate_paid_lantern(text, text, text, numeric) from public, anon, authenticated;
revoke all on function public.close_unpaid_payment(text, text, text) from public, anon, authenticated;
revoke all on function public.expire_lanterns() from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
grant execute on function public.activate_paid_lantern(text, text, text, numeric) to service_role;
grant execute on function public.close_unpaid_payment(text, text, text) to service_role;
grant execute on function public.expire_lanterns() to service_role;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.users enable row level security;
alter table public.packages enable row level security;
alter table public.lanterns enable row level security;
alter table public.payments enable row level security;
alter table public.stripe_events enable row level security;
alter table public.festival_statistics enable row level security;
alter table public.festival_participants enable row level security;
alter table public.lantern_reports enable row level security;
alter table public.error_logs enable row level security;
alter table public.rate_limits enable row level security;

-- users: อ่าน/แก้ไขได้เฉพาะของตัวเอง และแก้ไขได้เฉพาะบางคอลัมน์ (role แก้ไม่ได้)
create policy "users: read own" on public.users
  for select to authenticated using (id = (select auth.uid()));
create policy "users: update own" on public.users
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke update on public.users from anon, authenticated;
grant update (display_name, avatar_url) on public.users to authenticated;

-- packages: อ่านเฉพาะที่เปิดใช้งาน
create policy "packages: read active" on public.packages
  for select to anon, authenticated using (is_active);

-- lanterns: โคมที่ยังลอยอยู่อ่านได้ทุกคน / เจ้าของอ่านของตัวเองได้ทุกสถานะ
create policy "lanterns: read active festival" on public.lanterns
  for select to anon, authenticated using (status = 'active' and expires_at > now());
create policy "lanterns: owner read" on public.lanterns
  for select to authenticated using (user_id = (select auth.uid()));
-- ไม่เปิดเผยคอลัมน์ภายใน
revoke select on public.lanterns from anon, authenticated;
grant select (
  id, user_id, display_name, wish_message, blessing_message, extra_message, lantern_type,
  lantern_color, decoration, text_config, image_config, drawing_data, image_url, status,
  created_at, released_at, expires_at
) on public.lanterns to anon, authenticated;
-- การเขียนทั้งหมดผ่าน API (service_role) เท่านั้น

-- payments: เจ้าของอ่านประวัติของตัวเอง
create policy "payments: owner read" on public.payments
  for select to authenticated using (user_id = (select auth.uid()));

-- statistics: อ่านได้ทุกคน
create policy "stats: public read" on public.festival_statistics
  for select to anon, authenticated using (true);

-- ตารางที่เหลือ: ไม่มี policy = ปฏิเสธ anon/authenticated ทั้งหมด (service_role bypass RLS)

-- =====================================================================
-- Realtime Authorization (Private Broadcast channel "festival")
-- Client รับได้อย่างเดียว ส่ง (insert) ไม่ได้ → ป้องกันการปลอม Event
-- =====================================================================
create policy "festival broadcast: receive" on realtime.messages
  for select to anon, authenticated
  using (realtime.topic() = 'festival' and realtime.messages.extension = 'broadcast');

-- =====================================================================
-- Storage: private bucket (อ่านผ่าน Signed URL ที่หมดอายุพร้อมโคม)
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lantern-assets', 'lantern-assets', false, 5242880, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- =====================================================================
-- Seed packages (แก้ไขราคา/รายละเอียดได้จาก /admin)
-- =====================================================================
insert into public.packages (slug, name, description, price, currency, features, sort_order, is_active)
values
  ('free', 'Free Lantern', 'โคมอธิษฐานพื้นฐาน เลือกได้ 4 แบบ เขียนข้อความ วาดรูป และใส่รูปภาพ', 0, 'thb',
   '{"designs": ["classic-golden", "warm-white", "sunset-orange", "romantic-pink"], "allowImage": true, "allowDrawing": true, "decoration": null, "highlights": ["โคม 4 แบบ", "เขียนคำอธิษฐาน", "วาดภาพ + ใส่รูป", "ลอย 30 นาที"]}',
   1, true),
  ('premium', 'Premium Lantern', 'ปลดล็อกโคมพิเศษลายทองและสีครามเที่ยงคืน พร้อมกรอบลวดลายไทย', 29, 'thb',
   '{"designs": ["classic-golden", "warm-white", "sunset-orange", "romantic-pink", "lotus-gold", "midnight-indigo"], "allowImage": true, "allowDrawing": true, "decoration": "thai-frame", "highlights": ["โคม Premium 2 แบบ", "กรอบลายไทยสีทอง", "ทุกฟีเจอร์ของ Free"]}',
   2, true),
  ('special', 'Special Decoration', 'โคมพร้อมประกายดาวและกลีบดอกไม้ลอยรอบ ๆ โดดเด่นกลางสายน้ำ', 59, 'thb',
   '{"designs": ["classic-golden", "warm-white", "sunset-orange", "romantic-pink", "lotus-gold", "midnight-indigo"], "allowImage": true, "allowDrawing": true, "decoration": "sparkle-petals", "highlights": ["ประกายดาว + กลีบดอกไม้", "แสงออร่ารอบโคม", "ทุกฟีเจอร์ของ Premium"]}',
   3, true)
on conflict (slug) do nothing;
