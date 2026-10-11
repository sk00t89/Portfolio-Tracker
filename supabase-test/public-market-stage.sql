-- LOCAL ONLY: public source evidence + fictional test portfolios, no new tables.
begin;
select public.require_local_performance_test();
create or replace function public.archive_local_public_sources(p_points jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p jsonb;s jsonb;old jsonb;k text;seen text[]='{}';changed integer=0;corrected integer=0;r bigint;
begin
    perform public.require_local_performance_test();
    perform pg_advisory_xact_lock(hashtextextended('local-public-market-archive',0));
    if jsonb_typeof(p_points) is distinct from 'array' or jsonb_array_length(p_points)>500 then raise exception 'Invalid public batch';end if;
    for p in select * from jsonb_array_elements(p_points) loop
        if (p->'verified'='true'::jsonb and p->>'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            and (p->>'date')::date<=(now() at time zone 'Europe/Stockholm')::date
            and p->>'source' ~ '^(Avanza|Nordnet|Yahoo|Frankfurter / ECB)'
            and p->>'contentSha256' ~ '^[a-f0-9]{64}$') is not true then raise exception 'Unverified public source';end if;
        if p->>'instrumentId'='public-fx-USD-SEK' then
            if (p->>'isin'='ECB:USDSEK' and p->>'currency'='USD' and p->>'from'='USD' and p->>'to'='SEK'
                and jsonb_typeof(p->'rate')='number' and (p->>'rate')::numeric>0) is not true then raise exception 'Invalid public FX';end if;
        else
            if (p->>'instrumentId'='public-'||(p->>'isin') and p->>'isin'=any(array[
                'CA00288U1066','US69608A1088','SE0011178458','SE0012673267','SE0010100958','SE0008014476','SE0015811963','SE0029051242',
                'CH1108679304','CH1213604601','CH1114178788','CH0585378661','CH1104954362','CH1161139600','CH1114178770','CH1108679353',
                'SE0022050092','SE0021149259','SE0023260716','SE0021630449','SE0020541639','SE0021148129','SE0021309754','SE0021486156',
                'SE0001718388','LU1232457504','SE0002793943','SE0004297927','SE0007074117'])
                and p->>'currency'=case when p->>'isin' in ('CA00288U1066','US69608A1088') then 'USD' else 'SEK' end
                and jsonb_typeof(p->'price')='number' and (p->>'price')::numeric>0) is not true then raise exception 'Public listing not reviewed';end if;
        end if;
        s=jsonb_build_object('instrumentId',p->'instrumentId','isin',p->'isin','currency',p->'currency','date',p->'date',
            'source',p->'source','verified',true,'contentSha256',p->'contentSha256')||
            case when p ? 'rate' then jsonb_build_object('rate',p->'rate','from',p->'from','to',p->'to') else jsonb_build_object('price',p->'price') end;
        k='public:source:'||(p->>'instrumentId')||':'||(p->>'currency')||':'||(p->>'date');
        if k=any(seen) then raise exception 'Duplicate source date';end if;seen=array_append(seen,k);
        select observation into old from public.local_performance_market_cache where cache_key=k;
        if old=s then continue;end if;
        changed=changed+1;
        if old is not null then
            corrected=corrected+1;
            -- Conservative invalidation, including FX. Old valuations remain immutable.
            update public.portfolio_performance_baselines b set revision=revision+1,
                baseline=case when exists(select 1 from jsonb_array_elements(coalesce(b.baseline->'priceSources','[]')||coalesce(b.baseline->'fxSources','[]')) q
                    where q->>'instrumentId'=p->>'instrumentId' and q->>'date'=p->>'date')
                    then b.baseline||jsonb_build_object('sourceReconciliationRequired',true) else b.baseline end
                where b.baseline->>'syntheticPublicDemo'='true';
        end if;
        insert into public.local_performance_market_cache(cache_key,observation) values(k||':version:'||(p->>'contentSha256'),s) on conflict do nothing;
        insert into public.local_performance_market_cache(cache_key,observation) values(k,s)
            on conflict(cache_key) do update set observation=excluded.observation,created_at=now();
    end loop;
    select coalesce((observation->>'revision')::bigint,0) into r from public.local_performance_market_cache where cache_key='public:revision';r=coalesce(r,0)+case when changed>0 then 1 else 0 end;
    insert into public.local_performance_market_cache(cache_key,observation) values('public:revision',jsonb_build_object('revision',r))
        on conflict(cache_key) do update set observation=excluded.observation;
    return jsonb_build_object('changed',changed,'corrected',corrected,'revision',r);
end $$;
revoke all on function public.archive_local_public_sources(jsonb) from public,anon,authenticated;
grant execute on function public.archive_local_public_sources(jsonb) to service_role;

create or replace function public.publish_local_public_history(p_user_id uuid,p_revision bigint,p_observations jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare b public.portfolio_performance_baselines%rowtype;o jsonb;p jsonb;q jsonb;s jsonb;old jsonb;events jsonb;state jsonb;v numeric;rate numeric;r bigint;
begin
    perform public.require_local_performance_test();
    perform pg_advisory_xact_lock(hashtextextended('local-public-market-archive',0));
    select * into b from public.portfolio_performance_baselines where user_id=p_user_id for update;
    if not found or b.revision<>p_revision then raise exception 'Public history revision changed' using errcode='40001';end if;
    if b.baseline->>'syntheticPublicDemo' is distinct from 'true' or not exists(select 1 from auth.users where id=p_user_id and email like '%@portfolio-test.invalid')
        or b.cash_flow_coverage<>'complete' or b.cost_coverage<>'complete' or b.baseline->>'sourceReconciliationRequired'='true' then raise exception 'Fictional public demo required';end if;
    if jsonb_typeof(p_observations) is distinct from 'array' or jsonb_array_length(p_observations)=0 then raise exception 'Public observation batch required';end if;
    select (observation->>'revision')::bigint into r from public.local_performance_market_cache where cache_key='public:revision';
    for o in select * from jsonb_array_elements(p_observations) loop
        if (o->>'source'='archived_verified_market' and o->'verified'='true'::jsonb and o->'finalized'='true'::jsonb and o->>'coverage'='complete'
            and (o->>'sourceRevision')::bigint=r and (o->>'revision')::bigint=p_revision
            and (o->>'date')::date>(b.baseline->>'date')::date and (o->>'date')::date<(now() at time zone 'Europe/Stockholm')::date
            and (o->>'asOf')::timestamptz<=now() and ((o->>'asOf')::timestamptz at time zone 'Europe/Stockholm')::date=(o->>'date')::date
            and ((o->>'asOf')::timestamptz at time zone 'Europe/Stockholm')::time>=time '23:30') is not true then raise exception 'Invalid public finalized observation';end if;
        for q in select * from jsonb_array_elements(o->'priceSources') union all select * from jsonb_array_elements(o->'fxSources') loop
            select observation into s from public.local_performance_market_cache where cache_key='public:source:'||(q->>'instrumentId')||':'||(q->>'currency')||':'||(q->>'date');
            if not found or q->>'contentSha256' is distinct from s->>'contentSha256' or q->'price' is distinct from s->'price' or q->'rate' is distinct from s->'rate'
                then raise exception 'Public source changed or missing' using errcode='40001';end if;
            if (q->>'date')::date>(o->>'date')::date or (o->>'date')::date-(q->>'date')::date>7
                or q->>'date'<>o->>'date' and q->'calendarVerified' is distinct from 'true'::jsonb then raise exception 'Unverified source carry';end if;
        end loop;
        select coalesce(jsonb_agg(event||jsonb_build_object('date',trade_date) order by trade_date,sequence),'[]'::jsonb) into events
            from public.portfolio_ledger_events where user_id=p_user_id and trade_date<=(o->>'date')::date;
        state=public.replay_local_performance_ledger(b.baseline,events);v=0;
        if o->'positions' is distinct from state->'positions' or o->'cash' is distinct from state->'cash' then raise exception 'Public valuation ledger mismatch';end if;
        for p in select * from jsonb_array_elements(state->'positions') loop
            select * into strict q from jsonb_array_elements(o->'priceSources') x where x->>'instrumentId'=p->>'instrumentId' and x->>'currency'=p->>'currency';
            rate=1;
            if p->>'currency'<>'SEK' then select (x->>'rate')::numeric into strict rate from jsonb_array_elements(o->'fxSources') x where x->>'from'=p->>'currency' and x->>'to'='SEK';end if;
            v=v+(p->>'quantity')::numeric*(q->>'price')::numeric*rate;
        end loop;
        for p in select * from jsonb_array_elements(state->'cash') loop
            rate=1;
            if p->>'currency'<>'SEK' then select (x->>'rate')::numeric into strict rate from jsonb_array_elements(o->'fxSources') x where x->>'from'=p->>'currency' and x->>'to'='SEK';end if;
            v=v+(p->>'amount')::numeric*rate;
        end loop;
        if jsonb_typeof(o->'valueSek') is distinct from 'number' or abs(v-(o->>'valueSek')::numeric)>0.000001 then raise exception 'Public valuation total mismatch';end if;
        select observation into old from public.portfolio_performance_observations where user_id=p_user_id and revision=p_revision and valuation_date=(o->>'date')::date;
        if found then if old is distinct from o then raise exception 'Immutable public history conflict';end if;
        else insert into public.portfolio_performance_observations(user_id,valuation_date,revision,observation) values(p_user_id,(o->>'date')::date,p_revision,o);end if;
        insert into public.local_performance_runs(user_id,revision,valuation_date,status) values(p_user_id,p_revision,(o->>'date')::date,'saved')
            on conflict(user_id,revision,valuation_date) do update set status='saved',reason=null,attempted_at=now();
    end loop;
end $$;
revoke all on function public.publish_local_public_history(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.publish_local_public_history(uuid,bigint,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
