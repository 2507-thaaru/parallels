export interface ProfileRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
}

export interface TrackRow {
  id: string;
  owner_id: string;
  title: string;
  artist: string | null;
  duration_seconds: number | null;
  created_at: string;
}

export interface VersionRow {
  id: string;
  track_id: string;
  owner_id: string;
  name: string;
  speed: number;
  reverb_wet: number | null;
  reverb_decay_seconds: number | null;
  reverb_predelay_ms: number | null;
  reverb_lowpass_hz: number | null;
  created_at: string;
}

export interface PlaylistRow {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
}

export interface PlaylistItemRow {
  id: string;
  playlist_id: string;
  version_id: string;
  position: number;
}

export interface PlaylistShareRow {
  id: string;
  playlist_id: string;
  shared_by: string;
  shared_with: string | null;
  share_token: string | null;
  created_at: string;
}
