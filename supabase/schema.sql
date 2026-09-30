-- Supabase Postgres Schema for Slowed + Reverb Player

-- 1. Profiles table
create table if not exists profiles (
  id uuid references auth.users primary key,
  display_name text not null,
  avatar_url text,
  created_at timestamptz default now()
);

-- 2. Tracks table (metadata entered by user, audio stays in local IndexedDB)
create table if not exists tracks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users not null,
  title text not null,
  artist text,
  duration_seconds numeric,
  created_at timestamptz default now()
);

-- 3. Versions table (slowed/sped-up + reverb recipes, no audio bytes)
create table if not exists versions (
  id uuid primary key default gen_random_uuid(),
  track_id uuid references tracks on delete cascade not null,
  owner_id uuid references auth.users not null,
  name text not null, -- e.g. "Slowed 0.85x + reverb"
  speed numeric not null, -- 0.5 to 2.0
  reverb_wet numeric, -- 0 to 1, null if reverb off
  reverb_decay_seconds numeric,
  reverb_predelay_ms numeric,
  reverb_lowpass_hz numeric,
  created_at timestamptz default now()
);

-- 4. Playlists table
create table if not exists playlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users not null,
  name text not null,
  created_at timestamptz default now()
);

-- 5. Playlist Items table
create table if not exists playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid references playlists on delete cascade not null,
  version_id uuid references versions on delete cascade not null,
  position integer not null
);

-- 6. Playlist Shares table (read-only sharing via link token or friend user_id)
create table if not exists playlist_shares (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid references playlists on delete cascade not null,
  shared_by uuid references auth.users not null,
  shared_with uuid references auth.users, -- null indicates public link share
  share_token text unique, -- used for public links
  created_at timestamptz default now()
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

alter table profiles enable row level security;
alter table tracks enable row level security;
alter table versions enable row level security;
alter table playlists enable row level security;
alter table playlist_items enable row level security;
alter table playlist_shares enable row level security;

-- PROFILES
create policy "Users can view own profile or public profile info"
  on profiles for select
  using (true);

create policy "Users can insert own profile"
  on profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

-- TRACKS
create policy "Users can view own tracks or tracks in accessible playlists"
  on tracks for select
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from versions v
      join playlist_items pi on pi.version_id = v.id
      join playlists p on p.id = pi.playlist_id
      left join playlist_shares ps on ps.playlist_id = p.id
      where v.track_id = tracks.id
      and (p.owner_id = auth.uid() or ps.shared_with = auth.uid() or ps.share_token is not null)
    )
  );

create policy "Users can insert own tracks"
  on tracks for insert
  with check (owner_id = auth.uid());

create policy "Users can update own tracks"
  on tracks for update
  using (owner_id = auth.uid());

create policy "Users can delete own tracks"
  on tracks for delete
  using (owner_id = auth.uid());

-- VERSIONS
create policy "Users can view own versions or versions in accessible playlists"
  on versions for select
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from playlist_items pi
      join playlists p on p.id = pi.playlist_id
      left join playlist_shares ps on ps.playlist_id = p.id
      where pi.version_id = versions.id
      and (p.owner_id = auth.uid() or ps.shared_with = auth.uid() or ps.share_token is not null)
    )
  );

create policy "Users can insert own versions"
  on versions for insert
  with check (owner_id = auth.uid());

create policy "Users can update own versions"
  on versions for update
  using (owner_id = auth.uid());

create policy "Users can delete own versions"
  on versions for delete
  using (owner_id = auth.uid());

-- PLAYLISTS
create policy "Users can view own playlists or shared playlists"
  on playlists for select
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from playlist_shares ps
      where ps.playlist_id = playlists.id
      and (ps.shared_with = auth.uid() or ps.share_token is not null)
    )
  );

create policy "Users can insert own playlists"
  on playlists for insert
  with check (owner_id = auth.uid());

create policy "Users can update own playlists"
  on playlists for update
  using (owner_id = auth.uid());

create policy "Users can delete own playlists"
  on playlists for delete
  using (owner_id = auth.uid());

-- PLAYLIST ITEMS
create policy "Users can view items in accessible playlists"
  on playlist_items for select
  using (
    exists (
      select 1 from playlists p
      left join playlist_shares ps on ps.playlist_id = p.id
      where p.id = playlist_items.playlist_id
      and (p.owner_id = auth.uid() or ps.shared_with = auth.uid() or ps.share_token is not null)
    )
  );

create policy "Users can modify items if they own the playlist"
  on playlist_items for all
  using (
    exists (
      select 1 from playlists p
      where p.id = playlist_items.playlist_id
      and p.owner_id = auth.uid()
    )
  );

-- PLAYLIST SHARES
create policy "Users can view shares they created or received"
  on playlist_shares for select
  using (
    shared_by = auth.uid()
    or shared_with = auth.uid()
    or share_token is not null
  );

create policy "Playlist owners can create shares"
  on playlist_shares for insert
  with check (
    shared_by = auth.uid()
    and exists (
      select 1 from playlists p
      where p.id = playlist_shares.playlist_id
      and p.owner_id = auth.uid()
    )
  );

create policy "Playlist owners can delete shares"
  on playlist_shares for delete
  using (
    shared_by = auth.uid()
  );
