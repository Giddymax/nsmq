create extension if not exists pgcrypto;

create table if not exists public.quiz_entries (
  id uuid primary key default gen_random_uuid(),
  school_name text not null check (length(trim(school_name)) between 1 and 120),
  school_key text generated always as (lower(regexp_replace(trim(school_name), '\s+', ' ', 'g'))) stored,
  contest_number integer not null check (contest_number between 1 and 3),
  created_at timestamptz not null default now(),
  constraint quiz_entries_one_per_school unique (school_key)
);

alter table public.quiz_entries enable row level security;
revoke all on public.quiz_entries from anon, authenticated;
grant delete on public.quiz_entries to service_role;

create or replace function public.enter_quiz_draw(school_name text)
returns table(entry_id uuid, contest_number integer, remaining integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_name text := trim(regexp_replace(school_name, '\s+', ' ', 'g'));
  chosen_contest integer;
  new_entry uuid;
  spots_left integer;
begin
  if normalized_name is null or length(normalized_name) = 0 or length(normalized_name) > 120 then
    raise exception 'INVALID_SCHOOL_NAME';
  end if;

  -- Serialize draws so simultaneous submissions cannot overfill a contest or duplicate a school.
  perform pg_advisory_xact_lock(982431);

  if exists (
    select 1 from public.quiz_entries e
    where e.school_key = lower(normalized_name)
  ) then
    raise exception 'SCHOOL_ALREADY_ENTERED';
  end if;

  select c.num into chosen_contest
  from generate_series(1, 3) as c(num)
  where (select count(*) from public.quiz_entries e where e.contest_number = c.num) < 3
  order by random()
  limit 1;

  if chosen_contest is null then
    raise exception 'DRAW_FULL';
  end if;

  insert into public.quiz_entries (school_name, contest_number)
  values (normalized_name, chosen_contest)
  returning id into new_entry;

  select 3 - count(*) into spots_left
  from public.quiz_entries e where e.contest_number = chosen_contest;

  return query select new_entry, chosen_contest, spots_left;
end;
$$;

create or replace function public.get_contest_counts()
returns table(contest_number integer, entrant_count bigint)
language sql
security definer
set search_path = public, pg_temp
as $$
  select c.num::integer, count(e.id)
  from generate_series(1, 3) as c(num)
  left join public.quiz_entries e on e.contest_number = c.num
  group by c.num
  order by c.num;
$$;

grant execute on function public.enter_quiz_draw(text) to anon, authenticated;
grant execute on function public.get_contest_counts() to anon, authenticated;
create or replace function public.get_final_draw_results()
returns table(school_name text, contest_number integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  entry_total bigint;
begin
  select count(*) into entry_total from public.quiz_entries;
  if entry_total < 9 then
    raise exception 'DRAW_NOT_CLOSED';
  end if;

  return query
  select e.school_name, e.contest_number
  from public.quiz_entries e
  order by e.contest_number, lower(e.school_name);
end;
$$;

grant execute on function public.get_final_draw_results() to anon, authenticated;
-- Reset password attempts are private to the trusted Edge Function.
create table if not exists public.quiz_reset_attempts (
  client_fingerprint text primary key check (length(client_fingerprint) between 1 and 128),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0)
);

alter table public.quiz_reset_attempts enable row level security;
revoke all on public.quiz_reset_attempts from public, anon, authenticated;

create or replace function public.consume_quiz_reset_attempt(p_client_fingerprint text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_attempts integer;
  started_at timestamptz;
begin
  if p_client_fingerprint is null or length(p_client_fingerprint) not between 1 and 128 then
    raise exception 'INVALID_RESET_CLIENT';
  end if;

  -- Serialize attempts from the same network fingerprint.
  perform pg_advisory_xact_lock(hashtextextended(p_client_fingerprint, 982431));
  delete from public.quiz_reset_attempts where window_started_at < now() - interval '1 day';

  insert into public.quiz_reset_attempts (client_fingerprint)
  values (p_client_fingerprint)
  on conflict (client_fingerprint) do nothing;

  select a.attempts, a.window_started_at
    into current_attempts, started_at
  from public.quiz_reset_attempts a
  where a.client_fingerprint = p_client_fingerprint
  for update;

  if started_at <= now() - interval '15 minutes' then
    update public.quiz_reset_attempts a
       set attempts = 1, window_started_at = now()
     where a.client_fingerprint = p_client_fingerprint;
    return true;
  end if;

  if current_attempts >= 5 then
    return false;
  end if;

  update public.quiz_reset_attempts a
     set attempts = a.attempts + 1
   where a.client_fingerprint = p_client_fingerprint;
  return true;
end;
$$;

revoke all on function public.consume_quiz_reset_attempt(text) from public, anon, authenticated;
grant execute on function public.consume_quiz_reset_attempt(text) to service_role;
