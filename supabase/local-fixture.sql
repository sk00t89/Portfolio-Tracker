-- LOCAL scratch database ONLY. Not a production migration or export of production data.
-- Existing repo does not include the original accounts/holdings schema.
begin;
create table if not exists public.accounts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null, platform text, account_type text, created_at timestamptz not null default now()
);
create table if not exists public.holdings (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 account_id uuid references public.accounts(id) on delete set null, name text not null, ticker text, isin text,
 quantity numeric, average_price numeric, average_price_sek numeric, current_price numeric,current_value_sek numeric,value_sek numeric,
 currency text,platform text,asset_type text,category text,underlying text,product_type text,country text,market text,instrument_id text,provider text,
 price_updated_at bigint,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.accounts enable row level security;
alter table public.holdings enable row level security;
grant select,insert,update,delete on public.accounts,public.holdings to authenticated;
grant all on public.accounts,public.holdings to service_role;
drop policy if exists "Local own accounts" on public.accounts;
create policy "Local own accounts" on public.accounts to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists "Local own holdings" on public.holdings;
create policy "Local own holdings" on public.holdings to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
commit;
