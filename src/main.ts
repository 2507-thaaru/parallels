import { decodeAudioBlob } from './core/audio/decoder';
import { LivePreviewEngine, LivePreviewState } from './core/audio/livePreview';
import { renderAudioRecipe } from './core/audio/offlineRenderer';
import { AudioRecipe } from './core/audio/types';
import {
  saveRenderedSong,
  getAllRenderedSongs,
  deleteRenderedSong,
  RenderedSongRecord,
} from './core/storage/db';
import { SilkShaderRenderer } from './core/visuals/silkShader';

// 1. Initialize Animated WebGL1 "Silk" Flow Shader Background
const canvas = document.getElementById('shaderCanvas') as HTMLCanvasElement;
const silkRenderer = new SilkShaderRenderer(canvas);
silkRenderer.start();

window.addEventListener('resize', () => {
  silkRenderer.resize();
});

// 2. Audio Engines & State
const previewEngine = new LivePreviewEngine();
const persistentAudio = document.getElementById('persistentAudioElement') as HTMLAudioElement;

let currentSourceBuffer: AudioBuffer | null = null;
let currentSongTitle = 'No Song Selected';
let currentPlayingId: string | null = null;
let isPlayingNativeAudio = false;

// 3. DOM Elements
const audioFileInput = document.getElementById('audioFileInput') as HTMLInputElement;
const currentTrackTitle = document.getElementById('currentTrackTitle') as HTMLHeadingElement;
const currentTrackSubtitle = document.getElementById('currentTrackSubtitle') as HTMLParagraphElement;
const controlsPanel = document.getElementById('controlsPanel') as HTMLElement;
const playToggleBtn = document.getElementById('playToggleBtn') as HTMLButtonElement;
const playIcon = document.getElementById('playIcon') as HTMLElement;
const pauseIcon = document.getElementById('pauseIcon') as HTMLElement;
const waveBars = document.getElementById('waveBars') as HTMLElement;
const seekSlider = document.getElementById('seekSlider') as HTMLInputElement;
const currentTimeLabel = document.getElementById('currentTimeLabel') as HTMLElement;
const durationLabel = document.getElementById('durationLabel') as HTMLElement;
const btnLoop = document.getElementById('btnLoop') as HTMLButtonElement;
const loopLabel = document.getElementById('loopLabel') as HTMLElement;
const btnSavePlaylist = document.getElementById('btnSavePlaylist') as HTMLButtonElement;
const saveBtnLabel = document.getElementById('saveBtnLabel') as HTMLElement;
const playlistContainer = document.getElementById('playlistContainer') as HTMLElement;
const playlistCount = document.getElementById('playlistCount') as HTMLElement;
const recipeBadge = document.getElementById('recipeBadge') as HTMLElement;

// Sliders & Readouts
const speedSlider = document.getElementById('speedSlider') as HTMLInputElement;
const speedReadout = document.getElementById('speedReadout') as HTMLElement;
const reverbWetSlider = document.getElementById('reverbWetSlider') as HTMLInputElement;
const wetReadout = document.getElementById('wetReadout') as HTMLElement;
const reverbDecaySlider = document.getElementById('reverbDecaySlider') as HTMLInputElement;
const decayReadout = document.getElementById('decayReadout') as HTMLElement;
const reverbPredelaySlider = document.getElementById('reverbPredelaySlider') as HTMLInputElement;
const predelayReadout = document.getElementById('predelayReadout') as HTMLElement;

// Preset chips
const chipSlowed = document.getElementById('chipSlowed') as HTMLButtonElement;
const chipDeepSlow = document.getElementById('chipDeepSlow') as HTMLButtonElement;
const chipSpedUp = document.getElementById('chipSpedUp') as HTMLButtonElement;
const chipNightcore = document.getElementById('chipNightcore') as HTMLButtonElement;
const chipOriginal = document.getElementById('chipOriginal') as HTMLButtonElement;
const allChips = [chipSlowed, chipDeepSlow, chipSpedUp, chipNightcore, chipOriginal];

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// 4. Setup Media Session API for persistent lock-screen audio playback
function setupMediaSession(title: string, artist = 'parallels') {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: 'parallels (slowed & reverb)',
      artwork: [
        { src: '/ref-041.png', sizes: '512x512', type: 'image/png' }
      ]
    });

    navigator.mediaSession.setActionHandler('play', () => {
      togglePlayback();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      togglePlayback();
    });
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined && persistentAudio.duration) {
        persistentAudio.currentTime = details.seekTime;
      }
    });
  }
}

