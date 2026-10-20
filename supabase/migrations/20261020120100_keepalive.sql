-- Keep-alive for the DISTANCE // ZERO Supabase project (Free plan pauses a project after about 7 days without activity).
-- /api/keep-alive (Vercel Cron, daily) calls dz_keepalive() with the PUBLISHABLE key: the only thing that key can do here
-- is run this one function, which stamps a single heartbeat row. It cannot read or write any table, applications included.
-- The heartbeat row also shows the team when the last successful ping happened (Table Editor -> dz_heartbeat).

create table public.dz_heartbeat (
  id        smallint primary key default 1 check (id = 1),
  last_ping timestamptz not null,
  pings     bigint not null default 1
);

alter table public.dz_heartbeat enable row level security;
revoke all on table public.dz_heartbeat from anon, authenticated;

create or replace function public.dz_keepalive() returns timestamptz
language sql security definer set search_path = '' as $$
  insert into public.dz_heartbeat as h (id, last_ping) values (1, now())
  on conflict (id) do update set last_ping = now(), pings = h.pings + 1
  returning last_ping;
$$;

revoke all on function public.dz_keepalive() from public, anon, authenticated;
grant execute on function public.dz_keepalive() to anon;
