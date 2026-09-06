-- Per-account daily counter for assistant calls.
--
-- The Gemini free tier is a shared pool: without a per-user cap, one account
-- exhausts it for everyone. Counted server-side because a client-side limit is
-- a suggestion.

create table if not exists ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null default current_date,
  calls   int  not null default 0,
  primary key (user_id, day)
);

alter table ai_usage enable row level security;

drop policy if exists ai_usage_own on ai_usage;
create policy ai_usage_own on ai_usage for select using (user_id = auth.uid());

create or replace function bump_ai_usage()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into ai_usage (user_id, day, calls)
  values (auth.uid(), current_date, 1)
  on conflict (user_id, day) do update set calls = ai_usage.calls + 1;
end;
$$;

revoke all on function bump_ai_usage() from public;
grant execute on function bump_ai_usage() to authenticated;
