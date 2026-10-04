-- Manual schema setup only. Do not run automatically.
begin;
create table if not exists public.manual_assets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null check (length(trim(name)) > 0),
    category text not null check (length(trim(category)) > 0),
    value_sek numeric not null check (value_sek >= 0 and value_sek::text not in ('NaN','Infinity','-Infinity')),
    legacy_key text,
    created_at timestamptz not null default now(),
    unique (user_id, legacy_key)
);
create index if not exists manual_assets_user_idx on public.manual_assets(user_id);
alter table public.manual_assets enable row level security;
revoke all on public.manual_assets from public, anon;
grant select, insert, update, delete on public.manual_assets to authenticated;
drop policy if exists "Own manual assets" on public.manual_assets;
create policy "Own manual assets" on public.manual_assets to authenticated
    using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create table if not exists public.portfolio_snapshot_settings (
    user_id uuid primary key references auth.users(id) on delete cascade,
    manual_assets_ready boolean not null default false,
    input_revision bigint not null default 0
);
alter table public.portfolio_snapshot_settings enable row level security;
revoke all on public.portfolio_snapshot_settings from public, anon, authenticated;
grant select on public.portfolio_snapshot_settings to authenticated;
grant all on public.manual_assets, public.portfolio_snapshot_settings to service_role;
drop policy if exists "Own snapshot settings" on public.portfolio_snapshot_settings;
create policy "Own snapshot settings" on public.portfolio_snapshot_settings for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.begin_manual_assets_migration(p_expected_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
    if v_user is null or v_user is distinct from p_expected_user then raise exception 'User changed' using errcode='42501'; end if;
    insert into public.portfolio_snapshot_settings(user_id,manual_assets_ready) values(v_user,false)
    on conflict(user_id) do update set manual_assets_ready=false;
end; $$;

create or replace function public.import_manual_assets(p_assets jsonb, p_expected_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_asset jsonb;
begin
    if v_user is null or v_user is distinct from p_expected_user then raise exception 'User changed' using errcode = '42501'; end if;
    if jsonb_typeof(p_assets) is distinct from 'array' then raise exception 'Invalid assets'; end if;
    for v_asset in select value from jsonb_array_elements(p_assets) loop
        if coalesce(v_asset->>'legacy_key','') = '' then raise exception 'Missing migration key'; end if;
        insert into public.manual_assets(user_id,name,category,value_sek,legacy_key)
        values(v_user,v_asset->>'name',v_asset->>'category',(v_asset->>'value_sek')::numeric,v_asset->>'legacy_key')
        on conflict(user_id,legacy_key) do nothing;
    end loop;
    insert into public.portfolio_snapshot_settings(user_id,manual_assets_ready) values(v_user,true)
    on conflict(user_id) do update set manual_assets_ready = true;
end; $$;

create or replace function public.replace_manual_assets(p_assets jsonb, p_expected_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_asset jsonb;
begin
    if v_user is null or v_user is distinct from p_expected_user then raise exception 'User changed' using errcode = '42501'; end if;
    if jsonb_typeof(p_assets) is distinct from 'array' then raise exception 'Invalid assets'; end if;
    delete from public.manual_assets where user_id = v_user;
    for v_asset in select value from jsonb_array_elements(p_assets) loop
        insert into public.manual_assets(user_id,name,category,value_sek)
        values(v_user,v_asset->>'name',v_asset->>'category',(v_asset->>'value_sek')::numeric);
    end loop;
end; $$;
revoke all on function public.begin_manual_assets_migration(uuid), public.import_manual_assets(jsonb,uuid), public.replace_manual_assets(jsonb,uuid) from public, anon;
grant execute on function public.begin_manual_assets_migration(uuid), public.import_manual_assets(jsonb,uuid), public.replace_manual_assets(jsonb,uuid) to authenticated;
commit;
