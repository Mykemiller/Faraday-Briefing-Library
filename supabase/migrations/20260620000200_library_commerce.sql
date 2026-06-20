-- ─────────────────────────────────────────────────────────────────────────────
-- Briefing Library — Phase 3: persistent cart, entitlements, idempotency ledger (§9.3, §10.2)
--
-- Identity note (DEVIATION FROM SPEC §9.3, FLAGGED): the spec's literal SQL keyed
-- user_id -> auth.users. The REUSED Jurisdiction Watch wallet keys on public.subscribers(id)
-- (jw_token_balance(p_sub uuid), token_transactions.subscriber_id). To reuse that wallet
-- rather than fork a second identity, these tables key on public.subscribers(id).
-- RLS is owner-scoped; server routes use the service role with explicit ownership checks,
-- mirroring the existing JW commerce path (Clerk is the auth front; subscribers is the
-- commerce identity, resolved by email).
-- ─────────────────────────────────────────────────────────────────────────────

-- The reading table: a persistent, identity-bound cart (§9).
create table if not exists public.library_cart_items (
  id            uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  briefing_id   text not null,          -- Airtable record id
  briefing_slug text not null,
  added_at      timestamptz not null default now(),
  unique (subscriber_id, briefing_id)   -- no duplicate lines (§9.3)
);
create index if not exists library_cart_items_sub_idx on public.library_cart_items (subscriber_id);

-- Durable entitlements — tokens are spent, the briefing is kept. Never expire (§10.3).
create table if not exists public.library_entitlements (
  id            uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  briefing_id   text not null,
  granted_at    timestamptz not null default now(),
  source        text not null default 'checkout' check (source in ('checkout','comp','campaign')),
  unique (subscriber_id, briefing_id)   -- idempotent grant (§9.3)
);
create index if not exists library_entitlements_sub_idx on public.library_entitlements (subscriber_id);

-- Idempotency ledger — a session-scoped checkout token logged under a strict unique
-- constraint. A duplicate token replays the prior result, never double-debits (L2, §10.2).
-- Mirrors the wallet_record_grant/stripe_events idempotency precedent.
create table if not exists public.processed_checkouts (
  idempotency_token uuid primary key,             -- minted on panel mount, re-minted on cart change
  subscriber_id     uuid not null references public.subscribers(id) on delete cascade,
  product_key       text not null default 'briefing_library',
  briefing_ids      text[] not null,
  tokens_spent      integer not null,
  token_tx_id       uuid,                          -- the token_transactions unlock row created
  result            jsonb not null,                -- the response served back on replay
  processed_at      timestamptz not null default now()
);
create index if not exists processed_checkouts_sub_idx on public.processed_checkouts (subscriber_id);

-- ── RLS: owner-only (§9.3) ───────────────────────────────────────────────────
alter table public.library_cart_items   enable row level security;
alter table public.library_entitlements enable row level security;
alter table public.processed_checkouts  enable row level security;

-- Owner-read policies. Resolve the caller's subscriber_id from their auth email.
-- (Service-role writes in the API routes bypass RLS; these policies are the deny-by-default
-- backstop and enable any future direct-from-client reads.)
create or replace function public.current_subscriber_id() returns uuid
  language sql stable
  set search_path to 'public', 'pg_temp' as $$
  select s.id from public.subscribers s
  where s.email = nullif(current_setting('request.jwt.claims', true)::jsonb->>'email','')
  limit 1;
$$;

drop policy if exists library_cart_owner on public.library_cart_items;
create policy library_cart_owner on public.library_cart_items
  for select to authenticated using (subscriber_id = public.current_subscriber_id());

drop policy if exists library_entitlements_owner on public.library_entitlements;
create policy library_entitlements_owner on public.library_entitlements
  for select to authenticated using (subscriber_id = public.current_subscriber_id());

drop policy if exists processed_checkouts_owner on public.processed_checkouts;
create policy processed_checkouts_owner on public.processed_checkouts
  for select to authenticated using (subscriber_id = public.current_subscriber_id());

comment on table public.library_cart_items is 'Persistent, identity-bound Briefing Library cart (§9). Survives logout/login + device switch.';
comment on table public.processed_checkouts is 'Idempotency ledger for atomic Briefing Library checkout (L2, §10.2). Unique token ⇒ replay-safe, no double-debit.';
