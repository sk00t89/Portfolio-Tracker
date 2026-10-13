-- REVIEW DRAFT ONLY. NO CLOUD EXECUTION AUTHORIZED.
-- Intended project: vutjthqlgzokeylaxpzp. SQL cannot verify a Supabase project ID.
-- Mandatory dashboard/API identity verification before any approved cloud run.
-- Synthetic-only runtime. No Auth users, portfolio rows, jobs or deployments.
-- Source supabase-test/performance-runtime.sql sha256 c23d3eab934c1650285a97bb16a198c6a0f88754e60d2fab03c9b14a506fb890
-- Source supabase-test/history-stage.sql sha256 f7eb5db7e5164cb2ae89030a172b19fa404105be7ab49463c2d1f26c61917e0c
-- Source supabase-test/cash-stage.sql sha256 93d3aff217cc2c09516990085e67d79ff8c29906356788f343d64788c14c5dde
-- Source supabase-test/market-archive.sql sha256 68e914f8fa88f640032cd5064f54c3b774045dd17164fbde7081638b46c4be41
begin;
do $$ begin
    if (select count(*) from auth.users)<>0 then raise exception 'Runtime requires zero Auth users';end if;
    if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind in ('r','p','v','m','f','S'))<>3
        or (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname in ('portfolio_performance_baselines','portfolio_ledger_events','portfolio_performance_observations')
        and c.relkind='r' and c.relrowsecurity and pg_get_userbyid(c.relowner)='postgres')<>3
        then raise exception 'Unexpected foundation tables';end if;
    if (select count(*) from public.portfolio_performance_baselines)<>0
        or (select count(*) from public.portfolio_ledger_events)<>0
        or (select count(*) from public.portfolio_performance_observations)<>0 then raise exception 'Foundation must be empty';end if;
    if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e'))<>3
        or not exists(select 1 from pg_proc where oid='public.rls_auto_enable()'::regprocedure and md5(prosrc)='c44fb229ea8a6b0afd04a0a33261c16c'
        and proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=pg_catalog']::text[] and proacl is null)
        or not exists(select 1 from pg_event_trigger where evtname='ensure_rls' and evtenabled='O' and evtevent='ddl_command_end'
            and evtfoid='public.rls_auto_enable()'::regprocedure and evtowner='postgres'::regrole
            and evttags=array['CREATE TABLE','CREATE TABLE AS','SELECT INTO']::text[])
        then raise exception 'Unexpected foundation functions or automatic RLS';end if;
    if not exists(select 1 from pg_proc where oid='public.get_portfolio_performance_input()'::regprocedure
        and md5(replace(prosrc,E'\r\n',E'\n'))='601dcee438df9466e8afb0541b4b9e88'
        and proowner='postgres'::regrole and not prosecdef and proconfig=array['search_path=""']::text[])
        or not exists(select 1 from pg_proc where oid='public.invalidate_performance_coverage()'::regprocedure
        and md5(replace(prosrc,E'\r\n',E'\n'))='dc20c688e65a173b3b17599a372259ee'
        and proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=""']::text[])
        or not has_function_privilege('authenticated','public.get_portfolio_performance_input()','EXECUTE')
        or has_function_privilege('anon','public.get_portfolio_performance_input()','EXECUTE')
        or has_function_privilege('authenticated','public.invalidate_performance_coverage()','EXECUTE')
        or has_function_privilege('anon','public.invalidate_performance_coverage()','EXECUTE')
        then raise exception 'Unexpected foundation RPC definitions or privileges';end if;
    if exists(select 1 from pg_policies where schemaname='public' and (cmd<>'SELECT' or roles<>array['authenticated']::name[]
        or regexp_replace(qual,'\s','','g')<>'((SELECTauth.uid()ASuid)=user_id)'))
        or (select count(*) from pg_policies where schemaname='public')<>3 then raise exception 'Unexpected foundation policies';end if;
    if exists(select 1 from (values('portfolio_performance_baselines'),('portfolio_ledger_events'),('portfolio_performance_observations')) t(name)
        cross join (values('anon'),('authenticated')) r(role)
        cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) p(privilege)
        where has_table_privilege(r.role,'public.'||t.name,p.privilege)<>(r.role='authenticated' and p.privilege='SELECT'))
        then raise exception 'Unexpected foundation table grants';end if;
end $$;
create table public.staging_runtime_environment (
    singleton boolean primary key check(singleton),
    project_ref text not null check(project_ref='vutjthqlgzokeylaxpzp'),
    runtime_version text not null check(runtime_version='staging-runtime-v1'),
    synthetic_only boolean not null check(synthetic_only)
);
insert into public.staging_runtime_environment values(true,'vutjthqlgzokeylaxpzp','staging-runtime-v1',true);
alter table public.staging_runtime_environment enable row level security;
revoke all on public.staging_runtime_environment from public,anon,authenticated,service_role;
grant select on public.staging_runtime_environment to service_role;
create function public.require_staging_synthetic_user(p_user_id uuid) returns void
language plpgsql stable security definer set search_path='' as $$ begin
    if auth.uid() is not null and auth.uid() is distinct from p_user_id then
        raise exception 'Owner does not match session' using errcode='42501';end if;
    if not exists(select 1 from auth.users where id=p_user_id and email like '%@portfolio-test.invalid'
        and raw_app_meta_data->>'portfolio_staging_synthetic'='true') then
        raise exception 'Marked synthetic staging account required' using errcode='42501';end if;
end $$;
revoke all on function public.require_staging_synthetic_user(uuid) from public,anon,authenticated,service_role;
create function public.require_staging_performance_test() returns void
language plpgsql stable security definer set search_path='' as $$ begin
    if not exists(select 1 from public.staging_runtime_environment where project_ref='vutjthqlgzokeylaxpzp'
        and runtime_version='staging-runtime-v1' and synthetic_only) then raise exception 'Staging identity missing';end if;
    if auth.uid() is not null then perform public.require_staging_synthetic_user(auth.uid());end if;
end $$;
revoke all on function public.require_staging_performance_test() from public,anon,authenticated,service_role;
create function public.validate_staging_opening(p_baseline jsonb) returns void
language plpgsql stable set search_path='' as $$ declare p jsonb;begin
    if p_baseline->>'source' is distinct from 'synthetic_test' then raise exception 'Synthetic opening required';end if;
    for p in select * from jsonb_array_elements(p_baseline->'positions') loop
        if (p->>'instrumentId' in ('synthetic-sek-equity','synthetic-us-equity','synthetic-nordnet-equity','synthetic-fund','synthetic-lysa-fund','synthetic-certificate')
            and p->>'currency'=case when p->>'instrumentId'='synthetic-us-equity' then 'USD' else 'SEK' end) is not true
            then raise exception 'Synthetic instrument registry required';end if;
    end loop;
end $$;
revoke all on function public.validate_staging_opening(jsonb) from public,anon,authenticated,service_role;

select public.require_staging_performance_test();

alter table public.portfolio_performance_baselines add column ledger_state jsonb not null default '{"cash":[],"positions":[]}'::jsonb;



create function public.staging_cash_delta(p_state jsonb,p_account text,p_currency text,p_delta numeric) returns jsonb
language plpgsql immutable set search_path='' as $$
declare v_cash jsonb; v_count integer; v_balance numeric;
begin
    select count(*),max((a->>'amount')::numeric) into v_count,v_balance from jsonb_array_elements(p_state->'cash') a
    where a->>'accountId'=p_account and a->>'currency'=p_currency;
    if v_count<>1 or p_delta is null or v_balance+p_delta<0 then raise exception 'Missing or insufficient verified cash'; end if;
    select jsonb_agg(case when a->>'accountId'=p_account and a->>'currency'=p_currency then
        a||jsonb_build_object('amount',v_balance+p_delta) else a end) into v_cash from jsonb_array_elements(p_state->'cash') a;
    return jsonb_set(p_state,'{cash}',v_cash);
end $$;
revoke all on function public.staging_cash_delta(jsonb,text,text,numeric) from public,anon,authenticated,service_role;

create function public.replay_staging_performance_ledger(p_baseline jsonb,p_events jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare v_state jsonb; e jsonb; v_amount numeric; v_quantity numeric; v_old numeric; v_positions jsonb;
    v_kind text; v_account text; v_currency text; v_instrument text; v_entry jsonb; v_n integer;
begin
    v_state=jsonb_build_object('cash',p_baseline->'cash','positions',p_baseline->'positions');
    if jsonb_typeof(v_state->'cash') is distinct from 'array' or jsonb_array_length(v_state->'cash')=0
        or jsonb_typeof(v_state->'positions') is distinct from 'array' then raise exception 'Opening balance incomplete'; end if;
    for v_entry in select * from jsonb_array_elements(v_state->'cash') loop
        if (jsonb_typeof(v_entry->'amount')='number' and (v_entry->>'amount')::numeric>=0
            and length(v_entry->>'accountId')>0 and v_entry->>'currency' ~ '^[A-Z]{3}$') is not true then raise exception 'Invalid opening cash'; end if;
        select count(*) into v_n from jsonb_array_elements(v_state->'cash') a
        where a->>'accountId'=v_entry->>'accountId' and a->>'currency'=v_entry->>'currency';
        if v_n<>1 then raise exception 'Duplicate opening cash'; end if;
    end loop;
    for v_entry in select * from jsonb_array_elements(v_state->'positions') loop
        if (jsonb_typeof(v_entry->'quantity')='number' and (v_entry->>'quantity')::numeric>=0
            and length(v_entry->>'instrumentId')>0 and v_entry->>'currency' ~ '^[A-Z]{3}$') is not true
            or not exists(select 1 from jsonb_array_elements(v_state->'cash') a where a->>'accountId'=v_entry->>'accountId') then raise exception 'Invalid opening position'; end if;
        select count(*) into v_n from jsonb_array_elements(v_state->'positions') a
        where a->>'accountId'=v_entry->>'accountId' and a->>'instrumentId'=v_entry->>'instrumentId';
        if v_n<>1 then raise exception 'Duplicate opening position'; end if;
    end loop;
    for e in select * from jsonb_array_elements(p_events) loop
        v_kind=e->>'kind';v_account=e->>'accountId';v_currency=e->>'currency';v_instrument=e->>'instrumentId';
        if (jsonb_typeof(e->'amount')='number' and (e->>'amount')::numeric>0 and v_currency ~ '^[A-Z]{3}$'
            and (e->>'date')::date>(p_baseline->>'date')::date) is not true then raise exception 'Invalid journal amount/date'; end if;
        v_amount=(e->>'amount')::numeric;
        if v_kind in ('BUY','SELL') then
            if (jsonb_typeof(e->'quantity')='number' and (e->>'quantity')::numeric>0 and length(v_instrument)>0) is not true then raise exception 'Invalid trade quantity'; end if;
            select a into v_entry from jsonb_array_elements(v_state->'positions') a where a->>'accountId'=v_account and a->>'instrumentId'=v_instrument;
            if v_entry is not null and v_entry->>'currency'<>v_currency then raise exception 'Position currency mismatch'; end if;
            v_old=coalesce((v_entry->>'quantity')::numeric,0);
            v_quantity=v_old+case when v_kind='BUY' then (e->>'quantity')::numeric else -(e->>'quantity')::numeric end;
            if v_quantity<0 then raise exception 'Insufficient historical position'; end if;
            select coalesce(jsonb_agg(a),'[]'::jsonb) into v_positions from jsonb_array_elements(v_state->'positions') a
                where not(a->>'accountId'=v_account and a->>'instrumentId'=v_instrument);
            v_positions=v_positions||jsonb_build_array(jsonb_build_object('accountId',v_account,'instrumentId',v_instrument,'currency',v_currency,'quantity',v_quantity));
            v_state=jsonb_set(v_state,'{positions}',v_positions);
            v_state=public.staging_cash_delta(v_state,v_account,v_currency,case when v_kind='BUY' then -v_amount else v_amount end);
        elsif v_kind='FX' then
            if (e->>'toCurrency' ~ '^[A-Z]{3}$' and e->>'toCurrency'<>v_currency and jsonb_typeof(e->'toAmount')='number'
                and (e->>'toAmount')::numeric>0) is not true then raise exception 'Invalid FX exchange'; end if;
            v_state=public.staging_cash_delta(v_state,v_account,v_currency,-v_amount);
            v_state=public.staging_cash_delta(v_state,v_account,e->>'toCurrency',(e->>'toAmount')::numeric);
        elsif v_kind='TRANSFER' then
            if (length(e->>'toAccountId')>0 and e->>'toAccountId'<>v_account) is not true then raise exception 'Invalid internal transfer'; end if;
            v_state=public.staging_cash_delta(v_state,v_account,v_currency,-v_amount);
            v_state=public.staging_cash_delta(v_state,e->>'toAccountId',v_currency,v_amount);
        elsif v_kind in ('DEPOSIT','WITHDRAWAL','DIVIDEND','INTEREST','FEE') then
            v_state=public.staging_cash_delta(v_state,v_account,v_currency,case when v_kind in ('WITHDRAWAL','FEE') then -v_amount else v_amount end);
        else raise exception 'Unsupported journal event'; end if;
        if v_kind in ('BUY','SELL','FX') then
            if (jsonb_typeof(e->'fee'->'amount')='number' and (e->'fee'->>'amount')::numeric>=0
                and e->'fee'->>'currency' ~ '^[A-Z]{3}$') is not true then raise exception 'Unknown transaction fee'; end if;
        end if;
        if e->'fee' is not null and e->'fee'<>'null'::jsonb then
            v_state=public.staging_cash_delta(v_state,v_account,e->'fee'->>'currency',-(e->'fee'->>'amount')::numeric);
        end if;
    end loop;
    return v_state;
end $$;
revoke all on function public.replay_staging_performance_ledger(jsonb,jsonb) from public,anon,authenticated,service_role;

create function public.initialize_staging_performance_portfolio(p_baseline jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid=auth.uid();v_state jsonb;v_baseline jsonb;v_value numeric=0;e jsonb;v_rate numeric;
begin
    perform public.require_staging_performance_test();
    if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
    if (p_baseline->>'source'='synthetic_test' and (p_baseline->>'date')::date<current_date
        and (p_baseline->>'asOf')::timestamptz at time zone 'Europe/Stockholm' >= ((p_baseline->>'date')::date+time '23:30')
        and ((p_baseline->>'asOf')::timestamptz at time zone 'Europe/Stockholm')::date=(p_baseline->>'date')::date) is not true then
        raise exception 'Only complete synthetic local closing imports are allowed'; end if;
    perform public.validate_staging_opening(p_baseline);
    v_state=public.replay_staging_performance_ledger(p_baseline,'[]'::jsonb);
    for e in select * from jsonb_array_elements(p_baseline->'positions') loop
        if (jsonb_typeof(e->'price')='number' and (e->>'price')::numeric>0 and jsonb_typeof(e->'fxRateToSek')='number'
            and (e->>'fxRateToSek')::numeric>0 and (e->>'currency'<>'SEK' or (e->>'fxRateToSek')::numeric=1)) is not true then raise exception 'Missing opening price or FX'; end if;
        v_value=v_value+(e->>'quantity')::numeric*(e->>'price')::numeric*(e->>'fxRateToSek')::numeric;
    end loop;
    for e in select * from jsonb_array_elements(p_baseline->'cash') loop
        if (jsonb_typeof(e->'fxRateToSek')='number' and (e->>'fxRateToSek')::numeric>0
            and (e->>'currency'<>'SEK' or (e->>'fxRateToSek')::numeric=1)) is not true then raise exception 'Missing opening cash FX'; end if;
        v_value=v_value+(e->>'amount')::numeric*(e->>'fxRateToSek')::numeric;
    end loop;
    if v_value<=0 then raise exception 'Opening value must be positive'; end if;
    v_baseline=p_baseline||jsonb_build_object('valueSek',v_value,'verified',true,'coverage','complete','finalized',true);
    insert into public.portfolio_performance_baselines(user_id,baseline,ledger_state,cash_flow_coverage,cost_coverage)
        values(v_user,v_baseline,v_state,'complete','complete');
    return jsonb_build_object('revision',0,'ledgerState',v_state,'baseline',v_baseline);
end $$;
revoke all on function public.initialize_staging_performance_portfolio(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.initialize_staging_performance_portfolio(jsonb) to authenticated;

create function public.register_staging_trade_for_owner(p_user_id uuid,p_draft jsonb,p_request_id uuid,p_expected_revision bigint,p_deposit jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid=p_user_id;b public.portfolio_performance_baselines%rowtype;v_date date;v_sequence integer;v_event jsonb;
    v_events jsonb;v_state jsonb;v_existing jsonb;v_request jsonb;v_amount numeric;v_deposit jsonb;v_final_revision bigint;
    v_fx jsonb;v_native numeric;v_sek numeric;v_conversion boolean;
begin
    perform public.require_staging_performance_test();
    perform public.require_staging_synthetic_user(p_user_id);
    if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
    select * into b from public.portfolio_performance_baselines where user_id=v_user for update;
    if not found then raise exception 'Opening balance required'; end if;
    if not exists(select 1 from jsonb_array_elements(b.baseline->'positions') p where p->>'accountId'=p_draft->>'accountId' and p->>'instrumentId'=p_draft->>'instrumentId' and p->>'currency'=p_draft->>'currency') then raise exception 'Known synthetic position required';end if;
    v_request=jsonb_build_object('draft',p_draft,'deposit',p_deposit);
    select event->'request' into v_existing from public.portfolio_ledger_events where user_id=v_user and event_id=p_request_id;
    if found then
        if v_existing is distinct from v_request then raise exception 'Idempotency key reused with different payload'; end if;
        return jsonb_build_object('revision',b.revision,'ledgerState',b.ledger_state,'duplicate',true);
    end if;
    if p_expected_revision is distinct from b.revision then raise exception 'Portfolio revision changed; reload before saving' using errcode='40001'; end if;
    if (p_draft->>'kind' in ('BUY','SELL') and jsonb_typeof(p_draft->'quantity')='number' and (p_draft->>'quantity')::numeric>0
        and jsonb_typeof(p_draft->'unitPrice')='number' and (p_draft->>'unitPrice')::numeric>0
        and p_draft->>'currency' ~ '^[A-Z]{3}$' and length(p_draft->>'accountId')>0 and length(p_draft->>'instrumentId')>0) is not true then raise exception 'Invalid trade'; end if;
    v_date=(p_draft->>'date')::date;
    if v_date<= (b.baseline->>'date')::date or v_date>(now() at time zone 'Europe/Stockholm')::date then raise exception 'Trade date outside tracked history'; end if;
    v_amount=(p_draft->>'quantity')::numeric*(p_draft->>'unitPrice')::numeric;
    v_conversion=p_draft->>'settlement'='broker_conversion';
    if p_draft ? 'settlement' and p_draft->>'settlement' not in ('currency_cash','broker_conversion') then raise exception 'Invalid settlement';end if;
    if v_conversion is true then
        if (p_draft->>'currency'<>'SEK' and p_draft->>'funding'='existing_cash' and p_deposit is null
            and jsonb_typeof(p_draft->'settlementAmountSek')='number' and (p_draft->>'settlementAmountSek')::numeric>0
            and jsonb_typeof(p_draft->'fee'->'amount')='number' and (p_draft->'fee'->>'amount')::numeric>=0
            and p_draft->'fee'->>'currency' in (p_draft->>'currency','SEK')) is not true then raise exception 'Actual broker SEK settlement and known fee required';end if;
        v_sek=(p_draft->>'settlementAmountSek')::numeric;
        v_native=v_amount+case when p_draft->'fee'->>'currency'='SEK' then 0 when p_draft->>'kind'='BUY' then (p_draft->'fee'->>'amount')::numeric else -(p_draft->'fee'->>'amount')::numeric end;
        if p_draft->'fee'->>'currency'='SEK' then v_sek=v_sek+case when p_draft->>'kind'='BUY' then -(p_draft->'fee'->>'amount')::numeric else (p_draft->'fee'->>'amount')::numeric end;end if;
        if v_sek<=0 then raise exception 'Net settlement must be positive';end if;
        if v_native<=0 then raise exception 'Net settlement must be positive';end if;
        v_fx=jsonb_build_object('kind','FX','accountId',p_draft->'accountId','verified',true,'tradeId',p_request_id,
            'fee',jsonb_build_object('amount',0,'currency','SEK'),'settlementEvidence','broker_actual_amount',
            'currency',case when p_draft->>'kind'='BUY' then 'SEK' else p_draft->>'currency' end,
            'amount',case when p_draft->>'kind'='BUY' then v_sek else v_native end,
            'toCurrency',case when p_draft->>'kind'='BUY' then p_draft->>'currency' else 'SEK' end,
            'toAmount',case when p_draft->>'kind'='BUY' then v_native else v_sek end);
    elsif p_draft ? 'settlementAmountSek' then raise exception 'Unexpected SEK settlement';end if;
    if (p_draft->>'kind'='BUY' and p_draft->>'funding' in ('existing_cash','external_money')) is not true and p_draft->>'kind'<>'SELL' then raise exception 'Funding source required'; end if;
    select coalesce(max(sequence)+1,0) into v_sequence from public.portfolio_ledger_events where user_id=v_user and trade_date=v_date;
    if p_draft->>'kind'='BUY' and p_draft->>'funding'='external_money' then
        if p_draft->>'currency'<>'SEK' then raise exception 'Historical external funding FX not enabled';end if;
        if (jsonb_typeof(p_deposit->'amount')='number' and (p_deposit->>'amount')::numeric>0
            and jsonb_typeof(p_deposit->'fxRateToSek')='number' and (p_deposit->>'fxRateToSek')::numeric>0
            and (p_draft->>'currency'<>'SEK' or (p_deposit->>'fxRateToSek')::numeric=1)) is not true then raise exception 'Actual external deposit and historical FX required'; end if;
        if p_deposit->>'occurredAt' is null and p_deposit->>'timingPolicy' is distinct from 'end_of_day_assumption' then raise exception 'Explicit cash-flow timing policy required'; end if;
        if p_deposit->>'occurredAt' is not null and ((p_deposit->>'occurredAt') !~ 'T.*(Z|[+-][0-9]{2}:[0-9]{2})$'
            or ((p_deposit->>'occurredAt')::timestamptz at time zone 'Europe/Stockholm')::date<>v_date
            or (p_deposit->>'occurredAt')::timestamptz>now()) then raise exception 'Deposit timestamp/date mismatch'; end if;
        v_deposit=jsonb_build_object('kind','DEPOSIT','amount',p_deposit->'amount','fxRateToSek',p_deposit->'fxRateToSek',
            'accountId',p_draft->'accountId','currency',p_draft->'currency','date',v_date,'verified',true,'source','synthetic_test',
            'timingPolicy',p_deposit->'timingPolicy','occurredAt',p_deposit->'occurredAt');
        insert into public.portfolio_ledger_events(user_id,event_id,trade_date,sequence,account_key,source,external_reference,event)
            values(v_user,gen_random_uuid(),v_date,v_sequence,p_draft->>'accountId','synthetic_test','funding:'||p_request_id,v_deposit);
        v_sequence=v_sequence+1;
    elsif p_deposit is not null then raise exception 'Unexpected external funding'; end if;
    if v_conversion is true and p_draft->>'kind'='BUY' then
        insert into public.portfolio_ledger_events(user_id,event_id,trade_date,sequence,account_key,source,event)
            values(v_user,gen_random_uuid(),v_date,v_sequence,p_draft->>'accountId','synthetic_test',v_fx);
        v_sequence=v_sequence+1;
    end if;
    v_event=jsonb_build_object('kind',p_draft->'kind','amount',v_amount,'quantity',p_draft->'quantity','unitPrice',p_draft->'unitPrice',
        'accountId',p_draft->'accountId','instrumentId',p_draft->'instrumentId','currency',p_draft->'currency',
        'fee',p_draft->'fee','verified',true,'request',v_request);
    if v_conversion is true then v_event=v_event||jsonb_build_object('settlement','broker_conversion','settlementAmountSek',p_draft->'settlementAmountSek');end if;
    insert into public.portfolio_ledger_events(user_id,event_id,trade_date,sequence,account_key,source,external_reference,event)
        values(v_user,p_request_id,v_date,v_sequence,p_draft->>'accountId','synthetic_test',nullif(p_draft->>'externalReference',''),v_event);
    if v_conversion is true and p_draft->>'kind'='SELL' then
        insert into public.portfolio_ledger_events(user_id,event_id,trade_date,sequence,account_key,source,event)
            values(v_user,gen_random_uuid(),v_date,v_sequence+1,p_draft->>'accountId','synthetic_test',v_fx);
    end if;
    select jsonb_agg(event||jsonb_build_object('date',trade_date,'accountId',account_key) order by trade_date,sequence) into v_events
        from public.portfolio_ledger_events where user_id=v_user;
    v_state=public.replay_staging_performance_ledger(b.baseline,v_events);
    update public.portfolio_performance_baselines set ledger_state=v_state,cash_flow_coverage=b.cash_flow_coverage,cost_coverage=b.cost_coverage
        where user_id=v_user returning revision into v_final_revision;
    return jsonb_build_object('revision',v_final_revision,'ledgerState',v_state,'duplicate',false);
end $$;
revoke all on function public.register_staging_trade_for_owner(uuid,jsonb,uuid,bigint,jsonb) from public,anon,authenticated,service_role;
create function public.register_staging_portfolio_trade(p_draft jsonb,p_request_id uuid,p_expected_revision bigint,p_deposit jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
    return public.register_staging_trade_for_owner(auth.uid(),p_draft,p_request_id,p_expected_revision,p_deposit);
end $$;
revoke all on function public.register_staging_portfolio_trade(jsonb,uuid,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.register_staging_portfolio_trade(jsonb,uuid,bigint,jsonb) to authenticated;

create function public.publish_staging_performance_observations(p_user_id uuid,p_revision bigint,p_observations jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare b public.portfolio_performance_baselines%rowtype;o jsonb;
begin
    perform public.require_staging_performance_test();
    perform public.require_staging_synthetic_user(p_user_id);
    select * into b from public.portfolio_performance_baselines where user_id=p_user_id for update;
    if not found or b.revision is distinct from p_revision then raise exception 'Revision changed during valuation' using errcode='40001'; end if;
    if b.cash_flow_coverage<>'complete' or b.cost_coverage<>'complete' then raise exception 'Incomplete journal coverage'; end if;
    if jsonb_typeof(p_observations) is distinct from 'array' or jsonb_array_length(p_observations)=0 then raise exception 'Observation batch required'; end if;
    for o in select * from jsonb_array_elements(p_observations) loop
        if (o->>'source'='synthetic_test' and o->>'verified'='true' and o->>'finalized'='true'
            and o->>'coverage'='complete' and (o->>'revision')::bigint=p_revision
            and (o->>'date')::date>(b.baseline->>'date')::date and (o->>'date')::date<current_date
            and jsonb_typeof(o->'valueSek')='number' and (o->>'valueSek')::numeric>=0
            and ((o->>'asOf')::timestamptz at time zone 'Europe/Stockholm')::date=(o->>'date')::date
            and ((o->>'asOf')::timestamptz at time zone 'Europe/Stockholm')::time>=time '23:30') is not true then raise exception 'Invalid finalized observation'; end if;
        insert into public.portfolio_performance_observations(user_id,valuation_date,revision,observation)
            values(p_user_id,(o->>'date')::date,p_revision,o);
    end loop;
end $$;
revoke all on function public.publish_staging_performance_observations(uuid,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.publish_staging_performance_observations(uuid,bigint,jsonb) to service_role;

create function public.get_staging_performance_environment() returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
    perform public.require_staging_performance_test();
    return jsonb_build_object('environment','portfolio-performance-staging','syntheticOnly',true,'projectRef','vutjthqlgzokeylaxpzp','runtimeVersion','staging-runtime-v1');
end $$;
revoke all on function public.get_staging_performance_environment() from public,anon,authenticated,service_role;
grant execute on function public.get_staging_performance_environment() to anon,authenticated,service_role;

create or replace function public.get_portfolio_performance_input() returns jsonb
language sql stable security invoker set search_path='' as $$
    select jsonb_build_object('apiVersion','portfolio-performance-v1','baseline',b.baseline,'ledgerState',b.ledger_state,
        'revision',b.revision,'cashFlowCoverage',b.cash_flow_coverage,'costCoverage',b.cost_coverage,'convention',b.convention,'returnBasis',b.return_basis,
        'events',coalesce((select jsonb_agg(e.event||jsonb_build_object('id',e.event_id,'date',e.trade_date,'sequence',e.sequence,
            'accountId',e.account_key,'source',e.source,'externalReference',e.external_reference) order by e.trade_date,e.sequence)
            from public.portfolio_ledger_events e where e.user_id=b.user_id),'[]'::jsonb),
        'observations',coalesce((select jsonb_agg(o.observation||jsonb_build_object('date',o.valuation_date,'revision',o.revision) order by o.valuation_date)
            from public.portfolio_performance_observations o where o.user_id=b.user_id and o.revision=b.revision),'[]'::jsonb))
    from public.portfolio_performance_baselines b where b.user_id=(select auth.uid());
$$;




do $$ begin perform public.require_staging_performance_test(); end $$;
create table public.staging_performance_imports (
    user_id uuid not null references public.portfolio_performance_baselines(user_id),
    import_key text not null, kind text not null, payload jsonb not null, result jsonb not null,
    created_at timestamptz not null default now(),primary key(user_id,import_key)
);
create table public.staging_performance_runs (
    user_id uuid not null references public.portfolio_performance_baselines(user_id),
    revision bigint not null, valuation_date date not null,status text not null check(status in ('saved','failed','superseded')),
    reason text, attempted_at timestamptz not null default now(),primary key(user_id,revision,valuation_date)
);
create table public.staging_performance_market_cache (
    cache_key text primary key, observation jsonb not null, created_at timestamptz not null default now()
);
create table public.staging_performance_corrections (
    user_id uuid not null references public.portfolio_performance_baselines(user_id), request_id uuid not null,
    event_id uuid not null,revision bigint not null,previous_event jsonb not null,patch jsonb not null,
    created_at timestamptz not null default now(),primary key(user_id,request_id)
);
alter table public.staging_performance_imports enable row level security;
alter table public.staging_performance_runs enable row level security;
alter table public.staging_performance_market_cache enable row level security;
alter table public.staging_performance_corrections enable row level security;
revoke all on public.staging_performance_imports,public.staging_performance_runs,public.staging_performance_market_cache,public.staging_performance_corrections from public,anon,authenticated;
grant all on public.staging_performance_imports,public.staging_performance_runs,public.staging_performance_market_cache,public.staging_performance_corrections to service_role;
grant select on public.staging_performance_imports,public.staging_performance_runs,public.staging_performance_corrections to authenticated;
create policy local_import_owner on public.staging_performance_imports for select to authenticated using(auth.uid()=user_id);
create policy local_run_owner on public.staging_performance_runs for select to authenticated using(auth.uid()=user_id);
create policy local_correction_owner on public.staging_performance_corrections for select to authenticated using(auth.uid()=user_id);

create function public.get_staging_performance_worker_input(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
    perform public.require_staging_performance_test();
    perform public.require_staging_synthetic_user(p_user_id);
    return (select jsonb_build_object('apiVersion','portfolio-performance-v1','baseline',b.baseline,'ledgerState',b.ledger_state,
        'revision',b.revision,'cashFlowCoverage',b.cash_flow_coverage,'costCoverage',b.cost_coverage,'convention',b.convention,'returnBasis',b.return_basis,
        'events',coalesce((select jsonb_agg(e.event||jsonb_build_object('id',e.event_id,'date',e.trade_date,'sequence',e.sequence,
            'accountId',e.account_key,'source',e.source,'externalReference',e.external_reference) order by e.trade_date,e.sequence)
            from public.portfolio_ledger_events e where e.user_id=b.user_id),'[]'::jsonb),
        'observations',coalesce((select jsonb_agg(o.observation||jsonb_build_object('date',o.valuation_date,'revision',o.revision) order by o.valuation_date)
            from public.portfolio_performance_observations o where o.user_id=b.user_id and o.revision=b.revision),'[]'::jsonb))
        from public.portfolio_performance_baselines b where b.user_id=p_user_id);
end $$;
revoke all on function public.get_staging_performance_worker_input(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_staging_performance_worker_input(uuid) to service_role;

create function public.commit_staging_performance_import(p_user_id uuid,p_import_key text,p_plan jsonb,p_revision bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.portfolio_performance_baselines%rowtype; saved public.staging_performance_imports%rowtype;
    v_baseline jsonb;v_state jsonb;v_value numeric;e jsonb;old public.portfolio_ledger_events%rowtype;v_result jsonb;v_inserted integer=0;v_skipped integer=0;v_events jsonb;
begin
    perform public.require_staging_performance_test();
    perform public.require_staging_synthetic_user(p_user_id);
    if p_import_key is null or length(p_import_key)<>64 or p_plan->>'source' is distinct from 'synthetic_test' then raise exception 'Synthetic import evidence required'; end if;
    -- Serialize first imports as well as reimports before the baseline row exists.
    perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
    select * into saved from public.staging_performance_imports where user_id=p_user_id and import_key=p_import_key;
    if found then
        if saved.payload is distinct from p_plan then raise exception 'Import evidence reused with different reconciliation';end if;
        return saved.result||jsonb_build_object('duplicate',true);
    end if;
    select * into b from public.portfolio_performance_baselines where user_id=p_user_id for update;
    if not found then
        if p_plan->>'kind'<>'opening' or p_plan->>'ready'<>'true' then raise exception 'Complete opening import required';end if;
        perform public.validate_staging_opening(p_plan);
        v_baseline=p_plan||jsonb_build_object('verified',true,'coverage','complete','finalized',true);
        v_state=public.replay_staging_performance_ledger(v_baseline,'[]');
        if ((v_baseline->>'date')::date<(now() at time zone 'Europe/Stockholm')::date
            and ((v_baseline->>'asOf')::timestamptz at time zone 'Europe/Stockholm')::date=(v_baseline->>'date')::date
            and ((v_baseline->>'asOf')::timestamptz at time zone 'Europe/Stockholm')::time>=time '23:30') is not true then raise exception 'Opening statement date required'; end if;
        select sum((a->>'quantity')::numeric*(a->>'price')::numeric*(a->>'fxRateToSek')::numeric) into v_value from jsonb_array_elements(v_baseline->'positions') a;
        select coalesce(v_value,0)+sum((a->>'amount')::numeric*(a->>'fxRateToSek')::numeric) into v_value from jsonb_array_elements(v_baseline->'cash') a;
        if v_value is null or v_value<=0 then raise exception 'Verified opening value required';end if;
        for e in select * from jsonb_array_elements((v_baseline->'positions')||(v_baseline->'cash')) loop
            if (jsonb_typeof(e->'fxRateToSek')='number' and (e->>'fxRateToSek')::numeric>0 and (e->>'currency'<>'SEK' or (e->>'fxRateToSek')::numeric=1)) is not true then raise exception 'Historical opening FX required';end if;
            if e ? 'quantity' and (jsonb_typeof(e->'price')='number' and (e->>'price')::numeric>0) is not true then raise exception 'Verified opening price required';end if;
        end loop;
        v_baseline=v_baseline||jsonb_build_object('valueSek',v_value);
        insert into public.portfolio_performance_baselines(user_id,baseline,ledger_state,cash_flow_coverage,cost_coverage)
            values(p_user_id,v_baseline,v_state,'complete','complete');
        v_result=jsonb_build_object('revision',0,'initialized',true,'valueSek',v_value);
    else
        if p_revision is distinct from b.revision then raise exception 'Reload before import' using errcode='40001';end if;
        if p_plan->>'kind'='transactions' then
            -- No JWT claim changes: use the private explicit-owner trade helper.
            for e in select * from jsonb_array_elements(p_plan->'events') loop
                if nullif(e->>'externalReference','') is null then raise exception 'Stable transaction reference required';end if;
                select * into old from public.portfolio_ledger_events where user_id=p_user_id and account_key=e->>'accountId' and source='synthetic_test' and external_reference=e->>'externalReference';
                if found then
                    if old.trade_date<>(e->>'date')::date or old.event->'kind' is distinct from e->'kind' or old.event->'quantity' is distinct from e->'quantity'
                        or old.event->'unitPrice' is distinct from e->'unitPrice' or old.event->'fee' is distinct from e->'fee'
                        or old.event->'instrumentId' is distinct from e->'instrumentId' or old.event->'currency' is distinct from e->'currency' then raise exception 'Transaction reference conflict; reconcile original statement';end if;
                    v_skipped=v_skipped+1;
                else
                    if e->>'matchEventId' is not null then
                        select * into old from public.portfolio_ledger_events where user_id=p_user_id and event_id=(e->>'matchEventId')::uuid and external_reference is null;
                        if not found or old.trade_date<>(e->>'date')::date or old.event->'kind' is distinct from e->'kind' or old.event->'quantity' is distinct from e->'quantity'
                            or old.event->'unitPrice' is distinct from e->'unitPrice' or old.event->'fee' is distinct from e->'fee' or old.account_key is distinct from e->>'accountId'
                            or old.event->'instrumentId' is distinct from e->'instrumentId' or old.event->'currency' is distinct from e->'currency' then raise exception 'Manual trade match changed; reconcile before import';end if;
                        update public.portfolio_ledger_events set external_reference=e->>'externalReference',event=event||jsonb_build_object('manualImportReference',e->>'externalReference') where user_id=p_user_id and event_id=old.event_id;
                        update public.portfolio_performance_baselines set cash_flow_coverage=b.cash_flow_coverage,cost_coverage=b.cost_coverage where user_id=p_user_id;
                        v_skipped=v_skipped+1;
                    else
                        if e->>'matchPolicy' is distinct from 'new_trade' and exists(select 1 from public.portfolio_ledger_events a where a.user_id=p_user_id and a.external_reference is null
                            and a.trade_date=(e->>'date')::date and a.account_key=e->>'accountId' and a.event->'kind'=e->'kind' and a.event->'quantity'=e->'quantity'
                            and a.event->'unitPrice'=e->'unitPrice' and a.event->'fee'=e->'fee' and a.event->'instrumentId'=e->'instrumentId' and a.event->'currency'=e->'currency') then raise exception 'Confirm potentially duplicated manual trade';end if;
                        perform public.register_staging_trade_for_owner(p_user_id,e,gen_random_uuid(),b.revision,null);
                        v_inserted=v_inserted+1;
                    end if;
                    select * into b from public.portfolio_performance_baselines where user_id=p_user_id;
                end if;
            end loop;
        elsif p_plan->>'kind'='opening' then
            if (p_plan->>'date')::date<(b.baseline->>'date')::date then raise exception 'Statement predates opening';end if;
            select coalesce(jsonb_agg(event||jsonb_build_object('date',trade_date,'accountId',account_key) order by trade_date,sequence),'[]') into v_events
                from public.portfolio_ledger_events where user_id=p_user_id and trade_date<=(p_plan->>'date')::date;
            v_state=public.replay_staging_performance_ledger(b.baseline,v_events);
            for e in select * from jsonb_array_elements(p_plan->'positions') loop
                if not exists(select 1 from jsonb_array_elements(v_state->'positions') a where a->>'accountId'=e->>'accountId' and a->>'instrumentId'=e->>'instrumentId'
                    and abs((a->>'quantity')::numeric-(e->>'quantity')::numeric)<0.00000001) then raise exception 'Holdings differ from journal; register missing trades';end if;
            end loop;
            for e in select * from jsonb_array_elements(v_state->'positions') loop
                if (e->>'quantity')::numeric>0 and exists(select 1 from jsonb_array_elements(p_plan->'cash') c where c->>'accountId'=e->>'accountId')
                    and not exists(select 1 from jsonb_array_elements(p_plan->'positions') a where a->>'accountId'=e->>'accountId' and a->>'instrumentId'=e->>'instrumentId') then raise exception 'Statement omits journal holdings';end if;
            end loop;
            for e in select * from jsonb_array_elements(p_plan->'cash') loop
                if not exists(select 1 from jsonb_array_elements(v_state->'cash') a where a->>'accountId'=e->>'accountId' and a->>'currency'=e->>'currency'
                    and abs((a->>'amount')::numeric-(e->>'amount')::numeric)<0.00000001) then raise exception 'Cash differs from journal; reconcile account statement';end if;
            end loop;
        else raise exception 'Unsupported import';end if;
        v_result=jsonb_build_object('revision',b.revision,'inserted',v_inserted,'skipped',v_skipped,'reconciled',true);
    end if;
    insert into public.staging_performance_imports(user_id,import_key,kind,payload,result) values(p_user_id,p_import_key,p_plan->>'kind',p_plan,v_result);
    return v_result;
end $$;
revoke all on function public.commit_staging_performance_import(uuid,text,jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function public.commit_staging_performance_import(uuid,text,jsonb,bigint) to service_role;

create function public.correct_staging_portfolio_trade(p_event_id uuid,p_patch jsonb,p_request_id uuid,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid=auth.uid();b public.portfolio_performance_baselines%rowtype;e public.portfolio_ledger_events%rowtype;a public.staging_performance_corrections%rowtype;
    v_event jsonb;v_date date;v_events jsonb;v_state jsonb;v_revision bigint;
    f public.portfolio_ledger_events%rowtype;v_fx jsonb;v_native numeric;v_sequence integer;v_previous jsonb;
begin
    perform public.require_staging_performance_test();if v_user is null then raise exception 'Authentication required';end if;
    select * into b from public.portfolio_performance_baselines where user_id=v_user for update;if not found then raise exception 'Opening required';end if;
    select * into a from public.staging_performance_corrections where user_id=v_user and request_id=p_request_id;
    if found then if a.event_id<>p_event_id or a.patch is distinct from p_patch then raise exception 'Correction id conflict';end if;return jsonb_build_object('revision',b.revision,'duplicate',true);end if;
    if p_expected_revision is distinct from b.revision then raise exception 'Revision changed' using errcode='40001';end if;
    select * into e from public.portfolio_ledger_events where user_id=v_user and event_id=p_event_id;
    if not found or e.event->>'kind' not in ('BUY','SELL') then raise exception 'Own trade required';end if;
    if exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('date','quantity','unitPrice','fee','settlementAmountSek')) then raise exception 'Unsupported correction field';end if;
    v_previous=to_jsonb(e);
    v_event=e.event||p_patch;
    v_date=coalesce((p_patch->>'date')::date,e.trade_date);
    if v_date<=(b.baseline->>'date')::date or v_date>(now() at time zone 'Europe/Stockholm')::date then raise exception 'Correction date outside history';end if;
    if (jsonb_typeof(v_event->'quantity')='number' and (v_event->>'quantity')::numeric>0 and jsonb_typeof(v_event->'unitPrice')='number' and (v_event->>'unitPrice')::numeric>0) is not true then raise exception 'Invalid corrected quantity or price';end if;
    v_event=(v_event-'date')||jsonb_build_object('amount',(v_event->>'quantity')::numeric*(v_event->>'unitPrice')::numeric);
    if e.event->>'settlement'='broker_conversion' then
        if (jsonb_typeof(p_patch->'settlementAmountSek')='number' and (p_patch->>'settlementAmountSek')::numeric>0
            and jsonb_typeof(v_event->'fee'->'amount')='number' and (v_event->'fee'->>'amount')::numeric>=0
            and v_event->'fee'->>'currency' in (v_event->>'currency','SEK')) is not true then raise exception 'Confirm corrected actual broker SEK settlement';end if;
        select * into strict f from public.portfolio_ledger_events where user_id=v_user and event->>'tradeId'=p_event_id::text and event->>'kind'='FX';
        v_native=(v_event->>'amount')::numeric+case when v_event->'fee'->>'currency'='SEK' then 0 when v_event->>'kind'='BUY' then (v_event->'fee'->>'amount')::numeric else -(v_event->'fee'->>'amount')::numeric end;
        if v_native<=0 then raise exception 'Net settlement must be positive';end if;
        v_fx=f.event||jsonb_build_object('amount',case when v_event->>'kind'='BUY' then (p_patch->>'settlementAmountSek')::numeric else v_native end,
            'toAmount',case when v_event->>'kind'='BUY' then v_native else (p_patch->>'settlementAmountSek')::numeric end);
        if v_event->'fee'->>'currency'='SEK' then
            if v_event->>'kind'='BUY' then v_fx=jsonb_set(v_fx,'{amount}',to_jsonb((p_patch->>'settlementAmountSek')::numeric-(v_event->'fee'->>'amount')::numeric));
            else v_fx=jsonb_set(v_fx,'{toAmount}',to_jsonb((p_patch->>'settlementAmountSek')::numeric+(v_event->'fee'->>'amount')::numeric));end if;
        end if;
        if (v_fx->>'amount')::numeric<=0 then raise exception 'Net settlement must be positive';end if;
        v_sequence=case when v_date=e.trade_date then least(e.sequence,f.sequence) else
            (select coalesce(max(sequence)+1,0) from public.portfolio_ledger_events where user_id=v_user and trade_date=v_date) end;
        update public.portfolio_ledger_events set event=v_fx,trade_date=v_date,
            sequence=v_sequence+case when v_event->>'kind'='BUY' then 0 else 1 end where user_id=v_user and event_id=f.event_id;
        v_previous=v_previous||jsonb_build_object('linkedFx',to_jsonb(f));
    elsif p_patch ? 'settlementAmountSek' then raise exception 'Unexpected SEK settlement';end if;
    update public.portfolio_ledger_events set event=v_event,trade_date=v_date,
        sequence=case when f.event_id is not null then v_sequence+case when v_event->>'kind'='BUY' then 1 else 0 end
            when v_date=e.trade_date then e.sequence else (select coalesce(max(sequence)+1,0) from public.portfolio_ledger_events where user_id=v_user and trade_date=v_date) end
        where user_id=v_user and event_id=p_event_id;
    select coalesce(jsonb_agg(event||jsonb_build_object('date',trade_date,'accountId',account_key) order by trade_date,sequence),'[]') into v_events from public.portfolio_ledger_events where user_id=v_user;
    v_state=public.replay_staging_performance_ledger(b.baseline,v_events);
    update public.portfolio_performance_baselines set ledger_state=v_state,cash_flow_coverage=b.cash_flow_coverage,cost_coverage=b.cost_coverage where user_id=v_user returning revision into v_revision;
    insert into public.staging_performance_corrections(user_id,request_id,event_id,revision,previous_event,patch) values(v_user,p_request_id,p_event_id,v_revision,v_previous,p_patch);
    return jsonb_build_object('revision',v_revision,'ledgerState',v_state);
end $$;
revoke all on function public.correct_staging_portfolio_trade(uuid,jsonb,uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.correct_staging_portfolio_trade(uuid,jsonb,uuid,bigint) to authenticated;
create function public.publish_staging_history_batch(p_user_id uuid,p_revision bigint,p_observations jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare b public.portfolio_performance_baselines%rowtype;o jsonb;old jsonb;missing jsonb='[]';
begin
    perform public.require_staging_performance_test();
    perform public.require_staging_synthetic_user(p_user_id);
    -- Same lock order as source collection: market archive, then portfolio.
    perform pg_advisory_xact_lock(hashtextextended('staging-synthetic-market-archive',0));
    select * into b from public.portfolio_performance_baselines where user_id=p_user_id for update;
    if not found or b.revision is distinct from p_revision then raise exception 'History revision changed' using errcode='40001';end if;
    if b.baseline->>'sourceReconciliationRequired'='true' then raise exception 'Opening source reconciliation required';end if;
    for o in select * from jsonb_array_elements(p_observations) loop
        if exists(select 1 from jsonb_array_elements(o->'priceSources') q
            join public.staging_performance_market_cache m on m.cache_key='archive:price:'||(q->>'instrumentId')||':'||(q->>'currency')||':'||(q->>'date')
            where q->'price' is distinct from m.observation->'price') then raise exception 'Market source revision changed' using errcode='40001';end if;
        select observation into old from public.portfolio_performance_observations where user_id=p_user_id and revision=p_revision and valuation_date=(o->>'date')::date;
        if found then if old is distinct from o then raise exception 'Immutable history conflict';end if;
        else missing=missing||jsonb_build_array(o);end if;
    end loop;
    if jsonb_array_length(missing)>0 then perform public.publish_staging_performance_observations(p_user_id,p_revision,missing);end if;
    for o in select * from jsonb_array_elements(p_observations) loop
        insert into public.staging_performance_runs(user_id,revision,valuation_date,status) values(p_user_id,p_revision,(o->>'date')::date,'saved')
            on conflict(user_id,revision,valuation_date) do update set status='saved',reason=null,attempted_at=now();
    end loop;
end $$;
revoke all on function public.publish_staging_history_batch(uuid,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.publish_staging_history_batch(uuid,bigint,jsonb) to service_role;




do $$ begin perform public.require_staging_performance_test();end $$;
create function public.register_staging_portfolio_cash(p_draft jsonb,p_request_id uuid,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid=auth.uid();b public.portfolio_performance_baselines%rowtype;e jsonb;old jsonb;v_date date;v_sequence integer;v_events jsonb;v_state jsonb;v_revision bigint;
begin
    perform public.require_staging_performance_test();if v_user is null then raise exception 'Authentication required';end if;
    select * into b from public.portfolio_performance_baselines where user_id=v_user for update;if not found then raise exception 'Opening required';end if;
    select event->'request' into old from public.portfolio_ledger_events where user_id=v_user and event_id=p_request_id;
    if found then if old is distinct from p_draft then raise exception 'Request reused with different cash event';end if;return jsonb_build_object('revision',b.revision,'duplicate',true);end if;
    if p_expected_revision is distinct from b.revision then raise exception 'Revision changed' using errcode='40001';end if;
    v_date=(p_draft->>'date')::date;
    if (p_draft->>'kind' in ('DEPOSIT','WITHDRAWAL','DIVIDEND','INTEREST','FEE') and jsonb_typeof(p_draft->'amount')='number'
        and (p_draft->>'amount')::numeric>0 and v_date>(b.baseline->>'date')::date and v_date<=(now() at time zone 'Europe/Stockholm')::date) is not true then raise exception 'Invalid cash event';end if;
    if not exists(select 1 from jsonb_array_elements(b.baseline->'cash') a where a->>'accountId'=p_draft->>'accountId' and a->>'currency'=p_draft->>'currency') then raise exception 'Known cash account required';end if;
    -- Only SEK external flows are enabled until their actual historical FX is server-certified.
    if p_draft->>'kind' in ('DEPOSIT','WITHDRAWAL') then
        if p_draft->>'currency'<>'SEK' then raise exception 'Historical cash-flow FX not enabled';end if;
        if p_draft->>'occurredAt' is not null then
            if ((p_draft->>'occurredAt') ~ 'T.*(Z|[+-][0-9]{2}:[0-9]{2})$' and ((p_draft->>'occurredAt')::timestamptz at time zone 'Europe/Stockholm')::date=v_date
                and (p_draft->>'occurredAt')::timestamptz<=now()) is not true then raise exception 'Cash-flow timestamp invalid';end if;
        elsif p_draft->>'timingPolicy' is distinct from 'end_of_day_assumption' then raise exception 'Confirm cash-flow timing';end if;
    end if;
    select coalesce(max(sequence)+1,0) into v_sequence from public.portfolio_ledger_events where user_id=v_user and trade_date=v_date;
    e=jsonb_build_object('kind',p_draft->'kind','amount',p_draft->'amount','currency',p_draft->'currency','accountId',p_draft->'accountId',
        'occurredAt',p_draft->'occurredAt','timingPolicy',p_draft->'timingPolicy','fxRateToSek',1,'verified',true,'request',p_draft);
    insert into public.portfolio_ledger_events(user_id,event_id,trade_date,sequence,account_key,source,event)
        values(v_user,p_request_id,v_date,v_sequence,p_draft->>'accountId','synthetic_test',e);
    select coalesce(jsonb_agg(event||jsonb_build_object('date',trade_date,'accountId',account_key) order by trade_date,sequence),'[]') into v_events from public.portfolio_ledger_events where user_id=v_user;
    v_state=public.replay_staging_performance_ledger(b.baseline,v_events);
    update public.portfolio_performance_baselines set ledger_state=v_state,cash_flow_coverage=b.cash_flow_coverage,cost_coverage=b.cost_coverage where user_id=v_user returning revision into v_revision;
    return jsonb_build_object('revision',v_revision,'ledgerState',v_state);
end $$;
revoke all on function public.register_staging_portfolio_cash(jsonb,uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.register_staging_portfolio_cash(jsonb,uuid,bigint) to authenticated;




select public.require_staging_performance_test();
create or replace function public.archive_staging_market_batch(p_points jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p jsonb; previous jsonb; stable jsonb; k text; changes jsonb='[]'; users_changed integer=0;
    inserted integer=0; unchanged integer=0; corrected integer=0; seen text[]='{}';
begin
    perform public.require_staging_performance_test();
    if jsonb_typeof(p_points) is distinct from 'array' or jsonb_array_length(p_points)>500 then raise exception 'Invalid market batch';end if;
    perform pg_advisory_xact_lock(hashtextextended('staging-synthetic-market-archive',0));
    for p in select * from jsonb_array_elements(p_points) loop
        if (p->>'source'='synthetic_test' and p->'verified'='true'::jsonb
            and p->>'instrumentId' in ('synthetic-sek-equity','synthetic-us-equity','synthetic-nordnet-equity','synthetic-fund','synthetic-lysa-fund','synthetic-certificate')
            and p->>'currency'=case when p->>'instrumentId'='synthetic-us-equity' then 'USD' else 'SEK' end
            and p->>'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            and (p->>'date')::date<=(now() at time zone 'Europe/Stockholm')::date
            and jsonb_typeof(p->'price')='number' and (p->>'price')::numeric>0) is not true then
            raise exception 'Verified synthetic market evidence required';end if;
        -- Retain only public source evidence. A caller cannot put private portfolio fields in this cache.
        stable=jsonb_build_object('instrumentId',p->'instrumentId','currency',p->'currency','date',p->'date',
            'price',p->'price','source','synthetic_test','verified',true);
        k='archive:price:'||(p->>'instrumentId')||':'||(p->>'currency')||':'||(p->>'date');
        if k=any(seen) then raise exception 'Duplicate market source date';end if;seen=array_append(seen,k);
        select observation into previous from public.staging_performance_market_cache where cache_key=k;
        if found and previous=stable then unchanged=unchanged+1;continue;end if;
        if previous is null then inserted=inserted+1;
        else corrected=corrected+1;changes=changes||jsonb_build_array(stable);end if;
        insert into public.staging_performance_market_cache(cache_key,observation)
            values(k||':version:'||md5(stable::text),stable) on conflict(cache_key) do nothing;
        insert into public.staging_performance_market_cache(cache_key,observation) values(k,stable)
            on conflict(cache_key) do update set observation=excluded.observation,created_at=now();
    end loop;
    if corrected>0 then
        -- Derived valuation-date caches must not hide a corrected source point, including weekend carry.
        delete from public.staging_performance_market_cache where cache_key like 'synthetic_test:price:%';
        with affected as (
            select distinct b.user_id from public.portfolio_performance_baselines b
            where exists(select 1 from jsonb_array_elements(changes) c
                where exists(select 1 from public.portfolio_performance_observations o,
                    jsonb_array_elements(o.observation->'priceSources') q
                    where o.user_id=b.user_id and o.revision=b.revision
                    and q->>'instrumentId'=c->>'instrumentId' and q->>'currency'=c->>'currency' and q->>'date'=c->>'date')
                or exists(select 1 from jsonb_array_elements(b.baseline->'priceSources') q
                    where q->>'instrumentId'=c->>'instrumentId' and q->>'currency'=c->>'currency' and q->>'date'=c->>'date'))
        )
        update public.portfolio_performance_baselines b set revision=revision+1,
            baseline=case when exists(select 1 from jsonb_array_elements(changes) c,jsonb_array_elements(b.baseline->'priceSources') q
                where q->>'instrumentId'=c->>'instrumentId' and q->>'currency'=c->>'currency' and q->>'date'=c->>'date')
                then b.baseline||jsonb_build_object('sourceReconciliationRequired',true) else b.baseline end
            from affected a where b.user_id=a.user_id;
        get diagnostics users_changed=row_count;
    end if;
    return jsonb_build_object('inserted',inserted,'unchanged',unchanged,'corrected',corrected,'revisedPortfolios',users_changed);
end $$;
revoke all on function public.archive_staging_market_batch(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.archive_staging_market_batch(jsonb) to service_role;



revoke all on function public.get_portfolio_performance_input() from public,anon,authenticated,service_role;
grant execute on function public.get_portfolio_performance_input() to authenticated;

notify pgrst,'reload schema';
commit;
