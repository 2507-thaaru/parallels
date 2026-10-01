import { decodeAudioBlob } from './core/audio/decoder';
import { LivePreviewEngine } from './core/audio/livePreview';
import { renderAudioRecipe } from './core/audio/offlineRenderer';
import { AudioRecipe } from './core/audio/types';
import {
  saveRenderedSong,
  getAllRenderedSongs,
  deleteRenderedSong,
  RenderedSongRecord,
} from './core/storage/db';
import { SilkShaderRenderer } from './core/visuals/silkShader';
import { authManager } from './core/auth/authManager';

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

const heroUploadArea = document.getElementById('heroUploadArea');
if (heroUploadArea) {
  heroUploadArea.addEventListener('click', () => {
    audioFileInput.click();
  });
}

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

// iOS Audio Session Unlocker
let isIOSAudioUnlocked = false;
function unlockIOSAudio() {
  const ctx = previewEngine.getAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  if (isIOSAudioUnlocked) return;
  isIOSAudioUnlocked = true;

  try {
    const silentBuf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = silentBuf;
    src.connect(ctx.destination);
    src.start(0);
  } catch {}
}

['touchstart', 'touchend', 'pointerdown', 'click'].forEach(evt => {
  document.addEventListener(evt, unlockIOSAudio, { passive: true });
});

// Native Background Audio Engine (Spotify-style background & screen-off playback)
let currentRenderedBlob: Blob | null = null;
let currentRenderedUrl: string | null = null;
let currentRecipeHash: string = '';
let isRenderingNativeAudio = false;

function getRecipeHash(title: string, recipe: AudioRecipe): string {
  const r = recipe.reverb;
  return `${title}|${recipe.speed.toFixed(2)}|${r ? `${r.wet.toFixed(2)}-${r.decaySeconds.toFixed(1)}-${r.predelayMs}` : 'none'}`;
}

async function prepareAndPlayNativeAudio(resumeTime?: number) {
  if (!currentSourceBuffer) return;

  const recipe = previewEngine.getRecipe();
  const hash = getRecipeHash(currentSongTitle, recipe);

  // If already rendered with current recipe
  if (currentRenderedUrl && currentRecipeHash === hash && persistentAudio.src === currentRenderedUrl) {
    if (resumeTime !== undefined && !isNaN(resumeTime)) {
      persistentAudio.currentTime = resumeTime;
    }
    setupMediaSession(currentSongTitle);
    await persistentAudio.play();
    updatePlayToggleUI(true);
    isPlayingNativeAudio = true;
    currentTrackSubtitle.textContent = `Screen-off & background playback active`;
    return;
  }

  // Render to native WAV for continuous background playback
  isRenderingNativeAudio = true;
  currentTrackSubtitle.textContent = `Preparing Spotify-style background audio...`;

  try {
    const result = await renderAudioRecipe(currentSourceBuffer, recipe);
    currentRenderedBlob = result.blob;
    currentRenderedUrl = result.objectUrl;
    currentRecipeHash = hash;

    persistentAudio.src = result.objectUrl;
    persistentAudio.loop = btnLoop.classList.contains('active');
    durationLabel.textContent = formatTime(result.durationSec);
    seekSlider.max = result.durationSec.toString();

    if (resumeTime !== undefined && !isNaN(resumeTime) && resumeTime < result.durationSec) {
      persistentAudio.currentTime = resumeTime;
    }

    setupMediaSession(currentSongTitle);
    await persistentAudio.play();
    updatePlayToggleUI(true);
    isPlayingNativeAudio = true;
    currentTrackSubtitle.textContent = `Screen-off & background playback active`;
  } catch (err) {
    console.error('Error rendering audio', err);
    currentTrackSubtitle.textContent = `Error: ${(err as Error).message}`;
  } finally {
    isRenderingNativeAudio = false;
  }
}

// 8. Playback Logic (Supports Spotify-style background & screen-off playback)
async function togglePlayback() {
  unlockIOSAudio();

  if (!currentSourceBuffer) {
    audioFileInput.click();
    return;
  }

  if (isRenderingNativeAudio) return;

  if (isPlayingNativeAudio && persistentAudio.src) {
    const recipe = previewEngine.getRecipe();
    const hash = getRecipeHash(currentSongTitle, recipe);

    // If recipe hasn't changed, toggle play / pause
    if (currentRecipeHash === hash) {
      if (persistentAudio.paused) {
        setupMediaSession(currentSongTitle);
        await persistentAudio.play();
        updatePlayToggleUI(true);
      } else {
        persistentAudio.pause();
        updatePlayToggleUI(false);
      }
      return;
    }
  }

  // Recipe changed or first play: render and play native audio
  await prepareAndPlayNativeAudio(persistentAudio.currentTime || 0);
}

