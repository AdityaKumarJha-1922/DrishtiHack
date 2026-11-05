-- NetraSaathi Step 5: saved cases and private interview audio.
--
-- Access model: the app NEVER talks to this table directly. Writes go through
-- the save_case / save_audio Edge Functions (service role). Row Level Security
-- is on with no policies, so the public anon key and signed-in users can't read
-- or write anything. The optometrist portal will add its own read/review
-- policies later (a decision for that step).

create table if not exists public.cases (
  case_id    text primary key,
  shop_id    text not null,
  created_at timestamptz not null,
  saved_at   timestamptz not null default now(),
  record     jsonb not null,                 -- the canonical case record (src/brain/types.ts)
  -- Derived for the optometrist's queue; never stored twice in the record.
  urgent     boolean generated always as (jsonb_array_length(record -> 'danger_signs') > 0) stored,
  constraint record_case_id_matches check (record ->> 'case_id' = case_id),
  constraint record_shop_id_matches check (record ->> 'shop_id' = shop_id)
);

create index if not exists cases_queue on public.cases (urgent desc, saved_at);

-- A danger sign can never be removed from a saved case, whoever writes it.
create or replace function public.cases_keep_danger_signs() returns trigger
language plpgsql as $$
begin
  if not ((new.record -> 'danger_signs') @> (old.record -> 'danger_signs')) then
    raise exception 'danger signs cannot be removed from a saved case';
  end if;
  new.saved_at := now();
  return new;
end;
$$;

drop trigger if exists cases_keep_danger_signs on public.cases;
create trigger cases_keep_danger_signs before update on public.cases
  for each row execute function public.cases_keep_danger_signs();

alter table public.cases enable row level security;
revoke all on public.cases from anon, authenticated;

-- Private bucket for interview audio (consented answers only). No storage
-- policies: only the service role (inside save_audio) can write.
insert into storage.buckets (id, name, public)
values ('case-audio', 'case-audio', false)
on conflict (id) do nothing;
