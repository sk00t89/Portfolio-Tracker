-- Local-only RPC. Cash, journal, revision and derived state commit together.
begin;
do $$ begin perform public.require_local_performance_test();end $$;
create function public.register_local_portfolio_cash(p_draft jsonb,p_request_id uuid,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid=auth.uid();b public.portfolio_performance_baselines%rowtype;e jsonb;old jsonb;v_date date;v_sequence integer;v_events jsonb;v_state jsonb;v_revision bigint;
begin
    perform public.require_local_performance_test();if v_user is null then raise exception 'Authentication required';end if;
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
    v_state=public.replay_local_performance_ledger(b.baseline,v_events);
    update public.portfolio_performance_baselines set ledger_state=v_state,cash_flow_coverage=b.cash_flow_coverage,cost_coverage=b.cost_coverage where user_id=v_user returning revision into v_revision;
    return jsonb_build_object('revision',v_revision,'ledgerState',v_state);
end $$;
revoke all on function public.register_local_portfolio_cash(jsonb,uuid,bigint) from public,anon;
grant execute on function public.register_local_portfolio_cash(jsonb,uuid,bigint) to authenticated;
notify pgrst,'reload schema';
commit;
