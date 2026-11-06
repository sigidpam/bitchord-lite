import { useSetLiked, useSignedIn } from '@/data/music/queries';
import type { Track } from '@/data/music/types';
import { savedSongOf, useLibrary } from '@/state/library';

/**
 * Favorite state for one track. The device library is authoritative, so the
 * star works signed out. When a YouTube session exists, the same action is
 * mirrored to the account's liked songs; a failed mirror leaves the local
 * favorite in place.
 */
export function useFavorite(track: Track | null) {
  const saved = useLibrary((state) =>
    track ? state.songs.some((song) => song.videoId === track.videoId) : false,
  );
  const favoriteSong = useLibrary((state) => state.favoriteSong);
  const unfavoriteSong = useLibrary((state) => state.unfavoriteSong);
  const signedIn = useSignedIn();
  const setLiked = useSetLiked();

  const toggle = () => {
    if (!track) return;
    if (saved) {
      unfavoriteSong(track.videoId);
      if (signedIn) setLiked.mutate({ videoId: track.videoId, liked: false });
    } else {
      favoriteSong(savedSongOf(track));
      if (signedIn) setLiked.mutate({ videoId: track.videoId, liked: true });
    }
  };

  return { saved, toggle };
}
