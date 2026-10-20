-- GET FEATURED: artist submissions for D//0 Artist Discovery.
-- Only the server (service key, /api/get-featured) can read or write. RLS is on with no policies, so the public
-- (anon / publishable key) and logged-in users get nothing. Press photos live in a private bucket.
--
-- Review process: the team opens the table in the Supabase dashboard and moves `status` along
--   new -> in_review -> shortlisted -> invited -> featured     (or -> declined / withdrawn at any point)
-- adding `reviewer` and `review_notes`. reviewed_at and retain_until are maintained by the trigger below.
--
-- Retention (enforced daily by /api/featured-retention):
--   every submission: deleted 12 months after it arrived
--   declined / withdrawn: deleted 6 months after that decision (withdrawn: delete by hand at once if the artist asks)
--   featured: kept 36 months after the decision, for the show archive and rights records
--   hashed IP address: cleared after 30 days

create type public.featured_status as enum ('new', 'in_review', 'shortlisted', 'invited', 'featured', 'declined', 'withdrawn');

create table public.featured_submissions (
  id                   uuid primary key default gen_random_uuid(),
  reference            text not null unique check (reference ~ '^D0-[0-9A-F]{8}$'),
  created_at           timestamptz not null default now(),
  status               public.featured_status not null default 'new',

  full_name            text not null check (char_length(full_name) between 2 and 120),
  artist_name          text not null check (char_length(artist_name) between 1 and 120),
  city_country         text not null check (char_length(city_country) between 2 and 120),
  genre                text not null check (char_length(genre) between 2 and 80),
  email                text not null check (char_length(email) between 6 and 254 and email = lower(email)),
  music_links          text[] not null check (cardinality(music_links) between 1 and 5),
  social_links         text[] not null default '{}' check (cardinality(social_links) <= 5),
  bio                  text not null check (char_length(bio) between 50 and 3000),
  epk_url              text check (char_length(epk_url) <= 500),
  photo_path           text,
  preferred_features   text[] not null check (cardinality(preferred_features) between 1 and 5
                         and preferred_features <@ array['Music Showcase', 'Guest DJ Mix', 'Live Interview', 'Behind the Track', 'Live Performance']),
  check (photo_path is not null or epk_url is not null),

  consent_contact_at   timestamptz not null,
  consent_rights_at    timestamptz not null,
  consent_version      text not null,

  ip_hash              text,
  user_agent           text,
  team_notified_at     timestamptz,
  confirmation_sent_at timestamptz,

  reviewer             text,
  review_notes         text,
  reviewed_at          timestamptz,
  retain_until         timestamptz not null default (now() + interval '12 months')
);

comment on table public.featured_submissions is 'GET FEATURED artist submissions. Personal data: never expose publicly, do not export outside the team.';

create index featured_submissions_ip_recent on public.featured_submissions (ip_hash, created_at);
create index featured_submissions_email_recent on public.featured_submissions (email, created_at);
create index featured_submissions_retain on public.featured_submissions (retain_until);
create index featured_submissions_status on public.featured_submissions (status, created_at desc);

alter table public.featured_submissions enable row level security;
revoke all on table public.featured_submissions from anon, authenticated;

create or replace function public.featured_review_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    new.reviewed_at := now();
    if new.status in ('declined', 'withdrawn') then
      new.retain_until := least(old.retain_until, now() + interval '6 months');
    elsif new.status = 'featured' then
      new.retain_until := greatest(old.retain_until, now() + interval '36 months');
    end if;
  end if;
  return new;
end $$;

create trigger featured_review_stamp before update on public.featured_submissions
  for each row execute function public.featured_review_stamp();

-- private bucket for press photos: no storage policies, so only the service key can read or write
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('featured-press', 'featured-press', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
