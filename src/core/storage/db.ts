import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { AudioRecipe } from '../audio/types';

export interface SourceAudioRecord {
  id: string; // matches track id
  filename: string;
  mimeType: string;
  blob: Blob;
  durationSec: number;
  uploadedAt: number;
}

export interface RenderedSongRecord {
  id: string; // unique version id
  trackId: string;
  userId?: string;
  title: string;
  artist?: string;
  recipe: AudioRecipe;
  renderedBlob: Blob;
  renderedDurationSec: number;
  createdAt: number;
}

interface ParallelsDB extends DBSchema {
  sources: {
    key: string;
    value: SourceAudioRecord;
    indexes: { 'by-date': number };
  };
  rendered_songs: {
    key: string;
    value: RenderedSongRecord;
    indexes: { 'by-date': number; 'by-track': string };
  };
}

const DB_NAME = 'parallels_music_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ParallelsDB>> | null = null;

export function getDatabase(): Promise<IDBPDatabase<ParallelsDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ParallelsDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('sources')) {
          const sourceStore = db.createObjectStore('sources', { keyPath: 'id' });
          sourceStore.createIndex('by-date', 'uploadedAt');
        }
        if (!db.objectStoreNames.contains('rendered_songs')) {
          const songStore = db.createObjectStore('rendered_songs', { keyPath: 'id' });
          songStore.createIndex('by-date', 'createdAt');
          songStore.createIndex('by-track', 'trackId');
        }
      },
    });

    // Request persistent storage on modern browsers
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {
        // Silently handle if storage persist is restricted
      });
    }
  }
  return dbPromise;
}

export async function saveSourceAudio(record: SourceAudioRecord): Promise<void> {
  const db = await getDatabase();
  await db.put('sources', record);
}

export async function getSourceAudio(id: string): Promise<SourceAudioRecord | undefined> {
  const db = await getDatabase();
  return db.get('sources', id);
}

export async function saveRenderedSong(record: RenderedSongRecord): Promise<void> {
  const db = await getDatabase();
  await db.put('rendered_songs', record);
}

export async function getAllRenderedSongs(userId?: string): Promise<RenderedSongRecord[]> {
  const db = await getDatabase();
  const songs = await db.getAllFromIndex('rendered_songs', 'by-date');
  const reversed = songs.reverse();
  if (userId) {
    return reversed.filter((s) => !s.userId || s.userId === userId);
  }
  return reversed;
}

export async function getRenderedSong(id: string): Promise<RenderedSongRecord | undefined> {
  const db = await getDatabase();
  return db.get('rendered_songs', id);
}

export async function deleteRenderedSong(id: string): Promise<void> {
  const db = await getDatabase();
  await db.delete('rendered_songs', id);
}