playToggleBtn.addEventListener('click', togglePlayback);

// When slider changes are committed, update background audio if playing
[speedSlider, reverbWetSlider, reverbDecaySlider, reverbPredelaySlider].forEach(slider => {
  slider.addEventListener('change', () => {
    if (isPlayingNativeAudio && !persistentAudio.paused) {
      const pos = persistentAudio.currentTime;
      prepareAndPlayNativeAudio(pos);
    }
  });
});

// Loop toggle (works with screen locked)
btnLoop.addEventListener('click', () => {
  persistentAudio.loop = !persistentAudio.loop;
  btnLoop.classList.toggle('active', persistentAudio.loop);
  loopLabel.textContent = persistentAudio.loop ? 'Loop: ON' : 'Loop';
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
  if (persistentAudio.src) {
    persistentAudio.currentTime = targetTime;
  }
  isUserSeeking = false;
});

seekSlider.addEventListener('mouseup', () => { isUserSeeking = false; });
seekSlider.addEventListener('touchend', () => { isUserSeeking = false; });

// Persistent native audio state sync (for Spotify-style screen-off playback)
persistentAudio.addEventListener('play', () => {
  updatePlayToggleUI(true);
});

persistentAudio.addEventListener('pause', () => {
  updatePlayToggleUI(false);
});

persistentAudio.addEventListener('timeupdate', () => {
  if (!isUserSeeking && persistentAudio.duration) {
    seekSlider.value = persistentAudio.currentTime.toString();
    currentTimeLabel.textContent = formatTime(persistentAudio.currentTime);
    durationLabel.textContent = formatTime(persistentAudio.duration || 0);

    if ('setPositionState' in navigator.mediaSession && !isNaN(persistentAudio.duration)) {
      try {
        navigator.mediaSession.setPositionState({
          duration: persistentAudio.duration,
          playbackRate: 1.0,
          position: Math.min(persistentAudio.currentTime, persistentAudio.duration),
        });
      } catch {}
    }
  }
});

persistentAudio.addEventListener('ended', async () => {
  if (persistentAudio.loop) return;

  // Auto-advance playlist
  const activeAccount = authManager.getActiveAccount();
  const songs = await getAllRenderedSongs(activeAccount?.id);
  if (songs.length > 0) {
    const curIdx = songs.findIndex(s => s.id === currentPlayingId);
    if (curIdx !== -1 && curIdx < songs.length - 1) {
      playSavedSong(songs[curIdx + 1]);
      return;
    }
  }
  updatePlayToggleUI(false);
});

