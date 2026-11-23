-- ─────────────────────────────────────────────────────────────
-- PromptPay QR + transfer-slip payments (replaces Stripe Checkout)
-- Run once in Supabase → SQL Editor. Safe to run again (idempotent).
--
--  • payments.expires_at       – QR countdown shown to the payer
--  • payment_slips             – every uploaded slip (image in private storage) + verification result
--  • slip_transactions         – one row per bank transaction reference that paid an order.
--                                PRIMARY KEY (trans_ref) = the same slip can never be used twice,
--                                and the row survives even if the payment/user is deleted.
--  • activate_slip_payment()   – marks the payment paid + releases the lantern in one transaction
--                                (the existing lantern triggers set released_at/expires_at and broadcast)
--  • close_unpaid_payment_by_id() – expires abandoned QR orders (no Stripe session id)
-- ─────────────────────────────────────────────────────────────

-- 1) payments: QR expiry (display / abandoned-order cleanup)
alter table public.payments
  add column if not exists expires_at timestamptz;

create index if not exists payments_pending_method_idx
  on public.payments (payment_method, created_at)
  where payment_status = 'pending';

-- 2) uploaded slips (attempts) – admin review
create table if not exists public.payment_slips (
  id                uuid primary key default gen_random_uuid(),
  payment_id        uuid,
  user_id           uuid not null,
  image_path        text check (image_path is null or char_length(image_path) <= 300),
  image_store       text check (image_store is null or image_store in ('r2', 'supabase')),
  image_type        text check (image_type is null or image_type in ('image/jpeg', 'image/png', 'image/webp')),
  qr_payload        text check (qr_payload is null or char_length(qr_payload) <= 128),
  trans_ref         text check (trans_ref is null or char_length(trans_ref) <= 64),
  status            text not null default 'processing'
                    check (status in ('processing', 'verified', 'rejected', 'error', 'pending_review')),
  reason            text check (reason is null or char_length(reason) <= 60),
  message           text check (message is null or char_length(message) <= 500),
  provider          text check (provider is null or char_length(provider) <= 30),
  amount            numeric(10, 2),
  slip_date         timestamptz,
  sender_name       text check (sender_name is null or char_length(sender_name) <= 120),
  sender_bank       text check (sender_bank is null or char_length(sender_bank) <= 60),
  receiver_name     text check (receiver_name is null or char_length(receiver_name) <= 120),
  receiver_account  text check (receiver_account is null or char_length(receiver_account) <= 60),
  receiver_proxy    text check (receiver_proxy is null or char_length(receiver_proxy) <= 60),
  receiver_bank     text check (receiver_bank is null or char_length(receiver_bank) <= 60),
  is_duplicate      boolean,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payment_slips_payment_id_fkey') then
    alter table public.payment_slips
      add constraint payment_slips_payment_id_fkey
      foreign key (payment_id) references public.payments (id) on delete set null;
  end if;
end $$;

create index if not exists payment_slips_payment_created_idx on public.payment_slips (payment_id, created_at desc);
create index if not exists payment_slips_trans_ref_idx on public.payment_slips (trans_ref) where trans_ref is not null;
create index if not exists payment_slips_qr_payload_idx on public.payment_slips (qr_payload) where qr_payload is not null;
create index if not exists payment_slips_user_created_idx on public.payment_slips (user_id, created_at desc);

drop trigger if exists payment_slips_touch on public.payment_slips;
create trigger payment_slips_touch before update on public.payment_slips
  for each row execute function public.touch_updated_at();

-- 3) used bank transaction references (UNIQUE = a slip pays at most one order, ever)
create table if not exists public.slip_transactions (
  trans_ref   text primary key check (char_length(trans_ref) between 1 and 64),
  payment_id  uuid,
  slip_id     uuid,
  amount      numeric(10, 2) not null check (amount >= 0),
  source      text not null default 'auto' check (source in ('auto', 'admin')),
  created_at  timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'slip_transactions_payment_id_fkey') then
    alter table public.slip_transactions
      add constraint slip_transactions_payment_id_fkey
      foreign key (payment_id) references public.payments (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'slip_transactions_slip_id_fkey') then
    alter table public.slip_transactions
      add constraint slip_transactions_slip_id_fkey
      foreign key (slip_id) references public.payment_slips (id) on delete set null;
  end if;
