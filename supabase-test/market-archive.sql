-- LOCAL ONLY. Public synthetic market data; reuses the existing service-only cache.
begin;
select public.require_local_performance_test();
create or replace function public.archive_local_market_batch(p_points jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p jsonb; previous jsonb; stable jsonb; k text; changes jsonb='[]'; users_changed integer=0;
    inserted integer=0; unchanged integer=0; corrected integer=0; seen text[]='{}';
begin
    perform public.require_local_performance_test();
    if jsonb_typeof(p_points) is distinct from 'array' or jsonb_array_length(p_points)>500 then raise exception 'Invalid market batch';end if;
    perform pg_advisory_xact_lock(hashtextextended('local-public-market-archive',0));
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
        select observation into previous from public.local_performance_market_cache where cache_key=k;
        if found and previous=stable then unchanged=unchanged+1;continue;end if;
        if previous is null then inserted=inserted+1;
        else corrected=corrected+1;changes=changes||jsonb_build_array(stable);end if;
        insert into public.local_performance_market_cache(cache_key,observation)
            values(k||':version:'||md5(stable::text),stable) on conflict(cache_key) do nothing;
        insert into public.local_performance_market_cache(cache_key,observation) values(k,stable)
            on conflict(cache_key) do update set observation=excluded.observation,created_at=now();
    end loop;
    if corrected>0 then
        -- Derived valuation-date caches must not hide a corrected source point, including weekend carry.
        delete from public.local_performance_market_cache where cache_key like 'synthetic_test:price:%';
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
revoke all on function public.archive_local_market_batch(jsonb) from public,anon,authenticated;
grant execute on function public.archive_local_market_batch(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