// 9. Save to Playlist (persists to IndexedDB for offline access)
btnSavePlaylist.addEventListener('click', async () => {
  if (!currentSourceBuffer) return;

  btnSavePlaylist.disabled = true;
  saveBtnLabel.textContent = 'Saving to Playlist...';

  try {
    const recipe: AudioRecipe = previewEngine.getRecipe();
    let blobToSave = currentRenderedBlob;
    let durToSave = persistentAudio.duration;

    const hash = getRecipeHash(currentSongTitle, recipe);
    if (!blobToSave || currentRecipeHash !== hash) {
      const result = await renderAudioRecipe(currentSourceBuffer, recipe);
      blobToSave = result.blob;
      durToSave = result.durationSec;
      currentRenderedBlob = result.blob;
      currentRenderedUrl = result.objectUrl;
      currentRecipeHash = hash;
    }

    const activeAccount = authManager.getActiveAccount();
    const versionId = 'v_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const newSong: RenderedSongRecord = {
      id: versionId,
      trackId: 'track_' + Date.now(),
      userId: activeAccount?.id,
      title: currentSongTitle,
      recipe,
      renderedBlob: blobToSave,
      renderedDurationSec: durToSave || currentSourceBuffer.duration,
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

  const activeAccount = authManager.getActiveAccount();
  renderPlaylistItems(await getAllRenderedSongs(activeAccount?.id));
}

function renderPlaylistItems(songs: RenderedSongRecord[]) {
  const activeAccount = authManager.getActiveAccount();
  const ownerLabel = activeAccount ? `for ${activeAccount.displayName}` : 'on this device';
  playlistCount.textContent = `${songs.length} song${songs.length === 1 ? '' : 's'} saved ${ownerLabel}`;

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
  const activeAccount = authManager.getActiveAccount();
  const songs = await getAllRenderedSongs(activeAccount?.id);
  renderPlaylistItems(songs);
}

// ==========================================
// 11. Multi-Account Management & Modal Wiring
// ==========================================
const accountBtn = document.getElementById('accountBtn') as HTMLButtonElement;
const accountAvatar = document.getElementById('accountAvatar') as HTMLElement;
const accountLabel = document.getElementById('accountLabel') as HTMLElement;
const accountModal = document.getElementById('accountModal') as HTMLElement;
const modalTitle = document.getElementById('modalTitle') as HTMLElement;
const closeModalBtn = document.getElementById('closeModalBtn') as HTMLButtonElement;
const closeModalActionBtn = document.getElementById('closeModalActionBtn') as HTMLButtonElement;
const loggedInView = document.getElementById('loggedInView') as HTMLElement;
const profileAvatarLarge = document.getElementById('profileAvatarLarge') as HTMLElement;
const profileName = document.getElementById('profileName') as HTMLElement;
const profileEmail = document.getElementById('profileEmail') as HTMLElement;
const savedAccountsList = document.getElementById('savedAccountsList') as HTMLElement;
const btnAddAccount = document.getElementById('btnAddAccount') as HTMLButtonElement;
const btnLogout = document.getElementById('btnLogout') as HTMLButtonElement;
const authFormView = document.getElementById('authFormView') as HTMLElement;
const tabLogin = document.getElementById('tabLogin') as HTMLButtonElement;
const tabSignup = document.getElementById('tabSignup') as HTMLButtonElement;
const authForm = document.getElementById('authForm') as HTMLFormElement;
const groupDisplayName = document.getElementById('groupDisplayName') as HTMLElement;
const inputDisplayName = document.getElementById('inputDisplayName') as HTMLInputElement;
const inputEmail = document.getElementById('inputEmail') as HTMLInputElement;
const inputPassword = document.getElementById('inputPassword') as HTMLInputElement;
const authErrorMsg = document.getElementById('authErrorMsg') as HTMLElement;
const btnSubmitAuth = document.getElementById('btnSubmitAuth') as HTMLButtonElement;
const authSavedAccountsBlock = document.getElementById('authSavedAccountsBlock') as HTMLElement;
const authSavedAccountsList = document.getElementById('authSavedAccountsList') as HTMLElement;

let authTab: 'login' | 'signup' = 'login';
let isShowingAddAccountForm = false;

function openAccountModal() {
  isShowingAddAccountForm = false;
  accountModal.style.display = 'flex';
  renderAccountModal();
}

function closeAccountModal() {
  accountModal.style.display = 'none';
  if (authErrorMsg) {
    authErrorMsg.style.display = 'none';
    authErrorMsg.textContent = '';
  }
  isShowingAddAccountForm = false;
}

function setAuthTab(tab: 'login' | 'signup') {
  authTab = tab;
  if (authErrorMsg) authErrorMsg.style.display = 'none';

  if (tab === 'login') {
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
    groupDisplayName.style.display = 'none';
    btnSubmitAuth.textContent = 'Log In';
    modalTitle.textContent = isShowingAddAccountForm ? 'Switch / Log In to Account' : 'Log In';
  } else {
    tabSignup.classList.add('active');
    tabLogin.classList.remove('active');
    groupDisplayName.style.display = 'block';
    btnSubmitAuth.textContent = 'Create Account';
    modalTitle.textContent = 'Create New Account';
  }
}

function renderAccountModal() {
  const activeAccount = authManager.getActiveAccount();
  const allAccounts = authManager.getSavedAccounts();

  // If user is currently logged in and not explicitly opening the add account form
  if (activeAccount && !isShowingAddAccountForm) {
    modalTitle.textContent = 'Your Account';
    loggedInView.style.display = 'block';
    authFormView.style.display = 'none';

    profileAvatarLarge.style.background = activeAccount.avatarGradient;
    profileAvatarLarge.textContent = activeAccount.displayName.charAt(0).toUpperCase();
    profileName.textContent = activeAccount.displayName;
    profileEmail.textContent = activeAccount.email;

    // Render list of other saved accounts
    const otherAccounts = allAccounts.filter((a) => a.id !== activeAccount.id);
    if (otherAccounts.length === 0) {
      savedAccountsList.innerHTML = `
        <div style="font-size: 0.85rem; color: var(--text-muted); padding: 8px 0; text-align: center;">
          No other accounts saved on this device.
        </div>
      `;
    } else {
      savedAccountsList.innerHTML = '';
      otherAccounts.forEach((acc) => {
        const item = document.createElement('div');
        item.className = 'saved-account-item';
        item.innerHTML = `
          <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
            <span class="account-avatar-mini" style="background: ${acc.avatarGradient}; flex-shrink: 0;">
              ${acc.displayName.charAt(0).toUpperCase()}
            </span>
            <div style="min-width: 0;">
              <div style="font-weight: 600; font-size: 0.9rem; color: #fff; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                ${acc.displayName}
              </div>
              <div style="font-size: 0.78rem; color: var(--text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                ${acc.email}
              </div>
            </div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center; flex-shrink: 0;">
            <button class="btn-switch-mini" data-switch-id="${acc.id}">Switch</button>
            <button class="btn-icon-delete" data-remove-id="${acc.id}" title="Remove from device" style="opacity: 0.6; padding: 4px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        `;

        const switchBtn = item.querySelector('[data-switch-id]') as HTMLButtonElement;
        switchBtn?.addEventListener('click', () => {
          authManager.switchAccount(acc.id);
          renderAccountModal();
        });

        const removeBtn = item.querySelector('[data-remove-id]') as HTMLButtonElement;
        removeBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`Remove "${acc.displayName}" from saved accounts?`)) {
            authManager.removeAccount(acc.id);
            renderAccountModal();
          }
        });

        savedAccountsList.appendChild(item);
      });
    }
  } else {
    // Show login or signup form
    loggedInView.style.display = 'none';
    authFormView.style.display = 'block';
    setAuthTab(authTab);

    // If there are accounts saved on device, show quick switcher below form
    if (allAccounts.length > 0) {
      authSavedAccountsBlock.style.display = 'block';
      authSavedAccountsList.innerHTML = '';
      allAccounts.forEach((acc) => {
        const isCurrent = activeAccount && acc.id === activeAccount.id;
        const item = document.createElement('div');
        item.className = `saved-account-item ${isCurrent ? 'active-account' : ''}`;
        item.innerHTML = `
          <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
            <span class="account-avatar-mini" style="background: ${acc.avatarGradient}; flex-shrink: 0;">
              ${acc.displayName.charAt(0).toUpperCase()}
            </span>
            <div style="min-width: 0;">
              <div style="font-weight: 600; font-size: 0.9rem; color: #fff; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                ${acc.displayName} ${isCurrent ? '<span style="font-size:0.75rem; color:#c084fc; margin-left:4px;">(Current)</span>' : ''}
              </div>
              <div style="font-size: 0.78rem; color: var(--text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                ${acc.email}
              </div>
            </div>
          </div>
          <div>
            ${!isCurrent ? `<button class="btn-switch-mini" data-switch-id="${acc.id}">Switch</button>` : ''}
          </div>
        `;

        const switchBtn = item.querySelector('[data-switch-id]') as HTMLButtonElement;
        switchBtn?.addEventListener('click', () => {
          authManager.switchAccount(acc.id);
          isShowingAddAccountForm = false;
          renderAccountModal();
        });

        authSavedAccountsList.appendChild(item);
      });
    } else {
      authSavedAccountsBlock.style.display = 'none';
    }
  }
}