end $$;

create index if not exists slip_transactions_payment_idx on public.slip_transactions (payment_id);

-- service_role only (no policies = anon/authenticated denied)
alter table public.payment_slips enable row level security;
alter table public.slip_transactions enable row level security;
revoke all on public.payment_slips from anon, authenticated;
revoke all on public.slip_transactions from anon, authenticated;

-- 4) verify → paid → release, in one transaction (idempotent per payment)
--    Accepts orders that already timed out (expired/cancelled) as long as the lantern content still
--    exists: the payer really transferred the money, so the lantern must float.
create or replace function public.activate_slip_payment(
  p_payment_id uuid,
  p_slip_id uuid,
  p_trans_ref text,
  p_amount numeric,
  p_source text default 'auto'
)
returns table (lantern_id uuid, payment_id uuid, already_processed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_lantern public.lanterns%rowtype;
begin
  if p_trans_ref is null or char_length(p_trans_ref) = 0 then
    raise exception 'trans_ref required' using errcode = '22023';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'payment not found %', p_payment_id using errcode = 'P0002';
  end if;

  if v_payment.payment_status = 'paid' then
    return query select v_payment.lantern_id, v_payment.id, true;
    return;
  end if;

  if v_payment.payment_status not in ('pending', 'expired', 'cancelled') then
    raise exception 'payment % is %', v_payment.id, v_payment.payment_status using errcode = 'P0003';
  end if;

  if p_amount is null or p_amount < v_payment.amount then
    raise exception 'amount too low for payment % (expected %, got %)', v_payment.id, v_payment.amount, p_amount
      using errcode = 'P0001';
  end if;

  select * into v_lantern from public.lanterns where id = v_payment.lantern_id for update;
  if not found or v_lantern.content_purged_at is not null
     or v_lantern.status not in ('pending_payment', 'cancelled', 'active') then
    raise exception 'lantern for payment % is no longer available', v_payment.id using errcode = 'P0004';
  end if;

  -- unique_violation (23505) here = the slip was already used for another order
  insert into public.slip_transactions (trans_ref, payment_id, slip_id, amount, source)
  values (p_trans_ref, v_payment.id, p_slip_id, p_amount, coalesce(p_source, 'auto'));

  update public.payments
     set payment_status = 'paid',
         payment_method = 'promptpay_slip',
         paid_at = now(),
         failure_reason = null
   where id = v_payment.id;

  if p_slip_id is not null then
    update public.payment_slips set status = 'verified', reason = null where id = p_slip_id;
  end if;

  -- release (lanterns_lifetime sets released_at/expires_at, lanterns_after_change broadcasts)
  update public.lanterns
     set status = 'active'
   where id = v_payment.lantern_id
     and status in ('pending_payment', 'cancelled');

  return query select v_payment.lantern_id, v_payment.id, false;
end;
$$;

-- 5) close an unpaid QR order by id (cancel / abandoned)
create or replace function public.close_unpaid_payment_by_id(
  p_payment_id uuid,
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

  select * into v_payment from public.payments where id = p_payment_id for update;
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

revoke all on function public.activate_slip_payment(uuid, uuid, text, numeric, text) from public, anon, authenticated;
revoke all on function public.close_unpaid_payment_by_id(uuid, text, text) from public, anon, authenticated;
grant execute on function public.activate_slip_payment(uuid, uuid, text, numeric, text) to service_role;
grant execute on function public.close_unpaid_payment_by_id(uuid, text, text) to service_role;

-- 6) private storage for slips when R2 is not configured (Supabase Storage fallback)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-slips', 'payment-slips', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
