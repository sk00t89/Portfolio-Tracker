-- LOCAL test database ONLY, after the three schema scripts. Entire fixture rolls back.
-- Does not require deploying functions, configuring Vault or activating cron.
begin;
insert into auth.users(id,aud,role,email) values
 ('10100000-0000-0000-0000-000000000001','authenticated','authenticated','snapshot-test-one@example.invalid'),
 ('10100000-0000-0000-0000-000000000002','authenticated','authenticated','snapshot-test-two@example.invalid');

set local role authenticated;
select set_config('request.jwt.claim.sub','10100000-0000-0000-0000-000000000001',true);
select public.import_manual_assets('[{"name":"Cash","category":"CASH","value_sek":123,"legacy_key":"fixture-one"}]','10100000-0000-0000-0000-000000000001');
select public.import_manual_assets('[{"name":"Cash","category":"CASH","value_sek":999,"legacy_key":"fixture-one"}]','10100000-0000-0000-0000-000000000001');
do $$ begin
 if (select count(*) from public.manual_assets) <> 1 or (select value_sek from public.manual_assets) <> 123 then raise exception 'Migration retry duplicated or overwrote'; end if;
 begin
  perform public.import_manual_assets('[]','10100000-0000-0000-0000-000000000002');
  raise exception 'Account guard failed';
 exception when insufficient_privilege then null; end;
end; $$;
update public.manual_assets set value_sek=150;
select public.import_manual_assets('[{"name":"Cash","category":"CASH","value_sek":123,"legacy_key":"fixture-one"}]','10100000-0000-0000-0000-000000000001');
do $$ begin if (select value_sek from public.manual_assets) <> 150 then raise exception 'Retry overwrote edited cloud asset'; end if; end; $$;
select set_config('request.jwt.claim.sub','10100000-0000-0000-0000-000000000002',true);
-- A new account without any legacy assets initializes through the empty-import path.
select public.import_manual_assets('[]','10100000-0000-0000-0000-000000000002');
do $$ begin
 if (select manual_assets_ready from public.portfolio_snapshot_settings where user_id='10100000-0000-0000-0000-000000000002') is distinct from true then raise exception 'Empty account initialization failed'; end if;
 if exists(select 1 from public.manual_assets) then raise exception 'Cross-user data exposed'; end if;
 begin
  insert into public.manual_assets(user_id,name,category,value_sek) values('10100000-0000-0000-0000-000000000001','Attack','CASH',1);
  raise exception 'RLS insert guard failed';
 exception when insufficient_privilege then null; end;
 if has_function_privilege('authenticated','public.save_server_portfolio_daily_value(uuid,bigint,date,numeric,timestamptz,jsonb)','EXECUTE') then raise exception 'Server write RPC exposed'; end if;
 if has_function_privilege('anon','public.get_portfolio_snapshot_input(uuid)','EXECUTE') then raise exception 'Server inputs RPC exposed'; end if;
end; $$;
reset role;

do $$ declare
 u uuid := '10100000-0000-0000-0000-000000000001'; r bigint; value jsonb;
 observed timestamptz := clock_timestamp()-interval '2 minutes'; d date;
begin
 d := (observed at time zone 'Europe/Stockholm')::date;
 value := public.get_portfolio_snapshot_input(u);
 r := (value->>'revision')::bigint;
 if value->>'ready' <> 'true' or jsonb_array_length(value->'manual_assets') <> 1 then raise exception 'Incomplete canonical inputs'; end if;
 if not public.save_server_portfolio_daily_value(u,r,d,150,observed,null) then raise exception 'Initial server write failed'; end if;
 if (select source_metadata from public.portfolio_daily_values where user_id=u and valuation_date=d) is distinct from '{}'::jsonb then raise exception 'Null insert metadata not normalized'; end if;
 if public.save_server_portfolio_daily_value(u,r,d,1,observed-interval '1 minute','{}') then raise exception 'Older server observation replaced newer'; end if;
 if public.save_server_portfolio_daily_value(u,r,d,1,observed,'{}') then raise exception 'Equal observation replaced existing'; end if;
 update public.manual_assets set value_sek=200 where user_id=u;
 begin
  perform public.save_server_portfolio_daily_value(u,r,d,150,observed+interval '10 seconds','{}');
  raise exception 'Expected stale-input rejection';
 exception when raise_exception then
  if sqlerrm <> 'Portfolio inputs changed' then raise; end if;
 end;
 select input_revision into r from public.portfolio_snapshot_settings where user_id=u;
 if not public.save_server_portfolio_daily_value(u,r,d,200,observed+interval '20 seconds',null) then raise exception 'Newer server write failed'; end if;
 if (select source_metadata from public.portfolio_daily_values where user_id=u and valuation_date=d) is distinct from '{}'::jsonb then raise exception 'Null update metadata not normalized'; end if;
 if (select count(*) from public.portfolio_daily_values where user_id=u and valuation_date=d) <> 1 then raise exception 'Duplicate daily row'; end if;
end; $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','10100000-0000-0000-0000-000000000001',true);
do $$ declare o timestamptz := clock_timestamp()-interval '1 minute'; d date; begin
 d := (o at time zone 'Europe/Stockholm')::date;
 if not public.save_portfolio_daily_value(d,220,o) then raise exception 'Client replacement failed'; end if;
 if (select source from public.portfolio_daily_values where valuation_date=d) <> 'client' then raise exception 'Client provenance not reset'; end if;
 if public.save_portfolio_daily_value(d,1,o-interval '5 minutes') then raise exception 'Older client write replaced newer'; end if;
end; $$;
reset role;
rollback;
