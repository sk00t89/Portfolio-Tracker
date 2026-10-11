-- LOCAL ONLY. Adds import receipts, retry status, shared market cache and correction audit.
begin;
do $$ begin perform public.require_local_performance_test(); end $$;
create table public.local_performance_imports (
    user_id uuid not null references public.portfolio_performance_baselines(user_id),
    import_key text not null, kind text not null, payload jsonb not null, result jsonb not null,
    created_at timestamptz not null default now(),primary key(user_id,import_key)
);
create table public.local_performance_runs (
    user_id uuid not null references public.portfolio_performance_baselines(user_id),
    revision bigint not null, valuation_date date not null,status text not null check(status in ('saved','failed','superseded')),
    reason text, attempted_at timestamptz not null default now(),primary key(user_id,revision,valuation_date)
);
create table public.local_performance_market_cache (
    cache_key text primary key, observation jsonb not null, created_at timestamptz not null default now()
);
create table public.local_performance_corrections (
    user_id uuid not null references public.portfolio_performance_baselines(user_id), request_id uuid not null,
    event_id uuid not null,revision bigint not null,previous_event jsonb not null,patch jsonb not null,
    created_at timestamptz not null default now(),primary key(user_id,request_id)
);
alter table public.local_performance_imports enable row level security;
alter table public.local_performance_runs enable row level security;
alter table public.local_performance_market_cache enable row level security;
alter table public.local_performance_corrections enable row level security;
revoke all on public.local_performance_imports,public.local_performance_runs,public.local_performance_market_cache,public.local_performance_corrections from public,anon,authenticated;
grant all on public.local_performance_imports,public.local_performance_runs,public.local_performance_market_cache,public.local_performance_corrections to service_role;
grant select on public.local_performance_imports,public.local_performance_runs,public.local_performance_corrections to authenticated;
create policy local_import_owner on public.local_performance_imports for select to authenticated using(auth.uid()=user_id);
create policy local_run_owner on public.local_performance_runs for select to authenticated using(auth.uid()=user_id);
create policy local_correction_owner on public.local_performance_corrections for select to authenticated using(auth.uid()=user_id);