// 5. UI Update Helpers
function updatePlayToggleUI(isPlaying: boolean) {
  if (isPlaying) {
    playToggleBtn.classList.add('playing');
    playIcon.style.display = 'none';
    pauseIcon.style.display = 'block';
    waveBars.style.display = 'flex';
  } else {
    playToggleBtn.classList.remove('playing');
    playIcon.style.display = 'block';
    pauseIcon.style.display = 'none';
    waveBars.style.display = 'none';
  }
}

function updateBadge() {
  const speed = parseFloat(speedSlider.value);
  const wet = parseFloat(reverbWetSlider.value);
  let text = '';
  if (speed < 0.99) {
    text = `${speed.toFixed(2)}x slowed`;
  } else if (speed > 1.01) {
    text = `${speed.toFixed(2)}x sped-up`;
  } else {
    text = '1.00x original';
  }
  if (wet > 0.05) {
    text += ' + reverb';
  }
  recipeBadge.textContent = text;
}

function syncInputsToEngine() {
  const speed = parseFloat(speedSlider.value);
  const wet = parseFloat(reverbWetSlider.value);
  const decay = parseFloat(reverbDecaySlider.value);
  const predelay = parseFloat(reverbPredelaySlider.value);

  speedReadout.textContent = `${speed.toFixed(2)}x`;
  wetReadout.textContent = wet.toFixed(2);
  decayReadout.textContent = `${decay.toFixed(1)}s`;
  predelayReadout.textContent = `${predelay}ms`;

  updateBadge();

  previewEngine.setSpeed(speed);
  previewEngine.setReverbParams({
    wet,
    decaySeconds: decay,
    predelayMs: predelay,
    lowpassHz: 6000,
  });
}

function applyPreset(speed: number, wet: number, decay: number, predelay: number, activeChip: HTMLButtonElement) {
  speedSlider.value = speed.toString();
  reverbWetSlider.value = wet.toString();
  reverbDecaySlider.value = decay.toString();
  reverbPredelaySlider.value = predelay.toString();

  allChips.forEach(chip => chip.classList.remove('active'));
  activeChip.classList.add('active');

  syncInputsToEngine();
}

// 6. Event Listeners for Sliders & Presets
[speedSlider, reverbWetSlider, reverbDecaySlider, reverbPredelaySlider].forEach(slider => {
  slider.addEventListener('input', () => {
    allChips.forEach(chip => chip.classList.remove('active'));
    syncInputsToEngine();
  });
});

chipSlowed.addEventListener('click', () => applyPreset(0.85, 0.45, 2.8, 20, chipSlowed));
chipDeepSlow.addEventListener('click', () => applyPreset(0.75, 0.60, 4.2, 30, chipDeepSlow));
chipSpedUp.addEventListener('click', () => applyPreset(1.25, 0.00, 1.0, 0, chipSpedUp));
chipNightcore.addEventListener('click', () => applyPreset(1.35, 0.00, 1.0, 0, chipNightcore));
chipOriginal.addEventListener('click', () => applyPreset(1.00, 0.00, 1.0, 0, chipOriginal));

// 7. Handle File Upload
audioFileInput.addEventListener('change', async () => {
  const file = audioFileInput.files?.[0];
  if (!file) return;

  currentSongTitle = file.name.replace(/\.[^/.]+$/, '');
  currentTrackTitle.textContent = currentSongTitle;
  currentTrackSubtitle.textContent = `Decoding "${file.name}"...`;

  try {
    const buffer = await decodeAudioBlob(file);
    currentSourceBuffer = buffer;
    currentPlayingId = null;
    isPlayingNativeAudio = false;

    // Stop native audio if playing
    persistentAudio.pause();

    previewEngine.setAudioBuffer(buffer);

    currentTrackSubtitle.textContent = `${formatTime(buffer.duration)} • ${buffer.numberOfChannels === 2 ? 'Stereo' : 'Mono'} ${buffer.sampleRate}Hz`;

    controlsPanel.style.opacity = '1';
    controlsPanel.style.pointerEvents = 'auto';
    btnSavePlaylist.disabled = false;

    seekSlider.max = buffer.duration.toString();
    durationLabel.textContent = formatTime(buffer.duration);

    syncInputsToEngine();
    updatePlayToggleUI(false);
  } catch (err) {
    currentTrackSubtitle.textContent = `Error loading audio: ${(err as Error).message}`;
  }
});

