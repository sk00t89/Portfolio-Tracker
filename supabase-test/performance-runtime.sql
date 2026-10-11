-- ISOLATED LOCAL TEST ONLY. Requires the approved three-table proposal first.
-- The execution helper verifies Docker container identity and local DB port.
begin;
do $$ begin
    if current_setting('portfolio_tracker.test_only',true) is distinct from 'true' then
        raise exception 'Local performance test environment required';
    end if;
end $$;

alter table public.portfolio_performance_baselines add column ledger_state jsonb not null default '{"cash":[],"positions":[]}'::jsonb;

create function public.require_local_performance_test() returns void
language plpgsql stable set search_path='' as $$ begin
    if current_setting('portfolio_tracker.test_only',true) is distinct from 'true' then raise exception 'Local test only'; end if;
end $$;
revoke all on function public.require_local_performance_test() from public,anon,authenticated;

create function public.local_cash_delta(p_state jsonb,p_account text,p_currency text,p_delta numeric) returns jsonb
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
revoke all on function public.local_cash_delta(jsonb,text,text,numeric) from public,anon,authenticated;

create function public.replay_local_performance_ledger(p_baseline jsonb,p_events jsonb) returns jsonb
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
            v_state=public.local_cash_delta(v_state,v_account,v_currency,case when v_kind='BUY' then -v_amount else v_amount end);
        elsif v_kind='FX' then
            if (e->>'toCurrency' ~ '^[A-Z]{3}$' and e->>'toCurrency'<>v_currency and jsonb_typeof(e->'toAmount')='number'
                and (e->>'toAmount')::numeric>0) is not true then raise exception 'Invalid FX exchange'; end if;
            v_state=public.local_cash_delta(v_state,v_account,v_currency,-v_amount);
            v_state=public.local_cash_delta(v_state,v_account,e->>'toCurrency',(e->>'toAmount')::numeric);
        elsif v_kind='TRANSFER' then
            if (length(e->>'toAccountId')>0 and e->>'toAccountId'<>v_account) is not true then raise exception 'Invalid internal transfer'; end if;
            v_state=public.local_cash_delta(v_state,v_account,v_currency,-v_amount);
            v_state=public.local_cash_delta(v_state,e->>'toAccountId',v_currency,v_amount);
        elsif v_kind in ('DEPOSIT','WITHDRAWAL','DIVIDEND','INTEREST','FEE') then
            v_state=public.local_cash_delta(v_state,v_account,v_currency,case when v_kind in ('WITHDRAWAL','FEE') then -v_amount else v_amount end);
        else raise exception 'Unsupported journal event'; end if;
        if v_kind in ('BUY','SELL','FX') then
            if (jsonb_typeof(e->'fee'->'amount')='number' and (e->'fee'->>'amount')::numeric>=0
                and e->'fee'->>'currency' ~ '^[A-Z]{3}$') is not true then raise exception 'Unknown transaction fee'; end if;
        end if;
        if e->'fee' is not null and e->'fee'<>'null'::jsonb then
            v_state=public.local_cash_delta(v_state,v_account,e->'fee'->>'currency',-(e->'fee'->>'amount')::numeric);
        end if;
    end loop;
    return v_state;
end $$;
revoke all on function public.replay_local_performance_ledger(jsonb,jsonb) from public,anon,authenticated;

create function public.initialize_local_performance_portfolio(p_baseline jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid=auth.uid();v_state jsonb;v_baseline jsonb;v_value numeric=0;e jsonb;v_rate numeric;
begin
    perform public.require_local_performance_test();
    if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
    if (p_baseline->>'source'='synthetic_test' and (p_baseline->>'date')::date<current_date
        and (p_baseline->>'asOf')::timestamptz at time zone 'Europe/Stockholm' >= ((p_baseline->>'date')::date+time '23:30')
        and ((p_baseline->>'asOf')::timestamptz at time zone 'Europe/Stockholm')::date=(p_baseline->>'date')::date) is not true then
        raise exception 'Only complete synthetic local closing imports are allowed'; end if;
    v_state=public.replay_local_performance_ledger(p_baseline,'[]'::jsonb);
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
revoke all on function public.initialize_local_performance_portfolio(jsonb) from public,anon;
grant execute on function public.initialize_local_performance_portfolio(jsonb) to authenticated;

create function public.register_local_portfolio_trade(p_draft jsonb,p_request_id uuid,p_expected_revision bigint,p_deposit jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid=auth.uid();b public.portfolio_performance_baselines%rowtype;v_date date;v_sequence integer;v_event jsonb;
    v_events jsonb;v_state jsonb;v_existing jsonb;v_request jsonb;v_amount numeric;v_deposit jsonb;v_final_revision bigint;
    v_fx jsonb;v_native numeric;v_sek numeric;v_conversion boolean;
begin
    perform public.require_local_performance_test();
    if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
    select * into b from public.portfolio_performance_baselines where user_id=v_user for update;
    if not found then raise exception 'Opening balance required'; end if;
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
    v_state=public.replay_local_performance_ledger(b.baseline,v_events);
    update public.portfolio_performance_baselines set ledger_state=v_state,cash_flow_coverage=b.cash_flow_coverage,cost_coverage=b.cost_coverage
        where user_id=v_user returning revision into v_final_revision;
    return jsonb_build_object('revision',v_final_revision,'ledgerState',v_state,'duplicate',false);
end $$;
revoke all on function public.register_local_portfolio_trade(jsonb,uuid,bigint,jsonb) from public,anon;
grant execute on function public.register_local_portfolio_trade(jsonb,uuid,bigint,jsonb) to authenticated;

-- A service-only atomic batch prevents partial recalc from appearing in reads.
create function public.publish_local_performance_observations(p_user_id uuid,p_revision bigint,p_observations jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare b public.portfolio_performance_baselines%rowtype;o jsonb;
begin
    perform public.require_local_performance_test();
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
revoke all on function public.publish_local_performance_observations(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.publish_local_performance_observations(uuid,bigint,jsonb) to service_role;

create function public.get_local_performance_environment() returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
    perform public.require_local_performance_test();
    return jsonb_build_object('environment','portfolio-performance-local-test','syntheticOnly',true);
end $$;
revoke all on function public.get_local_performance_environment() from public;
grant execute on function public.get_local_performance_environment() to anon,authenticated,service_role;

-- Add current derived state without changing the original opening balance.
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
notify pgrst,'reload schema';
commit;
