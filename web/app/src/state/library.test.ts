// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Track } from '@/data/music/types';
import { savedSongOf, trackOfSong, useLibrary } from './library';

function track(videoId: string, title: string): Track {
  return {
    videoId,
    title,
    artists: [{ name: 'Artist', id: 'UCartist' }],
    album: { name: 'Album', id: 'MPREb_album' },
    durationSec: 200,
    explicit: false,
    thumbnail: 'https://example.test/cover.jpg',
    index: null,
    plays: null,
  };
}

beforeEach(() => {
  localStorage.clear();
  useLibrary.setState({ songs: [], albums: [], playlists: [] });
});

describe('device library', () => {
  it('favorites a song once and keeps the newest first', () => {
    const state = useLibrary.getState();
    state.favoriteSong(savedSongOf(track('a', 'First')));
    state.favoriteSong(savedSongOf(track('a', 'First again')));
    state.favoriteSong(savedSongOf(track('b', 'Second')));

    const songs = useLibrary.getState().songs;
    expect(songs).toHaveLength(2);
    expect(songs.map((song) => song.videoId)).toEqual(['b', 'a']);
    expect(songs[1]?.title).toBe('First');
  });

  it('removes a favorite', () => {
    const state = useLibrary.getState();
    state.favoriteSong(savedSongOf(track('a', 'First')));
    state.unfavoriteSong('a');
    expect(useLibrary.getState().songs).toHaveLength(0);
  });

  it('saves albums and playlists separately, once each, and removes them', () => {
    const state = useLibrary.getState();
    const album = {
      kind: 'album' as const,
      id: 'MPREb_album',
      title: 'Album',
      subtitle: 'Album • 2020',
      meta: '10 songs',
      thumbnail: null,
      artists: [],
    };
    const playlist = {
      kind: 'playlist' as const,
      id: 'VLplaylist',
      title: 'Playlist',
      subtitle: 'Playlist',
      meta: '12 songs',
      thumbnail: null,
      artists: [],
    };

    state.saveCollection(album);
    state.saveCollection(album);
    state.saveCollection(playlist);
    expect(useLibrary.getState().albums).toHaveLength(1);
    expect(useLibrary.getState().playlists).toHaveLength(1);

    state.removeCollection('album', album.id);
    expect(useLibrary.getState().albums).toHaveLength(0);
    expect(useLibrary.getState().playlists).toHaveLength(1);
  });

  it('maps a stored song back to a queue track', () => {
    const saved = savedSongOf(track('a', 'First'));
    const queued = trackOfSong({ ...saved, addedAt: 1 });
    expect(queued.videoId).toBe('a');
    expect(queued.title).toBe('First');
    expect(queued.index).toBeNull();
    expect(queued.plays).toBeNull();
  });

  it('persists the library to local storage', () => {
    useLibrary.getState().favoriteSong(savedSongOf(track('a', 'First')));
    expect(localStorage.getItem('bitchord:library:v1')).toContain('"videoId":"a"');
  });
});