// 8. Playback Logic (supports both Live Preview and Persistent Rendered Audio for screen-off)
function togglePlayback() {
  if (isPlayingNativeAudio) {
    if (persistentAudio.paused) {
      persistentAudio.play();
      updatePlayToggleUI(true);
    } else {
      persistentAudio.pause();
      updatePlayToggleUI(false);
    }
    return;
  }

  // Otherwise, toggling live preview engine
  if (!currentSourceBuffer) {
    audioFileInput.click();
    return;
  }

  const state = previewEngine.getState();
  if (state.isPlaying) {
    previewEngine.pause();
  } else {
    previewEngine.play();
  }
}

playToggleBtn.addEventListener('click', togglePlayback);

// Loop toggle
btnLoop.addEventListener('click', () => {
  if (isPlayingNativeAudio) {
    persistentAudio.loop = !persistentAudio.loop;
    btnLoop.classList.toggle('active', persistentAudio.loop);
    loopLabel.textContent = persistentAudio.loop ? 'Loop: ON' : 'Loop';
  } else {
    const nextLoop = !previewEngine.getState().isLooping;
    previewEngine.setLoop(nextLoop);
    btnLoop.classList.toggle('active', nextLoop);
    loopLabel.textContent = nextLoop ? 'Loop: ON' : 'Loop';
  }
});

// Scrubber events
let isUserSeeking = false;
seekSlider.addEventListener('mousedown', () => { isUserSeeking = true; });
seekSlider.addEventListener('touchstart', () => { isUserSeeking = true; });

seekSlider.addEventListener('input', () => {
  currentTimeLabel.textContent = formatTime(parseFloat(seekSlider.value));
});

seekSlider.addEventListener('change', () => {
  const targetTime = parseFloat(seekSlider.value);
  if (isPlayingNativeAudio) {
    persistentAudio.currentTime = targetTime;
  } else {
    previewEngine.seek(targetTime);
  }
  isUserSeeking = false;
});

seekSlider.addEventListener('mouseup', () => { isUserSeeking = false; });
seekSlider.addEventListener('touchend', () => { isUserSeeking = false; });

// Live preview engine state sync
previewEngine.subscribe((state: LivePreviewState) => {
  if (!isPlayingNativeAudio) {
    updatePlayToggleUI(state.isPlaying);
    if (!isUserSeeking && state.duration > 0) {
      seekSlider.value = state.currentTime.toString();
      currentTimeLabel.textContent = formatTime(state.currentTime);
      durationLabel.textContent = formatTime(state.duration);
    }
  }
});

// Persistent native audio state sync (for screen-off playback)
persistentAudio.addEventListener('timeupdate', () => {
  if (isPlayingNativeAudio && !isUserSeeking) {
    seekSlider.value = persistentAudio.currentTime.toString();
    currentTimeLabel.textContent = formatTime(persistentAudio.currentTime);
    durationLabel.textContent = formatTime(persistentAudio.duration || 0);
  }
});

persistentAudio.addEventListener('ended', () => {
  if (isPlayingNativeAudio && !persistentAudio.loop) {
    updatePlayToggleUI(false);
  }
});

// 9. Save to Playlist (renders recipe to WAV and persists to IndexedDB)
btnSavePlaylist.addEventListener('click', async () => {
  if (!currentSourceBuffer) return;

  btnSavePlaylist.disabled = true;
  saveBtnLabel.textContent = 'Rendering WAV...';

  try {
    const recipe: AudioRecipe = previewEngine.getRecipe();
    const result = await renderAudioRecipe(currentSourceBuffer, recipe);

    const versionId = 'v_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const newSong: RenderedSongRecord = {
      id: versionId,
      trackId: 'track_' + Date.now(),
      title: currentSongTitle,
      recipe,
      renderedBlob: result.blob,
      renderedDurationSec: result.durationSec,
      createdAt: Date.now(),
    };

    await saveRenderedSong(newSong);
    saveBtnLabel.textContent = 'Saved to Playlist!';
    await loadPlaylistView();

    setTimeout(() => {
      saveBtnLabel.textContent = 'Save to Playlist';
      btnSavePlaylist.disabled = false;
    }, 2000);
  } catch (err) {
    saveBtnLabel.textContent = 'Failed';
    console.error('Failed to save rendered song', err);
    setTimeout(() => {
      saveBtnLabel.textContent = 'Save to Playlist';
      btnSavePlaylist.disabled = false;
    }, 2000);
  }
});

