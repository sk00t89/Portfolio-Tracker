-- Read-only: run in Supabase SQL Editor to inspect AbCellera and its portfolio history.
-- These queries do not repair timestamps or create historical observations.
select id, user_id, name, ticker, isin, provider, instrument_id,
       asset_type, market, country, currency, current_price, current_value_sek,
       price_updated_at,
       case
           when price_updated_at between 1 and 999999999999
               then to_timestamp(price_updated_at::double precision)
           when price_updated_at between 1000000000000 and 9999999999999
               then to_timestamp(price_updated_at::double precision / 1000)
           else null
       end as interpreted_quote_time,
       updated_at, clock_timestamp() as database_now
from public.holdings
where name ilike '%abcellera%' or upper(ticker) = 'ABCL';

select user_id, count(*) as saved_days,
       min(valuation_date) as first_day, max(valuation_date) as latest_day
from public.portfolio_daily_values
where user_id in (
    select user_id from public.holdings
    where name ilike '%abcellera%' or upper(ticker) = 'ABCL'
)
group by user_id;

select user_id, valuation_date, total_value_sek, observed_at, updated_at
from public.portfolio_daily_values
where user_id in (
    select user_id from public.holdings
    where name ilike '%abcellera%' or upper(ticker) = 'ABCL'
)
order by valuation_date desc
limit 30;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'holdings' and column_name = 'price_updated_at')
       or table_name = 'portfolio_daily_values')
order by table_name, ordinal_position;

select pg_get_functiondef(p.oid) as rpc_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'save_portfolio_daily_value';
