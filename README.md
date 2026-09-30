# Slowed + Reverb Audio Player (PWA)

A privacy-first, client-side web application for creating slowed + reverb and sped-up versions of your own audio tracks, saving them into playlists, and playing them continuously with the phone screen off (including on ios & Android).

---

## Key Architecture & Design

1. **Audio Engine (100% Client-Side)**:
   - Uses Web Audio API for pitch-linked speed alterations (`AudioBufferSourceNode.playbackRate`).
   - Synthetic stereo impulse response generator for lush reverb without downloading external impulse files.
   - Real-time preview graph for instant parameter adjustment.
   - `OfflineAudioContext` for rendering exact recipes directly to 16-bit PCM WAV files.

2. **Screen-Off Playback (iPhone & Android)**:
   - Mobile browsers (Safari/Chrome) suspend live `AudioContext` graphs when the screen locks.
   - To bypass this limitation, the app plays rendered standalone WAV files via a single persistent `<audio>` element combined with the `Media Session API`, ensuring uninterrupted playback and lock-screen controls.

3. **Privacy & Legal Safety (Audio Stays On Device)**:
   - **User's Device (IndexedDB)**: Stores original uploaded MP3s and locally rendered WAV files.
   - **Server (Supabase Postgres)**: Stores user accounts, playlist definitions, and version *recipes* (speed, reverb parameters, track metadata). No copyrighted audio bytes are ever uploaded to the server.

---

## Project Structure

```
├── supabase/
│   └── schema.sql             # Complete Postgres schema with Row Level Security (RLS)
├── src/
│   ├── core/
│   │   ├── audio/
│   │   │   ├── types.ts            # Type definitions for recipes & reverb params
│   │   │   ├── decoder.ts          # Audio decoding (MP3, WAV, etc.)
│   │   │   ├── impulseResponse.ts  # Synthetic stereo IR generator
│   │   │   ├── wavEncoder.ts       # 16-bit PCM WAV encoder
│   │   │   ├── offlineRenderer.ts  # OfflineAudioContext rendering to WAV Blob
│   │   │   └── livePreview.ts      # Real-time Web Audio preview graph
│   │   └── supabase/
│   │       ├── client.ts           # Supabase client singleton
│   │       └── types.ts            # Database schema types
│   ├── main.ts                # Milestone 1 harness logic
│   └── vite-env.d.ts
├── tests/
│   └── audio/
│       ├── impulseResponse.test.ts # Tests for decay, pre-delay & stereo decorrelation
│       ├── offlineRenderer.test.ts # Tests for duration math
│       └── wavEncoder.test.ts      # Tests for RIFF/WAVE 44-byte headers & PCM samples
├── index.html                 # Functional debug harness
└── package.json
```

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Automated Tests
```bash
npm test
```
All unit tests run using Vitest to verify WAV headers, sample conversions, synthetic impulse response math, and duration calculations.

### 3. Run Development Server
```bash
npm run dev
```
The server will start with `--host` enabled, allowing you to access it from your iPhone 15 or Android device on the same local Wi-Fi network.

### 4. Supabase Setup (Optional for M1, Required for M2+)
1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in your Supabase dashboard and run the contents of [`supabase/schema.sql`](supabase/schema.sql).
3. Copy `.env.example` to `.env` and fill in your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key-here
   ```
*(Note: Milestone 1 audio processing and offline rendering functions 100% locally even without Supabase credentials configured.)*

---

## Milestone 1 Acceptance Criteria

- [x] Vite + TypeScript setup with Vitest and PWA support.
- [x] Supabase schema with RLS policies created in `supabase/schema.sql`.
- [x] Audio Core engine implemented (`decoder`, `impulseResponse`, `offlineRenderer`, `wavEncoder`, `livePreview`).
- [x] Unit test suite passing for render duration math, synthetic IR generation, and WAV headers.
- [x] Functional debug harness in `index.html` allowing audio upload, real-time slider preview, presets, and offline WAV rendering.
- [x] Zero client-bundle secret leaks verified.
