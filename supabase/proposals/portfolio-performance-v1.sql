-- PROPOSAL ONLY: do not run without user approval. Not an automatic migration.
-- New isolated tables. No ALTER/UPDATE/DELETE of existing holdings/snapshots.
-- This proposal enables protected storage and a read adapter, not journal write
-- RPCs, importer certification, worker activation, or automatic backfilling.
begin;

create table public.portfolio_performance_baselines (
    user_id uuid primary key references auth.users(id) on delete cascade,
    revision bigint not null default 0 check (revision >= 0),
    baseline jsonb not null check (jsonb_typeof(baseline) = 'object'),
    cash_flow_coverage text not null default 'unknown' check (cash_flow_coverage in ('unknown','complete')),
    cost_coverage text not null default 'unknown' check (cost_coverage in ('unknown','complete')),
    convention text not null default 'stockholm_end_of_day_v1' check (convention = 'stockholm_end_of_day_v1'),
    return_basis text not null default 'net_total_return' check (return_basis = 'net_total_return'),
    created_at timestamptz not null default now()
);

create table public.portfolio_ledger_events (
    user_id uuid not null references public.portfolio_performance_baselines(user_id) on delete cascade,
    event_id uuid not null,
    trade_date date not null,
    sequence integer not null check (sequence >= 0),
    account_key text not null,
    source text not null check (length(trim(source)) > 0),
    external_reference text,
    event jsonb not null check (jsonb_typeof(event) = 'object'),
    registered_at timestamptz not null default now(),
    primary key (user_id,event_id),
    unique (user_id,trade_date,sequence),
    unique (user_id,account_key,source,external_reference)
);

create table public.portfolio_performance_observations (
    user_id uuid not null references public.portfolio_performance_baselines(user_id) on delete cascade,
    valuation_date date not null,
    revision bigint not null check (revision >= 0),
    observation jsonb not null check (jsonb_typeof(observation) = 'object'),
    created_at timestamptz not null default now(),
    primary key (user_id,valuation_date,revision)
);

-- A journal change invalidates the certificate immediately. The future write
-- RPC must lock the baseline, update journal + cash atomically, and explicitly
-- recertify coverage after reconciliation. Old derived observations stay intact.
create function public.invalidate_performance_coverage() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    update public.portfolio_performance_baselines
       set revision=revision+1,cash_flow_coverage='unknown',cost_coverage='unknown'
     where user_id=coalesce(new.user_id,old.user_id);
    return null;
end; $$;
revoke all on function public.invalidate_performance_coverage() from public,anon,authenticated;
create trigger performance_journal_changed after insert or update or delete on public.portfolio_ledger_events
for each row execute function public.invalidate_performance_coverage();

alter table public.portfolio_performance_baselines enable row level security;
alter table public.portfolio_ledger_events enable row level security;
alter table public.portfolio_performance_observations enable row level security;
revoke all on public.portfolio_performance_baselines,public.portfolio_ledger_events,public.portfolio_performance_observations from public,anon,authenticated;
grant select on public.portfolio_performance_baselines,public.portfolio_ledger_events,public.portfolio_performance_observations to authenticated;
grant all on public.portfolio_performance_baselines,public.portfolio_ledger_events,public.portfolio_performance_observations to service_role;
create policy performance_baseline_owner on public.portfolio_performance_baselines for select to authenticated using ((select auth.uid())=user_id);
create policy performance_event_owner on public.portfolio_ledger_events for select to authenticated using ((select auth.uid())=user_id);
create policy performance_observation_owner on public.portfolio_performance_observations for select to authenticated using ((select auth.uid())=user_id);

-- One MVCC snapshot prevents mixing a new journal with an old revision during reads.
-- JSON dates/ids/source are generated from canonical columns, not caller flags.
create function public.get_portfolio_performance_input() returns jsonb
language sql stable security invoker set search_path = '' as $$
    select jsonb_build_object('apiVersion','portfolio-performance-v1','baseline',b.baseline,
        'revision',b.revision,'cashFlowCoverage',b.cash_flow_coverage,'costCoverage',b.cost_coverage,
        'convention',b.convention,'returnBasis',b.return_basis,
        'events',coalesce((select jsonb_agg(e.event || jsonb_build_object(
            'id',e.event_id,'date',e.trade_date,'sequence',e.sequence,'accountId',e.account_key,
            'source',e.source,'externalReference',e.external_reference) order by e.trade_date,e.sequence)
            from public.portfolio_ledger_events e where e.user_id=b.user_id),'[]'::jsonb),
        'observations',coalesce((select jsonb_agg(o.observation || jsonb_build_object('date',o.valuation_date,'revision',o.revision)
            order by o.valuation_date) from public.portfolio_performance_observations o
            where o.user_id=b.user_id and o.revision=b.revision),'[]'::jsonb))
    from public.portfolio_performance_baselines b where b.user_id=(select auth.uid());
$$;
revoke all on function public.get_portfolio_performance_input() from public,anon;
grant execute on function public.get_portfolio_performance_input() to authenticated;

commit;