create function public.get_local_performance_worker_input(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
    perform public.require_local_performance_test();
    return (select jsonb_build_object('apiVersion','portfolio-performance-v1','baseline',b.baseline,'ledgerState',b.ledger_state,
        'revision',b.revision,'cashFlowCoverage',b.cash_flow_coverage,'costCoverage',b.cost_coverage,'convention',b.convention,'returnBasis',b.return_basis,
        'events',coalesce((select jsonb_agg(e.event||jsonb_build_object('id',e.event_id,'date',e.trade_date,'sequence',e.sequence,
            'accountId',e.account_key,'source',e.source,'externalReference',e.external_reference) order by e.trade_date,e.sequence)
            from public.portfolio_ledger_events e where e.user_id=b.user_id),'[]'::jsonb),
        'observations',coalesce((select jsonb_agg(o.observation||jsonb_build_object('date',o.valuation_date,'revision',o.revision) order by o.valuation_date)
            from public.portfolio_performance_observations o where o.user_id=b.user_id and o.revision=b.revision),'[]'::jsonb))
        from public.portfolio_performance_baselines b where b.user_id=p_user_id);
end $$;
revoke all on function public.get_local_performance_worker_input(uuid) from public,anon,authenticated;
grant execute on function public.get_local_performance_worker_input(uuid) to service_role;

create function public.commit_local_performance_import(p_user_id uuid,p_import_key text,p_plan jsonb,p_revision bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.portfolio_performance_baselines%rowtype; saved public.local_performance_imports%rowtype;
    v_baseline jsonb;v_state jsonb;v_value numeric;e jsonb;old public.portfolio_ledger_events%rowtype;v_result jsonb;v_inserted integer=0;v_skipped integer=0;v_events jsonb;
begin
    perform public.require_local_performance_test();
    if p_import_key is null or length(p_import_key)<>64 or p_plan->>'source' is distinct from 'synthetic_test' then raise exception 'Synthetic import evidence required'; end if;
    -- Serialize first imports as well as reimports before the baseline row exists.
    perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
    select * into saved from public.local_performance_imports where user_id=p_user_id and import_key=p_import_key;
    if found then
        if saved.payload is distinct from p_plan then raise exception 'Import evidence reused with different reconciliation';end if;
        return saved.result||jsonb_build_object('duplicate',true);
    end if;
    select * into b from public.portfolio_performance_baselines where user_id=p_user_id for update;
    if not found then
        if p_plan->>'kind'<>'opening' or p_plan->>'ready'<>'true' then raise exception 'Complete opening import required';end if;
        v_baseline=p_plan||jsonb_build_object('verified',true,'coverage','complete','finalized',true);
        v_state=public.replay_local_performance_ledger(v_baseline,'[]');
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
            perform set_config('request.jwt.claim.sub',p_user_id::text,true);
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
                        perform public.register_local_portfolio_trade(e,gen_random_uuid(),b.revision,null);
                        v_inserted=v_inserted+1;
                    end if;
                    select * into b from public.portfolio_performance_baselines where user_id=p_user_id;
                end if;
            end loop;
        elsif p_plan->>'kind'='opening' then
            if (p_plan->>'date')::date<(b.baseline->>'date')::date then raise exception 'Statement predates opening';end if;
            select coalesce(jsonb_agg(event||jsonb_build_object('date',trade_date,'accountId',account_key) order by trade_date,sequence),'[]') into v_events
                from public.portfolio_ledger_events where user_id=p_user_id and trade_date<=(p_plan->>'date')::date;
            v_state=public.replay_local_performance_ledger(b.baseline,v_events);
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
    insert into public.local_performance_imports(user_id,import_key,kind,payload,result) values(p_user_id,p_import_key,p_plan->>'kind',p_plan,v_result);
    return v_result;
end $$;
revoke all on function public.commit_local_performance_import(uuid,text,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.commit_local_performance_import(uuid,text,jsonb,bigint) to service_role;

create function public.correct_local_portfolio_trade(p_event_id uuid,p_patch jsonb,p_request_id uuid,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid=auth.uid();b public.portfolio_performance_baselines%rowtype;e public.portfolio_ledger_events%rowtype;a public.local_performance_corrections%rowtype;
    v_event jsonb;v_date date;v_events jsonb;v_state jsonb;v_revision bigint;
    f public.portfolio_ledger_events%rowtype;v_fx jsonb;v_native numeric;v_sequence integer;v_previous jsonb;
begin
    perform public.require_local_performance_test();if v_user is null then raise exception 'Authentication required';end if;
    select * into b from public.portfolio_performance_baselines where user_id=v_user for update;if not found then raise exception 'Opening required';end if;
    select * into a from public.local_performance_corrections where user_id=v_user and request_id=p_request_id;
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
    v_state=public.replay_local_performance_ledger(b.baseline,v_events);
    update public.portfolio_performance_baselines set ledger_state=v_state,cash_flow_coverage=b.cash_flow_coverage,cost_coverage=b.cost_coverage where user_id=v_user returning revision into v_revision;
    insert into public.local_performance_corrections(user_id,request_id,event_id,revision,previous_event,patch) values(v_user,p_request_id,p_event_id,v_revision,v_previous,p_patch);
    return jsonb_build_object('revision',v_revision,'ledgerState',v_state);
end $$;
revoke all on function public.correct_local_portfolio_trade(uuid,jsonb,uuid,bigint) from public,anon;
grant execute on function public.correct_local_portfolio_trade(uuid,jsonb,uuid,bigint) to authenticated;
create function public.publish_local_history_batch(p_user_id uuid,p_revision bigint,p_observations jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare b public.portfolio_performance_baselines%rowtype;o jsonb;old jsonb;missing jsonb='[]';
begin
    perform public.require_local_performance_test();
    -- Same lock order as source collection: market archive, then portfolio.
    perform pg_advisory_xact_lock(hashtextextended('local-public-market-archive',0));
    select * into b from public.portfolio_performance_baselines where user_id=p_user_id for update;
    if not found or b.revision is distinct from p_revision then raise exception 'History revision changed' using errcode='40001';end if;
    if b.baseline->>'sourceReconciliationRequired'='true' then raise exception 'Opening source reconciliation required';end if;
    for o in select * from jsonb_array_elements(p_observations) loop
        if exists(select 1 from jsonb_array_elements(o->'priceSources') q
            join public.local_performance_market_cache m on m.cache_key='archive:price:'||(q->>'instrumentId')||':'||(q->>'currency')||':'||(q->>'date')
            where q->'price' is distinct from m.observation->'price') then raise exception 'Market source revision changed' using errcode='40001';end if;
        select observation into old from public.portfolio_performance_observations where user_id=p_user_id and revision=p_revision and valuation_date=(o->>'date')::date;
        if found then if old is distinct from o then raise exception 'Immutable history conflict';end if;
        else missing=missing||jsonb_build_array(o);end if;
    end loop;
    if jsonb_array_length(missing)>0 then perform public.publish_local_performance_observations(p_user_id,p_revision,missing);end if;
    for o in select * from jsonb_array_elements(p_observations) loop
        insert into public.local_performance_runs(user_id,revision,valuation_date,status) values(p_user_id,p_revision,(o->>'date')::date,'saved')
            on conflict(user_id,revision,valuation_date) do update set status='saved',reason=null,attempted_at=now();
    end loop;
end $$;
revoke all on function public.publish_local_history_batch(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.publish_local_history_batch(uuid,bigint,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