// Listeners for Modal Interactions
accountBtn.addEventListener('click', openAccountModal);
closeModalBtn.addEventListener('click', closeAccountModal);
closeModalActionBtn.addEventListener('click', closeAccountModal);

accountModal.addEventListener('click', (e) => {
  if (e.target === accountModal) {
    closeAccountModal();
  }
});

tabLogin.addEventListener('click', () => setAuthTab('login'));
tabSignup.addEventListener('click', () => setAuthTab('signup'));

btnAddAccount.addEventListener('click', () => {
  isShowingAddAccountForm = true;
  renderAccountModal();
});

btnLogout.addEventListener('click', async () => {
  if (confirm('Log out from this account?')) {
    await authManager.logout();
    renderAccountModal();
  }
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authErrorMsg.style.display = 'none';
  authErrorMsg.textContent = '';

  const email = inputEmail.value.trim();
  const password = inputPassword.value;
  const displayName = inputDisplayName.value.trim();

  if (!email) {
    authErrorMsg.textContent = 'Please enter an email address.';
    authErrorMsg.style.display = 'block';
    return;
  }

  btnSubmitAuth.disabled = true;
  btnSubmitAuth.textContent = 'Please wait...';

  try {
    if (authTab === 'signup') {
      await authManager.createAccount(email, displayName, password);
    } else {
      await authManager.login(email, password);
    }

    inputEmail.value = '';
    inputPassword.value = '';
    inputDisplayName.value = '';
    isShowingAddAccountForm = false;
    closeAccountModal();
  } catch (err: any) {
    authErrorMsg.textContent = err?.message || 'Authentication error. Please try again.';
    authErrorMsg.style.display = 'block';
  } finally {
    btnSubmitAuth.disabled = false;
    btnSubmitAuth.textContent = authTab === 'login' ? 'Log In' : 'Create Account';
  }
});

// Subscribe to auth state updates: sync header button and reload playlist
authManager.subscribe((activeAccount) => {
  if (activeAccount) {
    accountAvatar.style.display = 'inline-flex';
    accountAvatar.style.background = activeAccount.avatarGradient;
    accountAvatar.textContent = activeAccount.displayName.charAt(0).toUpperCase();
    accountLabel.textContent = activeAccount.displayName;
  } else {
    accountAvatar.style.display = 'none';
    accountLabel.textContent = 'Log In';
  }
  loadPlaylistView();
});

