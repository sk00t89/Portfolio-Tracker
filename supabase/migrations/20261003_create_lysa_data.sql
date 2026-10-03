create table if not exists public.lysa_data (
    user_id uuid not null
        references auth.users(id) on delete cascade,
    data_type text not null
        check (data_type in ('transactions', 'performance')),
    data jsonb not null default '[]'::jsonb,
    updated_at timestamptz not null default now(),
    primary key (user_id, data_type)
);

alter table public.lysa_data enable row level security;

drop policy if exists "Users can manage their own Lysa data"
on public.lysa_data;

create policy "Users can manage their own Lysa data"
on public.lysa_data
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists lysa_data_user_id_idx
on public.lysa_data(user_id);
