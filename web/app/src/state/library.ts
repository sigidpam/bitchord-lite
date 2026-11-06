import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AlbumRef, ArtistRef, Track } from '@/data/music/types';

/**
 * The device's own library: songs the listener starred and albums/playlists
 * they saved. It works signed out, which is the native build's state, and is
 * the source of truth for the UI. When a YouTube session exists, the favorite
 * and save actions are mirrored to the account as well.
 *
 * Albums and playlists are stored as links plus display metadata; their
 * tracks are fetched when opened, so the library stays current.
 */
export interface SavedSong {
  videoId: string;
  title: string;
  artists: ArtistRef[];
  album: AlbumRef | null;
  durationSec: number | null;
  explicit: boolean;
  thumbnail: string | null;
  addedAt: number;
}

export interface SavedCollection {
  kind: 'album' | 'playlist';
  /** The album browse id or playlist id the page opens with. */
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  thumbnail: string | null;
  artists: ArtistRef[];
  addedAt: number;
}

type SavedCollectionInput = Omit<SavedCollection, 'addedAt'>;
type SavedSongInput = Omit<SavedSong, 'addedAt'>;

interface LibraryState {
  songs: SavedSong[];
  albums: SavedCollection[];
  playlists: SavedCollection[];
  favoriteSong: (song: SavedSongInput) => void;
  unfavoriteSong: (videoId: string) => void;
  saveCollection: (collection: SavedCollectionInput) => void;
  removeCollection: (kind: SavedCollection['kind'], id: string) => void;
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set) => ({
      songs: [],
      albums: [],
      playlists: [],

      favoriteSong: (song) =>
        set((state) =>
          state.songs.some((s) => s.videoId === song.videoId)
            ? state
            : { songs: [{ ...song, addedAt: Date.now() }, ...state.songs] },
        ),

      unfavoriteSong: (videoId) =>
        set((state) => ({ songs: state.songs.filter((s) => s.videoId !== videoId) })),

      saveCollection: (collection) =>
        set((state) => {
          if (collection.kind === 'album') {
            return state.albums.some((c) => c.id === collection.id)
              ? state
              : { albums: [{ ...collection, addedAt: Date.now() }, ...state.albums] };
          }
          return state.playlists.some((c) => c.id === collection.id)
            ? state
            : { playlists: [{ ...collection, addedAt: Date.now() }, ...state.playlists] };
        }),

      removeCollection: (kind, id) =>
        set((state) =>
          kind === 'album'
            ? { albums: state.albums.filter((c) => c.id !== id) }
            : { playlists: state.playlists.filter((c) => c.id !== id) },
        ),
    }),
    {
      name: 'bitchord:library:v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** A queue track's fields, reduced to what the library stores. */
export function savedSongOf(track: Track): SavedSongInput {
  return {
    videoId: track.videoId,
    title: track.title,
    artists: track.artists,
    album: track.album,
    durationSec: track.durationSec,
    explicit: track.explicit,
    thumbnail: track.thumbnail,
  };
}

/** A stored song as a queue track (the fields a list needs, with none of YouTube's row extras). */
export function trackOfSong(song: SavedSong): Track {
  return {
    videoId: song.videoId,
    title: song.title,
    artists: song.artists,
    album: song.album,
    durationSec: song.durationSec,
    explicit: song.explicit,
    thumbnail: song.thumbnail,
    index: null,
    plays: null,
  };
}

/**
 * A queue track for the currently playing song when its queue row is missing
 * (for example a one-off track restored from a previous session). Only the
 * fields the favorite action needs are available.
 */
export function trackFromNowPlaying(nowPlaying: {
  videoId: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  durationSec: number;
}): Track {
  return {
    videoId: nowPlaying.videoId,
    title: nowPlaying.title,
    artists: nowPlaying.artist ? [{ name: nowPlaying.artist, id: null }] : [],
    album: null,
    durationSec: nowPlaying.durationSec > 0 ? nowPlaying.durationSec : null,
    explicit: false,
    thumbnail: nowPlaying.artworkUrl,
    index: null,
    plays: null,
  };
}

// For browser-driven tests, next to __bcPlayer and __bcUi.
if (import.meta.env.DEV) Object.assign(window, { __bcLibrary: useLibrary });
