alter table public.holdings
    add column if not exists current_value_sek numeric,
    add column if not exists value_sek numeric,
    add column if not exists category text,
    add column if not exists country text,
    add column if not exists market text,
    add column if not exists instrument_id text,
    add column if not exists provider text,
    add column if not exists price_updated_at bigint;

create index if not exists holdings_user_id_idx
    on public.holdings(user_id);

create index if not exists holdings_account_id_idx
    on public.holdings(account_id);