// 10. Playlist View & Screen-Off Playback Integration
async function playSavedSong(song: RenderedSongRecord) {
  // Pause any live preview
  previewEngine.stop();

  isPlayingNativeAudio = true;
  currentPlayingId = song.id;

  const objectUrl = URL.createObjectURL(song.renderedBlob);
  persistentAudio.src = objectUrl;

  currentTrackTitle.textContent = song.title;
  currentTrackSubtitle.textContent = `Playing from playlist • Screen-off supported`;
  durationLabel.textContent = formatTime(song.renderedDurationSec);
  seekSlider.max = song.renderedDurationSec.toString();

  // Update speed/reverb sliders to match this song's recipe
  speedSlider.value = song.recipe.speed.toString();
  speedReadout.textContent = `${song.recipe.speed.toFixed(2)}x`;
  if (song.recipe.reverb) {
    reverbWetSlider.value = song.recipe.reverb.wet.toString();
    wetReadout.textContent = song.recipe.reverb.wet.toFixed(2);
    reverbDecaySlider.value = song.recipe.reverb.decaySeconds.toString();
    decayReadout.textContent = `${song.recipe.reverb.decaySeconds.toFixed(1)}s`;
    reverbPredelaySlider.value = song.recipe.reverb.predelayMs.toString();
    predelayReadout.textContent = `${song.recipe.reverb.predelayMs}ms`;
  }
  updateBadge();

  setupMediaSession(song.title);

  try {
    await persistentAudio.play();
    updatePlayToggleUI(true);
  } catch (e) {
    console.warn('Playback initiation requires user interaction', e);
  }

  renderPlaylistItems(await getAllRenderedSongs());
}

function renderPlaylistItems(songs: RenderedSongRecord[]) {
  playlistCount.textContent = `${songs.length} song${songs.length === 1 ? '' : 's'} saved on this device`;

  if (songs.length === 0) {
    playlistContainer.innerHTML = `
      <div class="playlist-empty">
        No songs saved in your playlist yet. Upload an audio track, tweak speed & reverb, and hit "Save to Playlist"!
      </div>
    `;
    return;
  }

  playlistContainer.innerHTML = '';
  songs.forEach((song) => {
    const item = document.createElement('div');
    item.className = `playlist-item ${currentPlayingId === song.id ? 'active-item' : ''}`;

    const speed = song.recipe.speed;
    const speedTag = speed < 1.0 ? `${speed.toFixed(2)}x slowed` : (speed > 1.0 ? `${speed.toFixed(2)}x sped` : '1.00x');
    const reverbTag = song.recipe.reverb && song.recipe.reverb.wet > 0 ? ` • ${song.recipe.reverb.decaySeconds.toFixed(1)}s reverb` : '';

    item.innerHTML = `
      <div class="song-info">
        <button class="song-play-mini" title="Play">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="6 3 20 12 6 21 6 3"></polygon>
          </svg>
        </button>
        <div class="song-titles">
          <div class="song-title-text">${song.title}</div>
          <div class="song-meta-text">
            <span class="badge-tag">${speedTag}${reverbTag}</span>
          </div>
        </div>
      </div>
      <div class="song-actions">
        <span class="song-duration">${formatTime(song.renderedDurationSec)}</span>
        <button class="btn-icon-delete" title="Delete song">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;

    const playBtn = item.querySelector('.song-play-mini') as HTMLButtonElement;
    playBtn.addEventListener('click', () => {
      playSavedSong(song);
    });

    const deleteBtn = item.querySelector('.btn-icon-delete') as HTMLButtonElement;
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Remove "${song.title}" from playlist?`)) {
        if (currentPlayingId === song.id) {
          persistentAudio.pause();
          updatePlayToggleUI(false);
          currentPlayingId = null;
        }
        await deleteRenderedSong(song.id);
        await loadPlaylistView();
      }
    });

    playlistContainer.appendChild(item);
  });
}

async function loadPlaylistView() {
  const songs = await getAllRenderedSongs();
  renderPlaylistItems(songs);
}

// Initial load of saved playlist on page mount
loadPlaylistView();
